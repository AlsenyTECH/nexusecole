from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission

from . import services
from .models import AnneeScolaire, Classe, Eleve, Inscription, LienResponsable, Responsable
from .perimetre import filtrer


def _metier(fn):
    try:
        return fn()
    except DjangoValidationError as e:
        raise ValidationError({"detail": e.messages[0] if e.messages else str(e)})


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
        fields = ["id", "annee", "nom", "niveau", "bareme", "effectif"]


class ResponsableSerializer(serializers.ModelSerializer):
    acces = serializers.SerializerMethodField()
    enfants = serializers.SerializerMethodField()

    class Meta:
        model = Responsable
        fields = ["id", "prenom", "nom", "telephone", "telephone2", "email", "profession", "adresse", "acces", "enfants"]

    def get_acces(self, r):
        u = r.utilisateur
        return {"email": u.email, "actif": u.is_active, "derniere_connexion": u.last_login} if u else None

    def get_enfants(self, r):
        return [{"eleve": l.eleve_id, "nom": f"{l.eleve.prenom} {l.eleve.nom}", "lien": l.lien} for l in r.liens.all()]


class LienSerializer(serializers.ModelSerializer):
    responsable = ResponsableSerializer(read_only=True)
    lien_libelle = serializers.CharField(source="get_lien_display", read_only=True)

    class Meta:
        model = LienResponsable
        fields = ["id", "eleve", "responsable", "lien", "lien_libelle", "contact_principal", "acces_app"]
        read_only_fields = ["eleve"]


class EleveSerializer(serializers.ModelSerializer):
    classe_nom = serializers.CharField(source="classe.nom", read_only=True, default=None)
    matricule = serializers.CharField(required=False, allow_blank=True, max_length=30)
    telephone_contact = serializers.CharField(read_only=True)
    # À la création : parents / tuteurs à rattacher (voir services.rattacher)
    responsables = serializers.ListField(child=serializers.DictField(), write_only=True, required=False)

    class Meta:
        model = Eleve
        fields = ["id", "matricule", "prenom", "nom", "sexe", "date_naissance", "lieu_naissance", "nationalite", "adresse",
                  "ancien_etablissement", "date_entree", "informations_medicales", "classe", "classe_nom",
                  "telephone_parent", "telephone_contact", "actif", "responsables"]
        read_only_fields = ["classe"]  # la classe courante se fixe par l'inscription

    def validate_matricule(self, valeur):
        valeur = valeur.strip()
        if valeur and Eleve.objects.filter(matricule=valeur).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Ce matricule est déjà attribué.")
        return valeur

    def validate(self, attrs):
        if self.instance is None:
            forfait = self.context["request"].tenant.forfait
            if forfait and forfait.max_eleves is not None:
                if Eleve.objects.filter(actif=True).count() >= forfait.max_eleves:
                    raise serializers.ValidationError(
                        f"Limite de {forfait.max_eleves} élèves du forfait {forfait.nom} atteinte : "
                        "passez au forfait supérieur."
                    )
        if attrs.get("responsables") and not self.context["request"].user.a_permission("responsables.gerer"):
            raise PermissionDenied("Vous n'avez pas le droit de gérer les parents et tuteurs.")
        if self.instance is not None and "matricule" in attrs and not attrs["matricule"]:
            attrs.pop("matricule")
        return attrs

    @transaction.atomic
    def create(self, data):
        responsables = data.pop("responsables", [])
        if not data.get("matricule"):
            data["matricule"] = services.matricule_suivant()
        eleve = super().create(data)
        espace_parents = self.context["request"].tenant.a_module(Module.PARENTS)
        for r in responsables:
            _metier(lambda: services.rattacher(eleve, r, espace_parents))
        return eleve

    def update(self, instance, data):
        data.pop("responsables", None)
        return super().update(instance, data)


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

    def get_queryset(self):
        return filtrer(super().get_queryset(), self.request.user, "id")


