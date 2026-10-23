from collections import defaultdict
from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission
from scolarite.models import Inscription

from . import services
from .models import Echeance, Frais, Paiement


def _erreur_metier(exc):
    return ValidationError({"detail": exc.messages[0] if exc.messages else str(exc)})


# --------------------------------------------------------------------------- #
# Grille des frais
# --------------------------------------------------------------------------- #
class FraisSerializer(serializers.ModelSerializer):
    class Meta:
        model = Frais
        fields = ["id", "annee", "libelle", "categorie", "montant", "periodicite", "nombre_echeances",
                  "premiere_echeance", "niveaux", "actif"]

    def validate(self, attrs):
        periodicite = attrs.get("periodicite", getattr(self.instance, "periodicite", Frais.Periodicite.UNIQUE))
        n = attrs.get("nombre_echeances", getattr(self.instance, "nombre_echeances", 1))
        if periodicite == Frais.Periodicite.MENSUEL and not 1 <= n <= 12:
            raise serializers.ValidationError({"nombre_echeances": "Entre 1 et 12 échéances."})
        if periodicite == Frais.Periodicite.UNIQUE:
            attrs["nombre_echeances"] = 1
        return attrs


class FraisViewSet(viewsets.ModelViewSet):
    """
    Modifier la grille n'altère pas les échéances déjà générées (elles engagent l'école envers
    les familles) ; elle s'applique aux nouvelles inscriptions. Un frais utilisé se désactive.
    """

    queryset = Frais.objects.all()
    serializer_class = FraisSerializer
    module_requis = Module.FRAIS
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.voir", "frais.parametrer")]

    def get_queryset(self):
        qs = super().get_queryset()
        if annee := self.request.query_params.get("annee"):
            qs = qs.filter(annee=annee)
        return qs

    def perform_destroy(self, instance):
        if instance.echeances.exists():
            raise ValidationError({"detail": "Ce frais a déjà des échéances : désactivez-le plutôt."})
        instance.delete()


# --------------------------------------------------------------------------- #
# Situation financière d'un élève
# --------------------------------------------------------------------------- #
class EcheanceSerializer(serializers.ModelSerializer):
    paye = serializers.IntegerField(read_only=True)
    reste = serializers.IntegerField(read_only=True)

    class Meta:
        model = Echeance
        fields = ["id", "libelle", "montant", "date_limite", "paye", "reste"]


class SituationView(APIView):
    module_requis = Module.FRAIS
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.voir")]

    def get(self, request, pk):
        inscription = get_object_or_404(Inscription.objects.select_related("eleve", "classe"), pk=pk)
        s = services.situation(inscription)
        return Response({
            "inscription": inscription.pk,
            "eleve": str(inscription.eleve),
            "classe": inscription.classe.nom,
            "total": s["total"], "paye": s["paye"], "reste": s["reste"], "en_retard": s["en_retard"],
            "echeances": EcheanceSerializer(s["echeances"], many=True).data,
        })


# --------------------------------------------------------------------------- #
# Paiements et reçus
# --------------------------------------------------------------------------- #
class PaiementSerializer(serializers.ModelSerializer):
    eleve = serializers.CharField(source="inscription.eleve.__str__", read_only=True)
    encaisse_par_nom = serializers.CharField(source="encaisse_par.nom_complet", read_only=True)
    echeances = serializers.ListField(child=serializers.IntegerField(), write_only=True, required=False)

    class Meta:
        model = Paiement
        fields = ["id", "numero_recu", "inscription", "eleve", "montant", "moyen", "reference", "observation",
                  "echeances", "encaisse_par_nom", "encaisse_le", "annule", "motif_annulation", "annule_le"]
        read_only_fields = ["numero_recu", "encaisse_le", "annule", "motif_annulation", "annule_le"]

    def validate(self, attrs):
        if attrs.get("moyen") in (Paiement.Moyen.WAVE, Paiement.Moyen.ORANGE_MONEY, Paiement.Moyen.FREE_MONEY,
                                  Paiement.Moyen.VIREMENT, Paiement.Moyen.CHEQUE) and not attrs.get("reference"):
            raise serializers.ValidationError({"reference": "La référence de la transaction est obligatoire."})
        return attrs


class PaiementViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin,
                      viewsets.GenericViewSet):
    """Pas de modification ni de suppression : un paiement erroné s'annule (avec motif)."""

    queryset = Paiement.objects.select_related("inscription__eleve", "encaisse_par")
    serializer_class = PaiementSerializer
    module_requis = Module.FRAIS
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.voir", "frais.encaisser")]

    def get_queryset(self):
        qs = super().get_queryset()
        if inscription := self.request.query_params.get("inscription"):
            qs = qs.filter(inscription=inscription)
        return qs

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        try:
            paiement = services.encaisser(
                data["inscription"], montant=data["montant"], moyen=data["moyen"],
                reference=data.get("reference", ""), observation=data.get("observation", ""),
                echeances=data.get("echeances"), encaisse_par=request.user,
            )
        except DjangoValidationError as exc:
            raise _erreur_metier(exc)
        return Response(self.get_serializer(paiement).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[AbonnementValide, ModuleActif, permission("frais.annuler")])
    def annuler(self, request, pk=None):
        try:
            paiement = services.annuler_paiement(self.get_object(), motif=request.data.get("motif", ""), par=request.user)
        except DjangoValidationError as exc:
            raise _erreur_metier(exc)
        return Response(self.get_serializer(paiement).data)

    @action(detail=True, methods=["get"])
    def recu(self, request, pk=None):
        p = self.get_object()
        ecole = request.tenant
        return Response({
            "ecole": {"nom": ecole.nom, "ville": ecole.ville, "telephone": ecole.telephone, "logo_url": ecole.logo_url},
            "numero": p.numero_recu,
            "date": p.encaisse_le,
            "eleve": str(p.inscription.eleve),
            "classe": p.inscription.classe.nom,
            "annee": str(p.inscription.annee),
            "montant": p.montant,
            "moyen": p.get_moyen_display(),
            "reference": p.reference,
            "detail": [{"libelle": i.echeance.libelle, "montant": i.montant}
                       for i in p.imputations.select_related("echeance")],
            "encaisse_par": p.encaisse_par.nom_complet,
            "annule": p.annule,
            "motif_annulation": p.motif_annulation,
            "reste_du": services.situation(p.inscription)["reste"],
        })


# --------------------------------------------------------------------------- #
# Rapports
# --------------------------------------------------------------------------- #
class ImpayesView(APIView):
    """Élèves ayant des échéances échues non soldées, du plus gros retard au plus petit."""

    module_requis = Module.FRAIS
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.rapports")]

    def get(self, request):
        echues = (
            Echeance.objects.filter(date_limite__lt=timezone.localdate(),
                                    inscription__statut=Inscription.Statut.ACTIVE)
            .avec_soldes().filter(reste__gt=0)
            .select_related("inscription__eleve", "inscription__classe")
        )
        if classe := request.query_params.get("classe"):
            echues = echues.filter(inscription__classe=classe)
        par_eleve = defaultdict(lambda: {"montant": 0, "echeances": 0, "depuis": None})
        for e in echues:
            insc = e.inscription
            ligne = par_eleve[insc.pk]
            ligne.update(inscription=insc.pk, eleve=str(insc.eleve), classe=insc.classe.nom,
                         telephone_parent=insc.eleve.telephone_parent)
            ligne["montant"] += e.reste
            ligne["echeances"] += 1
            ligne["depuis"] = min(filter(None, [ligne["depuis"], e.date_limite]))
        lignes = sorted(par_eleve.values(), key=lambda l: -l["montant"])
        return Response({"total": sum(l["montant"] for l in lignes), "eleves": lignes})


class CaisseView(APIView):
    """Caisse d'une journée : totaux par moyen et par caissier, à rapprocher des reçus."""

    module_requis = Module.FRAIS
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.rapports")]

    def get(self, request):
        try:
            jour = date.fromisoformat(request.query_params.get("date", "")) if request.query_params.get("date") \
                else timezone.localdate()
        except ValueError:
            raise ValidationError({"date": "Format attendu : AAAA-MM-JJ."})
        du_jour = Paiement.objects.filter(encaisse_le__date=jour)
        valides = du_jour.filter(annule=False)
        return Response({
            "date": jour,
            "total": valides.aggregate(t=Sum("montant"))["t"] or 0,
            "nombre": valides.count(),
            "par_moyen": list(valides.values("moyen").annotate(total=Sum("montant"), nombre=Count("id")).order_by("moyen")),
            "par_caissier": [
                {"caissier": f"{r['encaisse_par__prenom']} {r['encaisse_par__nom']}".strip() or r["encaisse_par__email"],
                 "total": r["total"], "nombre": r["nombre"]}
                for r in valides.values("encaisse_par__prenom", "encaisse_par__nom", "encaisse_par__email")
                .annotate(total=Sum("montant"), nombre=Count("id"))
            ],
            "annules": PaiementSerializer(du_jour.filter(annule=True), many=True).data,
            "recus": {"premier": valides.order_by("numero_recu").values_list("numero_recu", flat=True).first(),
                      "dernier": valides.order_by("-numero_recu").values_list("numero_recu", flat=True).first()},
        })
