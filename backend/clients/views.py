"""API de la console super-admin (servie uniquement sur le domaine public)."""
from django.db.models import Count, Sum
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from comptes.permissions import EstSuperAdmin

from . import services
from .models import Ecole, Facture, Forfait
from .serializers import (
    CreationEcoleSerializer, EcoleSerializer, EmissionFactureSerializer, FactureSerializer, ForfaitSerializer,
    PaiementSerializer,
)


class ForfaitViewSet(viewsets.ModelViewSet):
    queryset = Forfait.objects.all()
    serializer_class = ForfaitSerializer
    permission_classes = [EstSuperAdmin]


class EcoleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                   mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Ecole.objects.exclude(schema_name="public").select_related("forfait").prefetch_related("domains")
    serializer_class = EcoleSerializer
    permission_classes = [EstSuperAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        statut = self.request.query_params.get("statut")
        return qs.filter(statut=statut) if statut else qs

    def create(self, request, *args, **kwargs):
        serializer = CreationEcoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ecole = serializer.save()
        return Response(EcoleSerializer(ecole).data, status=status.HTTP_201_CREATED)

    def _changer_statut(self, statut):
        ecole = self.get_object()
        ecole.statut = statut
        ecole.save(update_fields=["statut"])
        return Response(EcoleSerializer(ecole).data)

    @action(detail=True, methods=["post"])
    def suspendre(self, request, pk=None):
        return self._changer_statut(Ecole.Statut.SUSPENDU)

    @action(detail=True, methods=["post"])
    def activer(self, request, pk=None):
        return self._changer_statut(Ecole.Statut.ACTIF)

    @action(detail=True, methods=["post"])
    def resilier(self, request, pk=None):
        return self._changer_statut(Ecole.Statut.RESILIE)

    @action(detail=True, methods=["post"])
    def facturer(self, request, pk=None):
        s = EmissionFactureSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        facture = services.emettre_facture(self.get_object(), **s.validated_data)
        return Response(FactureSerializer(facture).data, status=status.HTTP_201_CREATED)


class FactureViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Facture.objects.select_related("ecole")
    serializer_class = FactureSerializer
    permission_classes = [EstSuperAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        for param in ("statut", "ecole"):
            if v := self.request.query_params.get(param):
                qs = qs.filter(**{param: v})
        return qs

    @action(detail=True, methods=["post"])
    def payer(self, request, pk=None):
        s = PaiementSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        facture = services.enregistrer_paiement(self.get_object(), **s.validated_data)
        return Response(FactureSerializer(facture).data)


class StatistiquesView(APIView):
    permission_classes = [EstSuperAdmin]

    def get(self, request):
        ecoles = Ecole.objects.exclude(schema_name="public")
        par_statut = dict(ecoles.values_list("statut").annotate(n=Count("id")))
        mrr = ecoles.filter(statut=Ecole.Statut.ACTIF).aggregate(t=Sum("forfait__prix_mensuel"))["t"] or 0
        impayes = Facture.objects.filter(
            statut__in=[Facture.Statut.EMISE, Facture.Statut.EN_RETARD]
        ).aggregate(t=Sum("montant"))["t"] or 0
        return Response({
            "ecoles_total": ecoles.count(),
            "ecoles_par_statut": par_statut,
            "revenu_mensuel_recurrent": mrr,
            "factures_impayees": impayes,
        })