class EleveViewSet(BaseEcoleViewSet):
    queryset = Eleve.objects.select_related("classe").prefetch_related("liens__responsable")
    serializer_class = EleveSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "eleves.gerer")]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user)
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(classe_id=classe)
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(nom__icontains=q) | Q(prenom__icontains=q) | Q(matricule__icontains=q))
        return qs

    @action(detail=True, methods=["get", "post"], url_path="responsables",
            permission_classes=[AbonnementValide, ModuleActif, permission("eleves.voir", "responsables.gerer")])
    def responsables(self, request, pk=None):
        """Parents et tuteurs de l'élève ; POST pour en rattacher un (nouveau ou déjà connu)."""
        eleve = self.get_object()
        if request.method == "POST":
            lien = _metier(lambda: services.rattacher(eleve, request.data, request.tenant.a_module(Module.PARENTS)))
            return Response(LienSerializer(lien).data, status=status.HTTP_201_CREATED)
        liens = eleve.liens.select_related("responsable__utilisateur").prefetch_related("responsable__liens__eleve")
        return Response(LienSerializer(liens, many=True).data)


class LienResponsableViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Modifier (lien, contact principal, accès) ou détacher un responsable d'un élève."""

    module_requis = Module.SCOLARITE
    queryset = LienResponsable.objects.select_related("responsable__utilisateur", "eleve")
    serializer_class = LienSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("responsables.gerer")]
    http_method_names = ["patch", "delete", "options"]

    def get_queryset(self):
        return filtrer(super().get_queryset(), self.request.user, "eleve__classe")

    def perform_update(self, serializer):
        lien = serializer.save()
        if lien.contact_principal:
            services.definir_contact_principal(lien)

    @transaction.atomic
    def perform_destroy(self, lien):
        eleve, principal = lien.eleve, lien.contact_principal
        lien.delete()
        if principal and (suivant := eleve.liens.first()):
            services.definir_contact_principal(suivant)


class ResponsableViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                         viewsets.GenericViewSet):
    """Annuaire des parents et tuteurs (pour retrouver une famille déjà connue) et gestion de leur accès."""

    module_requis = Module.SCOLARITE
    queryset = Responsable.objects.select_related("utilisateur").prefetch_related("liens__eleve")
    serializer_class = ResponsableSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("responsables.gerer")]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user, "liens__eleve__classe").distinct()
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(nom__icontains=q) | Q(prenom__icontains=q) | Q(telephone__icontains=q.replace(" ", "")) |
                           Q(telephone__icontains=q))[:20]
        return qs

    def perform_update(self, serializer):
        r = serializer.save()
        if r.utilisateur_id:  # garder le compte à jour (nom affiché, téléphone)
            u = r.utilisateur
            u.prenom, u.nom, u.telephone = r.prenom, r.nom, r.telephone
            u.save(update_fields=["prenom", "nom", "telephone"])

    @action(detail=True, methods=["post", "patch"])
    def acces(self, request, pk=None):
        """POST {email, mot_de_passe} : ouvre (ou réinitialise) l'accès ; PATCH {actif} : le suspend ou le rétablit."""
        r = self.get_object()
        if not request.tenant.a_module(Module.PARENTS):
            raise PermissionDenied("L'espace parents n'est pas inclus dans le forfait de l'école.")
        if request.method == "POST":
            _metier(lambda: services.creer_acces(r, request.data.get("email"), request.data.get("mot_de_passe") or ""))
        else:
            if not r.utilisateur_id:
                raise ValidationError({"detail": "Ce parent n'a pas encore d'accès."})
            r.utilisateur.is_active = bool(request.data.get("actif"))
            r.utilisateur.save(update_fields=["is_active"])
        r.refresh_from_db()
        return Response(ResponsableSerializer(r).data)


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
        qs = filtrer(super().get_queryset(), self.request.user)
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
        inscriptions = filtrer(inscriptions, request.user)
        data = {
            "annee": annee.libelle if annee else None,
            "eleves_inscrits": inscriptions.count(),
            "classes": filtrer(Classe.objects.filter(annee=annee), request.user, "id").count() if annee else 0,
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
