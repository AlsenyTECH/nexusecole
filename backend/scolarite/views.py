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
    class Meta:
        model = Eleve
        fields = ["id", "matricule", "prenom", "nom", "sexe", "date_naissance", "classe", "telephone_parent", "actif"]

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
            qs = qs.filter(nom__icontains=q) | qs.filter(prenom__icontains=q) | qs.filter(matricule__icontains=q)
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
        return qs

    def perform_create(self, serializer):
        from finances.services import generer_echeances

        inscription = serializer.save()
        # Mise à jour de la classe courante de l'élève (affichage rapide)
        Eleve.objects.filter(pk=inscription.eleve_id).update(classe=inscription.classe)
        if self.request.tenant.a_module(Module.FRAIS):
            generer_echeances(inscription)
