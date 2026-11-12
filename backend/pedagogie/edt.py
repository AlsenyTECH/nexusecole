"""
API du générateur d'emplois du temps : grille de l'école, salles spécialisées, disponibilités des
professeurs (proposées par le prof, validées par la direction), générations et publication.
"""
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.models import Role, Utilisateur
from comptes.permissions import AbonnementValide, ModuleActif, permission
from scolarite.models import AnneeScolaire

from . import generation
from .models import Cours, Disponibilite, GenerationEDT, GrilleHoraire, SalleSpecialisee

GERER = permission("emploi_du_temps.gerer")
DUREE_MAX_CALCUL = timedelta(minutes=6)


class Base:
    module_requis = Module.NOTES


def _creneaux(valeur, grille, champ):
    """Liste [[jour, indice]] valide pour la grille, sans doublon, triée."""
    if not isinstance(valeur, list):
        raise ValidationError({champ: "Liste de créneaux [jour, indice] attendue."})
    sortie = set()
    for x in valeur:
        if not (isinstance(x, (list, tuple)) and len(x) == 2 and all(isinstance(v, int) for v in x)
                and 1 <= x[0] <= 6 and 0 <= x[1] < len(grille.heures)):
            raise ValidationError({champ: f"Créneau invalide : {x}."})
        sortie.add((x[0], x[1]))
    return [list(x) for x in sorted(sortie)]


# --------------------------------------------------------------------------- #
# Grille horaire de l'école
# --------------------------------------------------------------------------- #
class GrilleView(Base, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "emploi_du_temps.gerer")]

    def get(self, request):
        g = GrilleHoraire.actuelle()
        return Response({"heures": g.heures, "ouverts": g.ouverts})

    def put(self, request):
        g = GrilleHoraire.actuelle()
        heures = request.data.get("heures", g.heures)
        if (not isinstance(heures, list) or not 1 <= len(heures) <= 14
                or any(not isinstance(h, str) or len(h) != 5 or h[2] != ":" for h in heures) or heures != sorted(set(heures))):
            raise ValidationError({"heures": "Heures de début HH:MM, croissantes, 14 au plus."})
        for a, b in zip(heures, heures[1:]):
            if int(b[:2]) * 60 + int(b[3:]) - (int(a[:2]) * 60 + int(a[3:])) < 60:
                raise ValidationError({"heures": f"{a} et {b} : les créneaux durent une heure, ils ne peuvent pas se chevaucher."})
        if heures != g.heures and GenerationEDT.objects.filter(statut=GenerationEDT.Statut.EN_COURS).exists():
            raise ValidationError({"detail": "Un calcul est en cours : attendez sa fin pour changer les heures."})
        g.heures = heures
        g.ouverts = _creneaux(request.data.get("ouverts", g.ouverts), g, "ouverts")
        g.save()
        return Response({"heures": g.heures, "ouverts": g.ouverts})


# --------------------------------------------------------------------------- #
# Salles spécialisées
# --------------------------------------------------------------------------- #
class SalleSerializer(serializers.ModelSerializer):
    matieres = serializers.SerializerMethodField()

    class Meta:
        model = SalleSpecialisee
        fields = ["id", "nom", "nombre", "matieres"]

    def get_matieres(self, salle):
        return [m.nom for m in salle.matieres.all()]

    def validate_nombre(self, n):
        if not 1 <= n <= 20:
            raise serializers.ValidationError("Entre 1 et 20.")
        return n


class SalleViewSet(Base, viewsets.ModelViewSet):
    queryset = SalleSpecialisee.objects.prefetch_related("matieres")
    serializer_class = SalleSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "emploi_du_temps.gerer")]
    pagination_class = None


# --------------------------------------------------------------------------- #
# Disponibilités des professeurs
# --------------------------------------------------------------------------- #
def _dispo_json(user, d):
    return {"enseignant": user.pk, "nom": user.nom_complet,
            "statut": getattr(getattr(user, "profil_enseignant", None), "statut", "permanent"),
            "indispo": d.indispo if d else [], "prefere": d.prefere if d else [],
            "proposition": ({"indispo": d.indispo_propose, "prefere": d.prefere_propose, "le": d.propose_le}
                            if d and d.indispo_propose is not None else None),
            "valide_le": d.valide_le if d else None}


def _lire(data, grille):
    indispo = _creneaux(data.get("indispo", []), grille, "indispo")
    prefere = [c for c in _creneaux(data.get("prefere", []), grille, "prefere") if c not in indispo]
    return indispo, prefere


class DisponibilitesView(Base, APIView):
    """Direction : liste de tous les enseignants ; PUT …/<id> saisit et valide ; POST …/<id>/valider accepte la proposition."""

    permission_classes = [AbonnementValide, ModuleActif, GERER]

    def get(self, request, pk=None):
        dispo = {d.enseignant_id: d for d in Disponibilite.objects.all()}
        profs = (Utilisateur.objects.filter(role=Role.ENSEIGNANT, is_active=True)
                 .select_related("profil_enseignant").order_by("nom", "prenom"))
        return Response([_dispo_json(u, dispo.get(u.pk)) for u in profs])

    def put(self, request, pk):
        user = get_object_or_404(Utilisateur, pk=pk, role=Role.ENSEIGNANT)
        indispo, prefere = _lire(request.data, GrilleHoraire.actuelle())
        d, _ = Disponibilite.objects.get_or_create(enseignant=user)
        d.indispo, d.prefere, d.valide_le = indispo, prefere, timezone.now()
        d.indispo_propose = d.prefere_propose = d.propose_le = None
        d.save()
        return Response(_dispo_json(user, d))

    def post(self, request, pk):
        """Valider (ou refuser avec {refuser: true}) la proposition du professeur."""
        d = get_object_or_404(Disponibilite, enseignant_id=pk)
        if d.indispo_propose is None:
            raise ValidationError({"detail": "Aucune proposition en attente."})
        if not request.data.get("refuser"):
            d.indispo, d.prefere, d.valide_le = d.indispo_propose, d.prefere_propose or [], timezone.now()
        d.indispo_propose = d.prefere_propose = d.propose_le = None
        d.save()
        return Response(_dispo_json(d.enseignant, d))


