"""Enseignants (fiche, classes et matières attribuées) et emploi du temps des classes."""
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from clients.models import Module
from comptes.models import Role, Utilisateur
from comptes.permissions import AbonnementValide, ModuleActif, permission
from comptes.views import PersonnelSerializer, role_origine
from scolarite.models import AnneeScolaire, Classe
from scolarite.perimetre import filtrer

from .models import Cours, Creneau, Matiere, ProfilEnseignant


# --------------------------------------------------------------------------- #
# Enseignants
# --------------------------------------------------------------------------- #
def _affectations(user):
    annee = AnneeScolaire.objects.filter(active=True).first()
    cours = Cours.objects.filter(enseignant=user).select_related("classe", "matiere")
    if annee:
        cours = cours.filter(classe__annee=annee)
    return [{"cours": c.pk, "classe": c.classe_id, "classe_nom": c.classe.nom, "matiere": c.matiere_id,
             "matiere_nom": c.matiere.nom, "coefficient": float(c.coefficient)} for c in cours]


class EnseignantSerializer(PersonnelSerializer):
    type_par_defaut = Role.ENSEIGNANT
    types_permis = [Role.ENSEIGNANT]

    statut = serializers.ChoiceField(choices=ProfilEnseignant.Statut.choices, required=False, write_only=True)
    matieres = serializers.PrimaryKeyRelatedField(queryset=Matiere.objects.all(), many=True, required=False, write_only=True)
    diplome = serializers.CharField(required=False, allow_blank=True, max_length=120, write_only=True)
    date_arrivee = serializers.DateField(required=False, allow_null=True, write_only=True)

    class Meta(PersonnelSerializer.Meta):
        fields = PersonnelSerializer.Meta.fields + ["statut", "matieres", "diplome", "date_arrivee"]

    def validate(self, attrs):
        if self.instance is None and "role_ecole" not in attrs and "role" not in attrs:
            attrs["role_ecole"] = role_origine(Role.ENSEIGNANT)
        return super().validate(attrs)

    def _profil(self, user, data):
        profil, _ = ProfilEnseignant.objects.get_or_create(utilisateur=user)
        for champ in ("statut", "diplome", "date_arrivee"):
            if champ in data:
                setattr(profil, champ, data[champ])
        profil.save()
        if "matieres" in data:
            profil.matieres.set(data["matieres"])

    @transaction.atomic
    def create(self, data):
        profil = {k: data.pop(k) for k in ("statut", "matieres", "diplome", "date_arrivee") if k in data}
        user = super().create(data)
        self._profil(user, profil)
        return user

    @transaction.atomic
    def update(self, instance, data):
        profil = {k: data.pop(k) for k in ("statut", "matieres", "diplome", "date_arrivee") if k in data}
        user = super().update(instance, data)
        self._profil(user, profil)
        return user

    def to_representation(self, user):
        data = super().to_representation(user)
        profil = getattr(user, "profil_enseignant", None)
        data.update({
            "statut": profil.statut if profil else ProfilEnseignant.Statut.PERMANENT,
            "matieres": [m.pk for m in profil.matieres.all()] if profil else [],
            "diplome": profil.diplome if profil else "",
            "date_arrivee": profil.date_arrivee if profil else None,
            "affectations": _affectations(user),
        })
        return data


class EnseignantViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                        mixins.UpdateModelMixin, viewsets.GenericViewSet):
    queryset = (Utilisateur.objects.filter(role=Role.ENSEIGNANT)
                .select_related("role_ecole", "profil_enseignant").prefetch_related("profil_enseignant__matieres"))
    serializer_class = EnseignantSerializer
    permission_classes = [AbonnementValide, permission("utilisateurs.gerer")]

    @action(detail=True, methods=["put"], permission_classes=[AbonnementValide, permission("scolarite.parametrer")])
    @transaction.atomic
    def affectations(self, request, pk=None):
        """
        Classes et matières de l'enseignant pour l'année active : {affectations: [{classe, matiere}]}.
        Un cours absent est créé (coefficient 1) ; un cours déjà tenu par un collègue lui est réattribué.
        """
        enseignant = get_object_or_404(Utilisateur, pk=pk, role=Role.ENSEIGNANT)
        annee = AnneeScolaire.objects.filter(active=True).first()
        if annee is None:
            raise ValidationError({"detail": "Activez d'abord une année scolaire."})
        voulues = set()
        for a in request.data.get("affectations", []):
            classe = Classe.objects.filter(pk=a.get("classe"), annee=annee).first()
            matiere = Matiere.objects.filter(pk=a.get("matiere")).first()
            if not classe or not matiere:
                raise ValidationError({"detail": "Classe (de l'année active) ou matière inconnue."})
            voulues.add((classe, matiere))
        gardes = []
        for classe, matiere in voulues:
            cours, _ = Cours.objects.get_or_create(classe=classe, matiere=matiere)
            if cours.enseignant_id != enseignant.pk:
                cours.enseignant = enseignant
                cours.save(update_fields=["enseignant"])
            gardes.append(cours.pk)
        Cours.objects.filter(enseignant=enseignant, classe__annee=annee).exclude(pk__in=gardes).update(enseignant=None)
        return Response(_affectations(enseignant))


