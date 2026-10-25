"""
Identification de l'école : par sous-domaine (production) ou par en-tête (hébergement gratuit).

Mode « sous-domaine » (par défaut) : lycee-x.nexusecole.sn → école lycee-x.
Mode « chemin » (ECOLE_PAR_EN_TETE=true) : une seule adresse (ex. nexusecole.onrender.com) ;
l'interface est servie sur /e/<code>/… et envoie l'en-tête « X-Ecole: <code> » à l'API
(« admin » pour la console). Les jetons restant liés à l'école (claim `schema`), un jeton
de l'école A envoyé avec « X-Ecole: B » est refusé : l'isolation ne dépend pas de l'en-tête.
"""
import re

from django.conf import settings
from django.core.exceptions import DisallowedHost
from django_tenants.middleware.main import TenantMainMiddleware

CODE = re.compile(r"^[a-z0-9-]{1,40}$")


class EcoleMiddleware(TenantMainMiddleware):
    def hostname_from_request(self, request):
        if getattr(settings, "ECOLE_PAR_EN_TETE", False):
            code = request.headers.get("X-Ecole", "").strip().lower()
            if code:
                if not CODE.match(code):
                    raise DisallowedHost("Code d'école invalide")
                return settings.PUBLIC_DOMAIN if code == "admin" else f"{code}.{settings.BASE_DOMAIN}"
        return super().hostname_from_request(request)
