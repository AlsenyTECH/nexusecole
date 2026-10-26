"""URLs servies sur le sous-domaine d'une école."""
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from comptes.views import ConnexionView, MoiView, PersonnelViewSet, RafraichissementView, RoleViewSet
from pedagogie.views import (AbsenceViewSet, AppelView, BulletinViewSet, ConseilView, CoursViewSet,
                             EvaluationViewSet, JournalView, MatiereViewSet, ParametresView, PeriodeViewSet,
                             ResultatsView, SurveillanceViewSet, VerificationView)
from pedagogie.equipe import CreneauViewSet, EnseignantViewSet
from scolarite.famille import BulletinFamilleView, EnfantRubriqueView, EnfantsView, RecuFamilleView
from finances.views import CaisseView, FraisViewSet, ImpayesView, PaiementViewSet, SituationView
from scolarite.views import (AnneeScolaireViewSet, ClasseViewSet, ConfigEcoleView, EleveViewSet, InscriptionViewSet,
                              LienResponsableViewSet, ResponsableViewSet, TableauDeBordView)

router = DefaultRouter(trailing_slash=False)
router.register("annees", AnneeScolaireViewSet)
router.register("classes", ClasseViewSet)
router.register("eleves", EleveViewSet)
router.register("inscriptions", InscriptionViewSet)
router.register("personnel", PersonnelViewSet)
router.register("roles", RoleViewSet)
router.register("enseignants", EnseignantViewSet, basename="enseignant")
router.register("responsables", ResponsableViewSet)
router.register("liens-responsables", LienResponsableViewSet)
router.register("creneaux", CreneauViewSet)
router.register("frais", FraisViewSet)
router.register("paiements", PaiementViewSet)
router.register("periodes", PeriodeViewSet)
router.register("matieres", MatiereViewSet)
router.register("cours", CoursViewSet)
router.register("surveillances", SurveillanceViewSet)
router.register("evaluations", EvaluationViewSet)
router.register("absences", AbsenceViewSet)
router.register("bulletins", BulletinViewSet)

urlpatterns = [
    path("api/sante", lambda r: JsonResponse({"ok": True})),
    path("api/ecole/config", ConfigEcoleView.as_view()),
    path("api/auth/connexion", ConnexionView.as_view()),
    path("api/auth/rafraichir", RafraichissementView.as_view()),
    path("api/moi", MoiView.as_view()),
    path("api/tableau-de-bord", TableauDeBordView.as_view()),
    path("api/inscriptions/<int:pk>/situation", SituationView.as_view()),
    path("api/finances/impayes", ImpayesView.as_view()),
    path("api/finances/caisse", CaisseView.as_view()),
    path("api/pedagogie/parametres", ParametresView.as_view()),
    path("api/pedagogie/journal", JournalView.as_view()),
    path("api/appel", AppelView.as_view()),
    path("api/resultats", ResultatsView.as_view()),
    path("api/conseils", ConseilView.as_view()),
    path("api/verifier/<str:code>", VerificationView.as_view()),
    path("api/famille/enfants", EnfantsView.as_view()),
    path("api/famille/enfants/<int:pk>/<slug:rubrique>", EnfantRubriqueView.as_view()),
    path("api/famille/bulletins/<int:pk>", BulletinFamilleView.as_view()),
    path("api/famille/recus/<int:pk>", RecuFamilleView.as_view()),
    path("api/", include(router.urls)),
]
