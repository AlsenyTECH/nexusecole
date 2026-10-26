from datetime import date, timedelta

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission
from scolarite.models import AnneeScolaire, Classe, Inscription
from scolarite.perimetre import classe_visible, filtrer

from . import services
from .models import (Absence, Bulletin, Cours, Creneau, Evaluation, Matiere, Note, Parametres, Periode, ProfilEnseignant,
                     Surveillance)


def _metier(fn):
    """Traduit les erreurs métier Django en réponses 400 / 403."""
    try:
        return fn()
    except DjangoValidationError as e:
        raise ValidationError({"detail": e.messages[0] if e.messages else str(e)})
    except DjangoPermissionDenied as e:
        raise PermissionDenied(str(e))


class BaseNotes:
    module_requis = Module.NOTES


# Comptes qui peuvent être titulaires d'un cours
TYPES_ENSEIGNANTS = ("enseignant", "directeur", "surveillant")


# --------------------------------------------------------------------------- #
# Paramétrage : paramètres, périodes, matières, cours, surveillances
# --------------------------------------------------------------------------- #
class ParametresSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parametres
        fields = ["decoupage", "poids_devoirs", "poids_composition", "validation_notes_surveillant"]


class ParametresView(BaseNotes, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("notes.voir", "scolarite.parametrer")]

    def get(self, request):
        return Response(ParametresSerializer(Parametres.actuels()).data)

    def patch(self, request):
        s = ParametresSerializer(Parametres.actuels(), data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


class PeriodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Periode
        fields = ["id", "annee", "nom", "ordre", "debut", "fin"]


class PeriodeViewSet(BaseNotes, viewsets.ModelViewSet):
    queryset = Periode.objects.all()
    serializer_class = PeriodeSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "scolarite.parametrer")]

    def get_queryset(self):
        qs = super().get_queryset()
        if annee := self.request.query_params.get("annee"):
            qs = qs.filter(annee=annee)
        return qs

    @action(detail=False, methods=["post"])
    def generer(self, request):
        """Découpe l'année en trimestres ou semestres (selon les paramètres), si elle n'en a pas encore."""
        annee = get_object_or_404(AnneeScolaire, pk=request.data.get("annee"))
        if annee.periodes.exists():
            raise ValidationError({"detail": "Cette année a déjà ses périodes."})
        n = 3 if Parametres.actuels().decoupage == Parametres.Decoupage.TRIMESTRE else 2
        nom = "trimestre" if n == 3 else "semestre"
        duree = (annee.fin - annee.debut).days + 1
        periodes = []
        for i in range(n):
            debut = annee.debut + timedelta(days=duree * i // n)
            fin = annee.fin if i == n - 1 else annee.debut + timedelta(days=duree * (i + 1) // n - 1)
            periodes.append(Periode(annee=annee, ordre=i + 1, debut=debut, fin=fin,
                                    nom=f"{'1er' if i == 0 else f'{i + 1}e'} {nom}"))
        Periode.objects.bulk_create(periodes)
        return Response(PeriodeSerializer(annee.periodes.all(), many=True).data, status=status.HTTP_201_CREATED)


class MatiereSerializer(serializers.ModelSerializer):
    class Meta:
        model = Matiere
        fields = ["id", "nom", "code"]


class MatiereViewSet(BaseNotes, viewsets.ModelViewSet):
    queryset = Matiere.objects.all()
    serializer_class = MatiereSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "scolarite.parametrer")]


class CoursSerializer(serializers.ModelSerializer):
    matiere_nom = serializers.CharField(source="matiere.nom", read_only=True)
    classe_nom = serializers.CharField(source="classe.nom", read_only=True)
    enseignant_nom = serializers.CharField(source="enseignant.nom_complet", read_only=True, default="")

    class Meta:
        model = Cours
        fields = ["id", "classe", "classe_nom", "matiere", "matiere_nom", "coefficient", "enseignant", "enseignant_nom"]

    def validate_enseignant(self, user):
        if user and user.role not in TYPES_ENSEIGNANTS:
            raise serializers.ValidationError("Ce compte n'est pas un enseignant.")
        return user


