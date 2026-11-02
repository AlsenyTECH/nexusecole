from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from carte.services import lire_carte
from carte.views import un_des
from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission
from scolarite.models import Eleve
from scolarite.perimetre import filtrer

from . import services
from .models import Activite, Ticket


def _metier(fn):
    try:
        return fn()
    except DjangoValidationError as e:
        raise ValidationError({"detail": e.messages[0] if e.messages else str(e)})


class TicketSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    qr = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = ["id", "activite", "eleve", "eleve_nom", "beneficiaire", "code", "statut", "statut_libelle", "prix_paye",
                  "moyen", "cree_le", "utilise_le", "qr"]

    def get_eleve_nom(self, t):
        return str(t.eleve) if t.eleve_id else None

    def get_qr(self, t):
        return services.qr_ticket(t) if t.eleve_id is None else None  # un élève entre avec sa carte


class ActiviteSerializer(serializers.ModelSerializer):
    caisse_nom = serializers.CharField(source="caisse.nom", read_only=True)
    comptabilisee = serializers.BooleanField(source="caisse.comptabilisee", read_only=True)
    vendus = serializers.IntegerField(read_only=True, default=0)
    entres = serializers.IntegerField(read_only=True, default=0)
    recette = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Activite
        fields = ["id", "titre", "description", "date", "heure", "lieu", "prix", "places", "niveaux", "caisse", "caisse_nom",
                  "comptabilisee", "vente_en_ligne", "ouverte", "vendus", "entres", "recette"]


class ActiviteViewSet(viewsets.ModelViewSet):
    module_requis = Module.ACTIVITES
    serializer_class = ActiviteSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("activites.gerer")]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):  # le contrôle à l'entrée choisit l'activité contrôlée
            return [AbonnementValide(), ModuleActif(), un_des("activites.gerer", "acces.controler")()]
        return super().get_permissions()

    def get_queryset(self):
        valides = ~Q(tickets__statut=Ticket.Statut.ANNULE)
        qs = Activite.objects.select_related("caisse").annotate(
            vendus=Count("tickets", filter=valides),
            entres=Count("tickets", filter=Q(tickets__statut=Ticket.Statut.UTILISE)),
            recette=Sum("tickets__prix_paye", filter=valides, default=0),
        ).order_by("-date", "-id")
        if self.request.query_params.get("a_venir") == "1":
            from django.utils import timezone
            qs = qs.filter(date__gte=timezone.localdate())
        return qs

    def perform_create(self, serializer):
        serializer.save(cree_par=self.request.user)

    def perform_destroy(self, activite):
        if activite.tickets.exists():
            raise ValidationError({"detail": "Des tickets ont été vendus : fermez la vente plutôt."})
        activite.delete()

    @action(detail=True, methods=["get", "post"])
    def tickets(self, request, pk=None):
        """GET : tickets vendus. POST : vendre au guichet {qr | eleve | beneficiaire, moyen}."""
        activite = self.get_object()
        if request.method == "GET":
            return Response(TicketSerializer(activite.tickets.select_related("eleve"), many=True).data)
        eleve = None
        if request.data.get("qr"):
            carte, erreur = lire_carte(request.data["qr"])
            if erreur:
                raise ValidationError({"detail": erreur})
            eleve = carte.eleve
        elif request.data.get("eleve"):
            eleve = get_object_or_404(filtrer(Eleve.objects.all(), request.user), pk=request.data["eleve"])
        moyen = request.data.get("moyen") or ("portefeuille" if eleve else "especes")
        ticket = _metier(lambda: services.vendre(activite, par=request.user, eleve=eleve,
                                                 beneficiaire=str(request.data.get("beneficiaire", "")), moyen=moyen))
        return Response(TicketSerializer(ticket).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path=r"tickets/(?P<ticket>\d+)/annuler")
    def annuler_ticket(self, request, pk=None, ticket=None):
        t = get_object_or_404(Ticket, pk=ticket, activite=self.get_object())
        return Response(TicketSerializer(_metier(lambda: services.annuler(t, request.user))).data)