class MesDisponibilitesView(Base, APIView):
    """Le professeur consulte et propose ses disponibilités ; elles comptent une fois validées par la direction."""

    permission_classes = [AbonnementValide, ModuleActif, IsAuthenticated]

    def get(self, request):
        d = Disponibilite.objects.filter(enseignant=request.user).first()
        g = GrilleHoraire.actuelle()
        return Response({**_dispo_json(request.user, d), "grille": {"heures": g.heures, "ouverts": g.ouverts}})

    def put(self, request):
        if request.user.role != Role.ENSEIGNANT:
            raise ValidationError({"detail": "Réservé aux enseignants."})
        indispo, prefere = _lire(request.data, GrilleHoraire.actuelle())
        d, _ = Disponibilite.objects.get_or_create(enseignant=request.user)
        d.indispo_propose, d.prefere_propose, d.propose_le = indispo, prefere, timezone.now()
        d.save()
        return Response(_dispo_json(request.user, d))


# --------------------------------------------------------------------------- #
# Diagnostic, générations, publication
# --------------------------------------------------------------------------- #
def _annee(request):
    pk = request.query_params.get("annee") or request.data.get("annee")
    annee = AnneeScolaire.objects.filter(pk=pk).first() if pk else AnneeScolaire.objects.filter(active=True).first()
    if annee is None:
        raise ValidationError({"detail": "Aucune année scolaire active."})
    return annee


class DiagnosticView(Base, APIView):
    permission_classes = [AbonnementValide, ModuleActif, GERER]

    def get(self, request):
        annee = _annee(request)
        d = generation.charger(annee)
        cours = Cours.objects.filter(classe__annee=annee)
        return Response({**generation.diagnostiquer(d), "annee": annee.pk,
                         "cours_sans_volume": cours.filter(volume_horaire__isnull=True).count(),
                         "cours_sans_enseignant": cours.filter(enseignant__isnull=True).count(),
                         "propositions_en_attente": Disponibilite.objects.filter(indispo_propose__isnull=False).count()})


class GenerationSerializer(serializers.ModelSerializer):
    cree_par_nom = serializers.CharField(source="cree_par.nom_complet", read_only=True)

    class Meta:
        model = GenerationEDT
        fields = ["id", "annee", "statut", "diagnostic", "propositions", "message", "progression", "publiee",
                  "cree_par_nom", "cree_le", "termine_le"]


class GenerationViewSet(Base, viewsets.ReadOnlyModelViewSet):
    queryset = GenerationEDT.objects.select_related("cree_par")
    serializer_class = GenerationSerializer
    permission_classes = [AbonnementValide, ModuleActif, GERER]
    pagination_class = None

    def get_queryset(self):
        # Calcul interrompu (redémarrage du serveur) : ne pas le laisser « en cours » pour toujours
        GenerationEDT.objects.filter(statut=GenerationEDT.Statut.EN_COURS, cree_le__lt=timezone.now() - DUREE_MAX_CALCUL).update(
            statut=GenerationEDT.Statut.ECHEC, message="Le calcul a été interrompu : relancez-le.", termine_le=timezone.now())
        qs = super().get_queryset()
        if annee := self.request.query_params.get("annee"):
            qs = qs.filter(annee=annee)
        return qs[:10] if self.action == "list" else qs

    def create(self, request):
        annee = _annee(request)
        if GenerationEDT.objects.filter(statut=GenerationEDT.Statut.EN_COURS, cree_le__gte=timezone.now() - DUREE_MAX_CALCUL).exists():
            raise ValidationError({"detail": "Un calcul est déjà en cours : attendez qu'il se termine."})
        gen = GenerationEDT.objects.create(annee=annee, cree_par=request.user)
        if getattr(settings, "EDT_SYNCHRONE", False):   # tests
            gen = generation.executer(gen.pk, limite=10.0)
        else:
            schema = connection.schema_name
            transaction.on_commit(lambda: generation.lancer_en_arriere_plan(gen.pk, schema))
        return Response(GenerationSerializer(gen).data, status=202)

    def destroy(self, request, pk=None):
        gen = self.get_object()
        if gen.statut == GenerationEDT.Statut.EN_COURS:
            raise ValidationError({"detail": "Calcul en cours."})
        gen.delete()
        return Response(status=204)


class PublierView(Base, APIView):
    permission_classes = [AbonnementValide, ModuleActif, GERER]

    def post(self, request, pk):
        gen = get_object_or_404(GenerationEDT, pk=pk, statut=GenerationEDT.Statut.TERMINEE)
        try:
            n = generation.publier(gen, int(request.data.get("proposition", 0)))
        except (DjangoValidationError, ValueError) as e:
            raise ValidationError({"detail": e.messages[0] if hasattr(e, "messages") else "Proposition invalide."})
        return Response({"creneaux": n, "detail": f"Emploi du temps publié : {n} séances placées."})
