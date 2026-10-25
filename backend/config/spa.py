"""
Sert l'interface React compilée quand il n'y a pas de serveur web devant Django
(hébergement gratuit à service unique). Activé seulement si FRONTEND_DIST est défini.

- /assets/… : fichiers versionnés, cache long ;
- toute autre adresse hors /api et /interne : le fichier s'il existe, sinon index.html
  (l'application gère ses routes : /e/<école>/eleves, /console…).
"""
from pathlib import Path

from django.conf import settings
from django.http import Http404
from django.views.static import serve

EXCLUS = ("/api/", "/interne/")


class InterfaceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        dist = getattr(settings, "FRONTEND_DIST", "")
        self.racine = Path(dist).resolve() if dist else None

    def __call__(self, request):
        if not self.racine or request.path.startswith(EXCLUS) or request.method not in ("GET", "HEAD"):
            return self.get_response(request)
        chemin = request.path.lstrip("/")
        try:
            # serve() refuse toute sortie du dossier (../) : pas de lecture de fichiers arbitraires
            reponse = serve(request, chemin, document_root=str(self.racine)) if chemin else None
        except Http404:
            reponse = None
        if reponse is None:
            reponse = serve(request, "index.html", document_root=str(self.racine))
            reponse["Cache-Control"] = "no-cache"
        elif chemin.startswith("assets/"):
            reponse["Cache-Control"] = "public, max-age=31536000, immutable"
        return reponse
