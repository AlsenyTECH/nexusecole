"""URLs du domaine public (console super-admin NexusEcole)."""
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from clients.views import EcoleViewSet, FactureViewSet, ForfaitViewSet, StatistiquesView
from comptes.views import ConnexionView, MoiView, RafraichissementView

router = DefaultRouter(trailing_slash=False)
router.register("ecoles", EcoleViewSet)
router.register("forfaits", ForfaitViewSet)
router.register("factures", FactureViewSet)

urlpatterns = [
    path("api/sante", lambda r: JsonResponse({"ok": True})),
    path("api/auth/connexion", ConnexionView.as_view()),
    path("api/auth/rafraichir", RafraichissementView.as_view()),
    path("api/moi", MoiView.as_view()),
    path("api/admin/statistiques", StatistiquesView.as_view()),
    path("api/admin/", include(router.urls)),
]