class CoursViewSet(BaseNotes, viewsets.ModelViewSet):
    queryset = Cours.objects.select_related("classe", "matiere", "enseignant")
    serializer_class = CoursSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "scolarite.parametrer")]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user)
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(classe=classe)
        if enseignant := self.request.query_params.get("enseignant"):
            qs = qs.filter(enseignant=enseignant)
        return qs

    @action(detail=False, methods=["get"], url_path="mes-cours",
            permission_classes=[AbonnementValide, ModuleActif, permission("notes.voir")])
    def mes_cours(self, request):
        """Cours où l'utilisateur peut saisir des notes (année active)."""
        annee = AnneeScolaire.objects.filter(active=True).first()
        qs = services.cours_saisissables(request.user, annee) if annee else Cours.objects.none()
        return Response(CoursSerializer(qs, many=True).data)


class SurveillanceSerializer(serializers.ModelSerializer):
    surveillant_nom = serializers.CharField(source="surveillant.nom_complet", read_only=True)

    class Meta:
        model = Surveillance
        fields = ["id", "classe", "surveillant", "surveillant_nom"]


class SurveillanceViewSet(BaseNotes, mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    queryset = Surveillance.objects.select_related("surveillant")
    serializer_class = SurveillanceSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "scolarite.parametrer")]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user)
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(classe=classe)
        return qs


# --------------------------------------------------------------------------- #
# Évaluations et notes
# --------------------------------------------------------------------------- #
class EvaluationSerializer(serializers.ModelSerializer):
    nb_notes = serializers.IntegerField(source="notes.count", read_only=True)
    a_valider = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = ["id", "cours", "periode", "type", "titre", "date", "sur", "nb_notes", "a_valider"]

    def get_a_valider(self, e):
        return e.notes.filter(statut=Note.Statut.A_VALIDER).count()


class EvaluationViewSet(BaseNotes, viewsets.ModelViewSet):
    queryset = Evaluation.objects.select_related("cours__classe", "periode")
    serializer_class = EvaluationSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("notes.voir", "notes.saisir")]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user, "cours__classe")
        for p in ("cours", "periode"):
            if v := self.request.query_params.get(p):
                qs = qs.filter(**{p: v})
        return qs

    def _controler(self, cours, periode):
        if not services.peut_saisir_notes(self.request.user, cours):
            raise PermissionDenied("Vous n'êtes pas affecté à ce cours.")
        if services.est_verrouille(cours.classe, periode):
            raise ValidationError({"detail": "Période verrouillée par le conseil de classe."})

    def perform_create(self, serializer):
        self._controler(serializer.validated_data["cours"], serializer.validated_data["periode"])
        serializer.save(creee_par=self.request.user)

    def perform_update(self, serializer):
        self._controler(serializer.instance.cours, serializer.instance.periode)
        serializer.save()

    def perform_destroy(self, instance):
        self._controler(instance.cours, instance.periode)
        if instance.notes.exists():
            raise ValidationError({"detail": "Des notes sont déjà saisies : effacez-les avant de supprimer l'évaluation."})
        instance.delete()

    @action(detail=True, methods=["get", "post"], url_path="notes",
            permission_classes=[AbonnementValide, ModuleActif, permission("notes.voir", "notes.saisir")])
    def notes(self, request, pk=None):
        evaluation = self.get_object()
        if request.method == "POST":
            n = _metier(lambda: services.enregistrer_notes(evaluation, request.data.get("notes", []), request.user))
            return Response({"modifiees": n})
        notes = {n.inscription_id: n for n in evaluation.notes.all()}
        lignes = []
        for i in Inscription.objects.filter(classe=evaluation.cours.classe, statut=Inscription.Statut.ACTIVE).select_related("eleve"):
            n = notes.get(i.pk)
            lignes.append({"inscription": i.pk, "eleve": f"{i.eleve.prenom} {i.eleve.nom}", "matricule": i.eleve.matricule,
                           "valeur": None if not n or n.valeur is None else float(n.valeur),
                           "absent": bool(n and n.absent), "statut": n.statut if n else None})
        return Response({
            "evaluation": EvaluationSerializer(evaluation).data,
            "peut_saisir": services.peut_saisir_notes(request.user, evaluation.cours)
            and not services.est_verrouille(evaluation.cours.classe, evaluation.periode),
            "peut_valider": services.peut_valider(request.user, evaluation.cours),
            "eleves": lignes,
        })

    @action(detail=True, methods=["post"], permission_classes=[AbonnementValide, ModuleActif, permission("notes.voir")])
    def valider(self, request, pk=None):
        return Response({"validees": _metier(lambda: services.valider_notes(self.get_object(), request.user))})


