from django.db.models import Q
from rest_framework import serializers, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission

from .models import AnneeScolaire, Classe, Eleve, Inscription


class ConfigEcoleView(APIView):
    """Marque blanche : lue par le front AVANT connexion pour afficher nom, logo et couleurs."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        ecole = request.tenant
        return Response({
            "nom": ecole.nom,
            "ville": ecole.ville,
            "logo_url": ecole.logo_url,
            "couleur_primaire": ecole.couleur_primaire,
            "couleur_secondaire": ecole.couleur_secondaire,
            "modules": ecole.modules_actifs(),
            "statut": ecole.statut,
            "lecture_seule": ecole.lecture_seule,
        })


class AnneeScolaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnneeScolaire
        fields = ["id", "libelle", "debut", "fin", "active"]


class ClasseSerializer(serializers.ModelSerializer):
    effectif = serializers.IntegerField(source="eleves.count", read_only=True)

    class Meta:
        model = Classe
        fields = ["id", "annee", "nom", "niveau", "effectif"]


class EleveSerializer(serializers.ModelSerializer):
    classe_nom = serializers.CharField(source="classe.nom", read_only=True, default=None)

    class Meta:
        model = Eleve
        fields = ["id", "matricule", "prenom", "nom", "sexe", "date_naissance", "classe", "classe_nom",
                  "telephone_parent", "actif"]
        read_only_fields = ["classe"]  # la classe courante se fixe par l'inscription

    def validate(self, attrs):
        if self.instance is None:
            forfait = self.context["request"].tenant.forfait
            if forfait and forfait.max_eleves is not None:
                if Eleve.objects.filter(actif=True).count() >= forfait.max_eleves:
                    raise serializers.ValidationError(
                        f"Limite de {forfait.max_eleves} élèves du forfait {forfait.nom} atteinte : "
                        "passez au forfait supérieur."
                    )
        return attrs


class BaseEcoleViewSet(viewsets.ModelViewSet):
    module_requis = Module.SCOLARITE
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "scolarite.parametrer")]


class AnneeScolaireViewSet(BaseEcoleViewSet):
    queryset = AnneeScolaire.objects.all()
    serializer_class = AnneeScolaireSerializer

    def perform_create(self, serializer):
        self._une_seule_active(serializer.save())

    def perform_update(self, serializer):
        self._une_seule_active(serializer.save())

    @staticmethod
    def _une_seule_active(annee):
        if annee.active:
            AnneeScolaire.objects.exclude(pk=annee.pk).update(active=False)


class ClasseViewSet(BaseEcoleViewSet):
    queryset = Classe.objects.select_related("annee")
    serializer_class = ClasseSerializer


class EleveViewSet(BaseEcoleViewSet):
    queryset = Eleve.objects.select_related("classe")
    serializer_class = EleveSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "eleves.gerer")]

    def get_queryset(self):
        qs = super().get_queryset()
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(classe_id=classe)
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(nom__icontains=q) | Q(prenom__icontains=q) | Q(matricule__icontains=q))
        return qs


class InscriptionSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source="eleve.__str__", read_only=True)
    classe_nom = serializers.CharField(source="classe.nom", read_only=True)

    class Meta:
        model = Inscription
        fields = ["id", "eleve", "eleve_nom", "classe", "classe_nom", "annee", "date_inscription", "statut",
                  "reduction_pct", "motif_reduction"]
        read_only_fields = ["annee", "date_inscription"]

    def validate(self, attrs):
        eleve = attrs.get("eleve", getattr(self.instance, "eleve", None))
        classe = attrs.get("classe", getattr(self.instance, "classe", None))
        doublon = Inscription.objects.filter(eleve=eleve, annee=classe.annee).exclude(pk=getattr(self.instance, "pk", None))
        if doublon.exists():
            raise serializers.ValidationError("Cet élève est déjà inscrit pour cette année scolaire.")
        return attrs


class InscriptionViewSet(BaseEcoleViewSet):
    """À la création, les échéances de l'élève sont générées depuis la grille des frais."""

    queryset = Inscription.objects.select_related("eleve", "classe")
    serializer_class = InscriptionSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "inscriptions.gerer")]
    http_method_names = ["get", "post", "patch", "head", "options"]  # une inscription ne se supprime pas

    def get_queryset(self):
        qs = super().get_queryset()
        for param in ("classe", "annee", "eleve", "statut"):
            if valeur := self.request.query_params.get(param):
                qs = qs.filter(**{param: valeur})
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(eleve__nom__icontains=q) | Q(eleve__prenom__icontains=q) | Q(eleve__matricule__icontains=q))
        return qs

    def perform_create(self, serializer):
        from finances.services import generer_echeances

        inscription = serializer.save()
        # Mise à jour de la classe courante de l'élève (affichage rapide)
        Eleve.objects.filter(pk=inscription.eleve_id).update(classe=inscription.classe)
        if self.request.tenant.a_module(Module.FRAIS):
            generer_echeances(inscription)


class TableauDeBordView(APIView):
    """Chiffres de l'accueil ; la partie argent n'est renvoyée qu'à qui a le droit de la voir."""

    permission_classes = [AbonnementValide]

    def get(self, request):
        from django.db.models import Sum
        from django.utils import timezone

        annee = AnneeScolaire.objects.filter(active=True).first()
        inscriptions = Inscription.objects.filter(annee=annee, statut=Inscription.Statut.ACTIVE) if annee else Inscription.objects.none()
        data = {
            "annee": annee.libelle if annee else None,
            "eleves_inscrits": inscriptions.count(),
            "classes": Classe.objects.filter(annee=annee).count() if annee else 0,
            "filles": inscriptions.filter(eleve__sexe=Eleve.Sexe.F).count(),
        }
        if request.user.a_permission("frais.rapports") and request.tenant.a_module(Module.FRAIS):
            from finances.models import Echeance, Paiement

            jour = timezone.localdate()
            valides = Paiement.objects.filter(annule=False)
            echues = Echeance.objects.filter(date_limite__lt=jour, inscription__statut=Inscription.Statut.ACTIVE)
            data["finances"] = {
                "encaisse_jour": valides.filter(encaisse_le__date=jour).aggregate(t=Sum("montant"))["t"] or 0,
                "encaisse_mois": valides.filter(encaisse_le__year=jour.year, encaisse_le__month=jour.month)
                .aggregate(t=Sum("montant"))["t"] or 0,
                "impayes": sum(e.reste for e in echues.avec_soldes().filter(reste__gt=0)),
                "derniers_paiements": [
                    {"id": p.id, "numero_recu": p.numero_recu, "eleve": str(p.inscription.eleve), "montant": p.montant,
                     "moyen": p.get_moyen_display(), "encaisse_le": p.encaisse_le}
                    for p in valides.select_related("inscription__eleve")[:5]
                ],
            }
        return Response(data)