# --------------------------------------------------------------------------- #
# Emploi du temps
# --------------------------------------------------------------------------- #
class CreneauSerializer(serializers.ModelSerializer):
    classe = serializers.IntegerField(source="cours.classe_id", read_only=True)
    classe_nom = serializers.CharField(source="cours.classe.nom", read_only=True)
    matiere_nom = serializers.CharField(source="cours.matiere.nom", read_only=True)
    enseignant_nom = serializers.CharField(source="cours.enseignant.nom_complet", read_only=True, default="")

    class Meta:
        model = Creneau
        fields = ["id", "cours", "classe", "classe_nom", "matiere_nom", "enseignant_nom", "jour", "debut", "fin", "salle"]

    def validate(self, attrs):
        cours = attrs.get("cours", getattr(self.instance, "cours", None))
        jour = attrs.get("jour", getattr(self.instance, "jour", None))
        debut = attrs.get("debut", getattr(self.instance, "debut", None))
        fin = attrs.get("fin", getattr(self.instance, "fin", None))
        salle = attrs.get("salle", getattr(self.instance, "salle", "")).strip()
        if fin <= debut:
            raise ValidationError({"fin": "L'heure de fin doit suivre l'heure de début."})
        chevauche = Creneau.objects.filter(jour=jour, debut__lt=fin, fin__gt=debut).exclude(pk=getattr(self.instance, "pk", None))
        conflit = chevauche.filter(cours__classe=cours.classe_id).select_related("cours__matiere").first()
        if conflit:
            raise ValidationError({"detail": f"La classe a déjà {conflit.cours.matiere.nom} de "
                                             f"{conflit.debut:%H:%M} à {conflit.fin:%H:%M}."})
        if cours.enseignant_id:
            conflit = chevauche.filter(cours__enseignant=cours.enseignant_id).select_related("cours__classe").first()
            if conflit:
                raise ValidationError({"detail": f"{cours.enseignant.nom_complet} a déjà cours en {conflit.cours.classe.nom} "
                                                 f"de {conflit.debut:%H:%M} à {conflit.fin:%H:%M}."})
        if salle:
            conflit = chevauche.filter(salle__iexact=salle).select_related("cours__classe").first()
            if conflit:
                raise ValidationError({"detail": f"La salle {salle} est occupée par la {conflit.cours.classe.nom}."})
        attrs["salle"] = salle
        return attrs


class CreneauViewSet(viewsets.ModelViewSet):
    module_requis = Module.NOTES
    queryset = Creneau.objects.select_related("cours__classe", "cours__matiere", "cours__enseignant")
    serializer_class = CreneauSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "emploi_du_temps.gerer")]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user, "cours__classe")
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(cours__classe=classe)
        return qs

    def perform_create(self, serializer):
        if not filtrer(Classe.objects.all(), self.request.user, "id").filter(pk=serializer.validated_data["cours"].classe_id).exists():
            raise ValidationError({"cours": "Cours inconnu."})
        serializer.save()

    @action(detail=False, methods=["get"], url_path="mon-planning",
            permission_classes=[AbonnementValide, ModuleActif, IsAuthenticated])
    def mon_planning(self, request):
        """Emploi du temps personnel : les cours qu'on assure, et ceux des classes qu'on surveille."""
        qs = super().get_queryset().filter(
            Q(cours__enseignant=request.user) | Q(cours__classe__surveillances__surveillant=request.user)).distinct()
        return Response(CreneauSerializer(qs, many=True).data)
