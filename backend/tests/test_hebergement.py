"""Mode « chemin » (hébergement gratuit à adresse unique) et interface servie par Django."""
import tempfile
from pathlib import Path

from django.test import override_settings
from rest_framework.test import APIClient

from .test_isolation import MDP, BaseMultiEcole


@override_settings(ECOLE_PAR_EN_TETE=True, ALLOWED_HOSTS=["*"])
class ModeCheminTests(BaseMultiEcole):
    """Une seule adresse (ex. nexusecole.onrender.com) : l'école vient de l'en-tête X-Ecole."""

    def client_ecole(self, code):
        return APIClient(HTTP_HOST="nexusecole.onrender.com", HTTP_X_ECOLE=code)

    def connexion_ecole(self, code, email):
        r = self.client_ecole(code).post("/api/auth/connexion", {"email": email, "password": MDP}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()["access"]

    def test_l_en_tete_choisit_l_ecole(self):
        self.assertEqual(self.client_ecole("lycee-a").get("/api/ecole/config").json()["nom"], "Lycée A")
        self.assertEqual(self.client_ecole("ecole-b").get("/api/ecole/config").json()["nom"], "École B")

    def test_console_avec_le_code_admin(self):
        jeton = self.connexion_ecole("admin", "root@nexusecole.sn")
        r = self.client_ecole("admin").get("/api/admin/statistiques", HTTP_AUTHORIZATION=f"Bearer {jeton}")
        self.assertEqual(r.json()["ecoles_total"], 2)

    def test_jeton_d_une_ecole_refuse_avec_le_code_d_une_autre(self):
        jeton_a = self.connexion_ecole("lycee-a", "dir@a.sn")
        r = self.client_ecole("ecole-b").get("/api/eleves", HTTP_AUTHORIZATION=f"Bearer {jeton_a}")
        self.assertEqual(r.status_code, 401)
        r = self.client_ecole("admin").get("/api/admin/ecoles", HTTP_AUTHORIZATION=f"Bearer {jeton_a}")
        self.assertEqual(r.status_code, 401)

    def test_codes_invalides_ou_inconnus(self):
        for code in ("../etc", "lycee a", "x" * 41, "inconnue"):
            self.assertEqual(self.client_ecole(code).get("/api/ecole/config").status_code, 404, code)


class ModeSousDomaineInchangeTests(BaseMultiEcole):
    def test_en_tete_ignore_hors_mode_chemin(self):
        # Sans ECOLE_PAR_EN_TETE, l'en-tête ne permet pas de changer d'école : seul l'hôte compte
        r = APIClient(HTTP_HOST="lycee-a.localhost", HTTP_X_ECOLE="ecole-b").get("/api/ecole/config")
        self.assertEqual(r.json()["nom"], "Lycée A")


class InterfaceServieTests(BaseMultiEcole):
    def setUp(self):
        super().setUp()
        self.dossier = tempfile.TemporaryDirectory()
        racine = Path(self.dossier.name)
        (racine / "assets").mkdir()
        (racine / "index.html").write_text("<!doctype html><title>NexusEcole</title>")
        (racine / "assets" / "app-123.js").write_text("console.log(1)")
        self.addCleanup(self.dossier.cleanup)
        self.reglages = override_settings(FRONTEND_DIST=self.dossier.name)
        self.reglages.enable()
        self.addCleanup(self.reglages.disable)

    def test_routes_de_l_application_renvoient_index(self):
        for chemin in ("/", "/e/lycee-a/eleves/12", "/console/ecoles"):
            r = APIClient().get(chemin)
            self.assertEqual(r.status_code, 200, chemin)
            self.assertIn(b"NexusEcole", b"".join(r.streaming_content))
            self.assertEqual(r["Cache-Control"], "no-cache")

    def test_fichiers_versionnes_en_cache_long(self):
        r = APIClient().get("/assets/app-123.js")
        self.assertEqual(b"".join(r.streaming_content), b"console.log(1)")
        self.assertIn("immutable", r["Cache-Control"])

    def test_pas_de_sortie_du_dossier(self):
        r = APIClient().get("/assets/../../../etc/passwd")
        contenu = b"".join(r.streaming_content) if r.status_code == 200 else b""
        self.assertNotIn(b"root:", contenu)

    def test_l_api_n_est_pas_interceptee(self):
        r = APIClient(HTTP_HOST="lycee-a.localhost").get("/api/ecole/config")
        self.assertEqual(r.json()["nom"], "Lycée A")


class SantePlateformeTests(BaseMultiEcole):
    def test_sonde_sans_ecole(self):
        r = APIClient(HTTP_HOST="nimporte.quoi.example").get("/api/sante-plateforme")
        self.assertEqual((r.status_code, r.json()), (200, {"ok": True}))