class JournalView(BaseNotes, APIView):
    """Intégrité du journal des notes (chaîne d'empreintes)."""

    permission_classes = [AbonnementValide, ModuleActif, permission("notes.valider")]

    def get(self, request):
        intact, rupture = services.verifier_journal()
        from .models import JournalNote

        return Response({"intact": intact, "premiere_ligne_alteree": rupture, "lignes": JournalNote.objects.count()})


# --------------------------------------------------------------------------- #
# Appel et absences
# --------------------------------------------------------------------------- #
class AppelView(APIView):
    module_requis = Module.ABSENCES
    permission_classes = [AbonnementValide, ModuleActif, permission("absences.saisir")]

    def _classe(self, request, source):
        classe = get_object_or_404(Classe, pk=source.get("classe"))
        if not services.peut_faire_l_appel(request.user, classe):
            raise PermissionDenied("Vous n'êtes pas affecté à cette classe.")
        return classe

    def get(self, request):
        classe = self._classe(request, request.query_params)
        jour = date.fromisoformat(request.query_params.get("date"))
        creneau = request.query_params.get("creneau", Absence.Creneau.MATIN)
        deja = {a.inscription_id: a for a in Absence.objects.filter(inscription__classe=classe, date=jour, creneau=creneau)}
        return Response({"classe": classe.nom, "date": jour, "creneau": creneau, "fait": bool(deja), "eleves": [
            {"inscription": i.pk, "eleve": f"{i.eleve.prenom} {i.eleve.nom}", "matricule": i.eleve.matricule,
             "etat": deja[i.pk].type if i.pk in deja else "present",
             "justifiee": deja[i.pk].justifiee if i.pk in deja else False}
            for i in Inscription.objects.filter(classe=classe, statut=Inscription.Statut.ACTIVE).select_related("eleve")
        ]})

    @transaction.atomic
    def post(self, request):
        """Enregistre l'appel : {classe, date, creneau, eleves: [{inscription, etat: present|absence|retard}]}."""
        classe = self._classe(request, request.data)
        jour = date.fromisoformat(request.data.get("date"))
        creneau = request.data.get("creneau", Absence.Creneau.MATIN)
        if creneau not in Absence.Creneau.values:
            raise ValidationError({"creneau": "Créneau inconnu."})
        if jour > date.today():
            raise ValidationError({"date": "L'appel ne se fait pas pour une date future."})
        inscrits = set(Inscription.objects.filter(classe=classe, statut=Inscription.Statut.ACTIVE).values_list("id", flat=True))
        bilan = {"absence": 0, "retard": 0}
        for e in request.data.get("eleves", []):
            insc, etat = int(e["inscription"]), e.get("etat", "present")
            if insc not in inscrits:
                raise ValidationError({"detail": f"Élève {insc} hors de cette classe."})
            if etat == "present":
                Absence.objects.filter(inscription_id=insc, date=jour, creneau=creneau).delete()
            elif etat in bilan:
                Absence.objects.update_or_create(inscription_id=insc, date=jour, creneau=creneau,
                                                 defaults={"type": etat, "saisie_par": request.user})
                bilan[etat] += 1
            else:
                raise ValidationError({"detail": f"État inconnu : {etat}"})
        return Response(bilan)


