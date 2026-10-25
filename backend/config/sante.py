"""État de la plateforme, indépendant de toute école (sondes de santé de l'hébergeur)."""
from django.db import connection
from django.http import JsonResponse

CHEMIN = "/api/sante-plateforme"


class SantePlateformeMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path != CHEMIN:
            return self.get_response(request)
        try:
            with connection.cursor() as c:
                c.execute("SELECT 1")
            return JsonResponse({"ok": True})
        except Exception:
            return JsonResponse({"ok": False, "detail": "base de données injoignable"}, status=503)
