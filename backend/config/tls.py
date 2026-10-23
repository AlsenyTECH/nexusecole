"""
Autorisation des certificats HTTPS « à la demande » (Caddy on_demand_tls).

Avant de demander un certificat pour un nom d'hôte, Caddy appelle
GET /interne/tls-autorise?domain=<hôte> directement sur le conteneur backend.
On ne répond 200 que pour un domaine déclaré dans la table Domaine (une école ou la console) :
personne ne peut faire émettre de certificats pour un domaine inconnu.

Ce point d'entrée n'est jamais exposé par Caddy (seul /api/* est relayé) ; par sécurité,
une requête arrivée à travers le proxy (en-tête X-Forwarded-For) est refusée.
"""
from django.http import HttpResponse
from django_tenants.utils import schema_context

CHEMIN = "/interne/tls-autorise"


class AutorisationTLSMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != CHEMIN:
            return self.get_response(request)
        if "HTTP_X_FORWARDED_FOR" in request.META:
            return HttpResponse(status=403)
        from clients.models import Domaine

        domaine = (request.GET.get("domain") or "").strip().lower().rstrip(".")
        with schema_context("public"):
            connu = bool(domaine) and Domaine.objects.filter(domain=domaine).exists()
        return HttpResponse(status=200 if connu else 404)