class AbsenceSerializer(serializers.ModelSerializer):
    eleve = serializers.CharField(source="inscription.eleve.__str__", read_only=True)
    classe = serializers.CharField(source="inscription.classe.nom", read_only=True)

    class Meta:
        model = Absence
        fields = ["id", "inscription", "eleve", "classe", "date", "creneau", "type", "justifiee", "motif"]
        read_only_fields = ["inscription", "date", "creneau", "type"]


class AbsenceViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Liste des absences et justification (motif)."""

    module_requis = Module.ABSENCES
    queryset = Absence.objects.select_related("inscription__eleve", "inscription__classe")
    serializer_class = AbsenceSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "absences.saisir")]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user, "inscription__classe")
        for p in ("inscription", "date"):
            if v := self.request.query_params.get(p):
                qs = qs.filter(**{p: v})
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(inscription__classe=classe)
        return qs


# --------------------------------------------------------------------------- #
# Résultats, conseil de classe, bulletins
# --------------------------------------------------------------------------- #
class ResultatsView(BaseNotes, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("notes.voir")]

    def get(self, request):
        classe = get_object_or_404(filtrer(Classe.objects.all(), request.user, "id"), pk=request.query_params.get("classe"))
        periode = get_object_or_404(Periode, pk=request.query_params.get("periode"))
        return Response(services.resultats_classe(classe, periode))


class ConseilView(BaseNotes, APIView):
    """Tenir le conseil de classe : verrouille la période et émet les bulletins signés."""

    permission_classes = [AbonnementValide, ModuleActif, permission("notes.valider")]

    def post(self, request):
        classe = get_object_or_404(Classe, pk=request.data.get("classe"))
        periode = get_object_or_404(Periode, pk=request.data.get("periode"))
        n = _metier(lambda: services.tenir_conseil(classe, periode, request.user, request.tenant.nom))
        return Response({"bulletins": n}, status=status.HTTP_201_CREATED)


class BulletinSerializer(serializers.ModelSerializer):
    class Meta:
        model = Bulletin
        fields = ["id", "inscription", "periode", "contenu", "empreinte", "code", "emis_le"]


class BulletinViewSet(BaseNotes, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = Bulletin.objects.all()
    serializer_class = BulletinSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("notes.voir")]

    def get_queryset(self):
        qs = filtrer(super().get_queryset(), self.request.user, "inscription__classe")
        for p in ("periode", "inscription"):
            if v := self.request.query_params.get(p):
                qs = qs.filter(**{p: v})
        if classe := self.request.query_params.get("classe"):
            qs = qs.filter(inscription__classe=classe)
        return qs


class VerificationView(APIView):
    """Page publique du QR code : confirme qu'un bulletin a bien été émis par l'école et n'a pas été modifié."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "verification"

    def get(self, request, code):
        b = Bulletin.objects.filter(code=code).select_related("periode").first()
        if not b:
            return Response({"authentique": False, "detail": "Aucun bulletin ne correspond à ce code."}, status=404)
        c = b.contenu
        return Response({
            "authentique": services.signature_valide(b),
            "ecole": c["ecole"], "eleve": c["eleve"], "classe": c["classe"], "periode": c["periode"], "annee": c["annee"],
            "moyenne": c["moyenne"], "bareme": c["bareme"], "rang": c["rang"], "effectif": c["effectif"],
            "mention": c["mention"], "emis_le": b.emis_le, "empreinte": b.empreinte,
            "cle_publique": services.cle_publique_b64(),
        })
