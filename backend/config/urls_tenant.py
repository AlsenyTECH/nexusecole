"""URLs servies sur le sous-domaine d'une école."""
from django.http import JsonResponse
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from comptes.views import CompteViewSet, ConnexionView, MoiView, PersonnelViewSet, RafraichissementView, RoleViewSet
from pedagogie.views import (AbsenceViewSet, AppelView, BulletinViewSet, ConseilView, CoursViewSet,
                             EvaluationViewSet, JournalView, MatiereViewSet, ParametresView, PeriodeViewSet,
                             ReouvertureView, ResultatsView, SurveillanceViewSet, VerificationView)
from pedagogie.equipe import CreneauViewSet, EnseignantViewSet
from activites.views import ActiviteViewSet
from carte.views import (CarteEleveView, CartesView, ControleView, GrandLivreView, LectureCarteView, ParametresCarteView,
                         PassageViewSet, PhotoView, PointDeVenteViewSet, ArticleViewSet, PortefeuilleView,
                         RechargeGuichetView, SimulateurView, VenteViewSet)
from scolarite.famille import (BulletinFamilleView, EnfantRubriqueView, EnfantsView, PayerEcheanceView, RechargeFamilleView,
                               RecuFamilleView, ReglagesPorteMonnaieView, TicketFamilleView)
from finances.views import (CaisseView, CaisseViewSet, FraisViewSet, ImpayesView, PaiementViewSet, RapportCaissesView,
                            SituationView, SouscriptionViewSet)
from scolarite.views import (AnneeScolaireViewSet, ClasseViewSet, ConfigEcoleView, EleveViewSet, InscriptionViewSet,
                              DecisionsView, LienResponsableViewSet, ReinscriptionsView, ResponsableViewSet, TableauDeBordView)

router = DefaultRouter(trailing_slash=False)
router.register("annees", AnneeScolaireViewSet)
router.register("classes", ClasseViewSet)
router.register("eleves", EleveViewSet)
router.register("inscriptions", InscriptionViewSet)
router.register("personnel", PersonnelViewSet)
router.register("roles", RoleViewSet)
router.register("comptes", CompteViewSet, basename="compte")
router.register("enseignants", EnseignantViewSet, basename="enseignant")
router.register("responsables", ResponsableViewSet)
router.register("liens-responsables", LienResponsableViewSet)
router.register("creneaux", CreneauViewSet)
router.register("souscriptions", SouscriptionViewSet)
router.register("caisses", CaisseViewSet)
router.register("points-de-vente", PointDeVenteViewSet)
router.register("articles", ArticleViewSet)
router.register("ventes", VenteViewSet)
router.register("passages", PassageViewSet)
router.register("activites", ActiviteViewSet, basename="activite")
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
    path("api/decisions", DecisionsView.as_view()),
    path("api/reinscriptions", ReinscriptionsView.as_view()),
    path("api/conseils/rouvrir", ReouvertureView.as_view()),
    path("api/verifier/<str:code>", VerificationView.as_view()),
    path("api/famille/enfants", EnfantsView.as_view()),
    path("api/famille/enfants/<int:pk>/recharges", RechargeFamilleView.as_view()),
    path("api/famille/enfants/<int:pk>/reglages", ReglagesPorteMonnaieView.as_view()),
    path("api/famille/enfants/<int:pk>/tickets", TicketFamilleView.as_view()),
    path("api/famille/enfants/<int:pk>/echeances/<int:echeance>/payer", PayerEcheanceView.as_view()),
    path("api/famille/enfants/<int:pk>/<slug:rubrique>", EnfantRubriqueView.as_view()),
    path("api/eleves/<int:pk>/photo", PhotoView.as_view()),
    path("api/eleves/<int:pk>/carte", CarteEleveView.as_view()),
    path("api/eleves/<int:pk>/porte-monnaie", PortefeuilleView.as_view()),
    path("api/eleves/<int:pk>/recharger", RechargeGuichetView.as_view()),
    path("api/cartes", CartesView.as_view()),
    path("api/cartes/lire", LectureCarteView.as_view()),
    path("api/cartes/parametres", ParametresCarteView.as_view()),
    path("api/controle", ControleView.as_view()),
    path("api/porte-monnaie/grand-livre", GrandLivreView.as_view()),
    path("api/finances/caisses", RapportCaissesView.as_view()),
    path("api/paiements-mobiles/simulateur/<str:reference>", SimulateurView.as_view()),
    path("api/famille/bulletins/<int:pk>", BulletinFamilleView.as_view()),
    path("api/famille/recus/<int:pk>", RecuFamilleView.as_view()),
    path("api/", include(router.urls)),
]
