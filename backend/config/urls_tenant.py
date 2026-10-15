"""URLs servies sur le sous-domaine d'une école."""
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from comptes.views import ConnexionView, MoiView, RafraichissementView
from scolarite.views import AnneeScolaireViewSet, ClasseViewSet, ConfigEcoleView, EleveViewSet

router = DefaultRouter(trailing_slash=False)
router.register("annees", AnneeScolaireViewSet)
router.register("classes", ClasseViewSet)
router.register("eleves", EleveViewSet)

urlpatterns = [
    path("api/sante", lambda r: JsonResponse({"ok": True})),
    path("api/ecole/config", ConfigEcoleView.as_view()),
    path("api/auth/connexion", ConnexionView.as_view()),
    path("api/auth/rafraichir", RafraichissementView.as_view()),
    path("api/moi", MoiView.as_view()),
    path("api/", include(router.urls)),
]
