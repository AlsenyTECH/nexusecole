"""
Tests de sécurité multi-tenant : ce sont les garanties qu'on vend aux écoles.
Lancer : python manage.py test
"""
from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django_tenants.utils import schema_context
from rest_framework.test import APIClient

from clients.models import Domaine, Ecole, Forfait
from clients.services import creer_ecole, installer_forfaits_par_defaut
from comptes.models import Utilisateur
from scolarite.models import Eleve

MDP = "Mot-de-passe-solide-2026"
HOTE_A = "lycee-a.localhost"
HOTE_B = "ecole-b.localhost"
HOTE_ADMIN = "admin.localhost"


class BaseMultiEcole(TestCase):
    """Deux écoles réelles (deux schémas) + le tenant public, créés une fois pour la classe."""

    @classmethod
    def setUpClass(cls):
        connection.set_schema_to_public()
        installer_forfaits_par_defaut()
        cls.public = Ecole.objects.create(schema_name="public", nom="NexusEcole", statut=Ecole.Statut.ACTIF)
        Domaine.objects.create(domain=HOTE_ADMIN, tenant=cls.public, is_primary=True)
        Utilisateur.objects.create_superuser("root@nexusecole.sn", MDP)

        starter = Forfait.objects.get(code="starter")
        cls.ecole_a = creer_ecole(nom="Lycée A", sous_domaine="lycee-a", forfait=starter,
                                  directeur={"email": "dir@a.sn", "mot_de_passe": MDP})
        cls.ecole_b = creer_ecole(nom="École B", sous_domaine="ecole-b", forfait=starter,
                                  directeur={"email": "dir@b.sn", "mot_de_passe": MDP})
        for ecole, prefixe in ((cls.ecole_a, "A"), (cls.ecole_b, "B")):
            with schema_context(ecole.schema_name):
                Eleve.objects.create(matricule=f"{prefixe}-001", prenom="Moussa", nom=f"Élève {prefixe}", sexe="M")
        connection.set_schema_to_public()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        connection.set_schema_to_public()
        for ecole in Ecole.objects.exclude(schema_name="public"):
            ecole.delete(force_drop=True)
        Ecole.objects.all().delete()
        # SQL direct : la cascade de l'ORM chercherait des tables d'école (paiements…) dans le schéma public
        with connection.cursor() as c:
            c.execute("DELETE FROM comptes_utilisateur")
        Forfait.objects.all().delete()

    def setUp(self):
        cache.clear()  # réinitialise la limitation de tentatives de connexion

    def client_pour(self, hote):
        return APIClient(HTTP_HOST=hote)

    def connexion(self, hote, email, mdp=MDP):
        return self.client_pour(hote).post("/api/auth/connexion", {"email": email, "password": mdp}, format="json")

    def jeton(self, hote, email):
        r = self.connexion(hote, email)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def get(self, hote, url, access):
        return self.client_pour(hote).get(url, HTTP_AUTHORIZATION=f"Bearer {access}")


class IsolationTests(BaseMultiEcole):
    def test_chaque_ecole_ne_voit_que_ses_eleves(self):
        acces_a = self.jeton(HOTE_A, "dir@a.sn")["access"]
        r = self.get(HOTE_A, "/api/eleves", acces_a)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([e["matricule"] for e in r.json()["results"]], ["A-001"])

    def test_jeton_ecole_a_refuse_sur_ecole_b(self):
        # Les deux directeurs ont le même id (1) dans leur schéma : sans la claim
        # `schema`, le jeton de A ouvrirait la session du directeur de B.
        with schema_context(self.ecole_a.schema_name):
            id_a = Utilisateur.objects.get(email="dir@a.sn").pk
        with schema_context(self.ecole_b.schema_name):
            id_b = Utilisateur.objects.get(email="dir@b.sn").pk
        self.assertEqual(id_a, id_b)

        acces_a = self.jeton(HOTE_A, "dir@a.sn")["access"]
        r = self.get(HOTE_B, "/api/eleves", acces_a)
        self.assertEqual(r.status_code, 401)

    def test_refresh_ecole_a_refuse_sur_ecole_b(self):
        refresh_a = self.jeton(HOTE_A, "dir@a.sn")["refresh"]
        r = self.client_pour(HOTE_B).post("/api/auth/rafraichir", {"refresh": refresh_a}, format="json")
        self.assertEqual(r.status_code, 401)

    def test_identifiants_ecole_a_inconnus_sur_ecole_b(self):
        self.assertEqual(self.connexion(HOTE_B, "dir@a.sn").status_code, 401)

    def test_jeton_ecole_refuse_sur_console_admin(self):
        acces_a = self.jeton(HOTE_A, "dir@a.sn")["access"]
        self.assertEqual(self.get(HOTE_ADMIN, "/api/admin/ecoles", acces_a).status_code, 401)

    def test_super_admin_refuse_sur_une_ecole(self):
        acces_root = self.jeton(HOTE_ADMIN, "root@nexusecole.sn")["access"]
        self.assertEqual(self.get(HOTE_A, "/api/eleves", acces_root).status_code, 401)

    def test_hote_inconnu_404(self):
        self.assertEqual(self.client_pour("inconnue.localhost").get("/api/sante").status_code, 404)


class AbonnementTests(BaseMultiEcole):
    def _statut(self, ecole, statut):
        connection.set_schema_to_public()
        Ecole.objects.filter(pk=ecole.pk).update(statut=statut)

    def test_config_marque_blanche_publique(self):
        r = self.client_pour(HOTE_A).get("/api/ecole/config")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["nom"], "Lycée A")
        self.assertIn("notes", r.json()["modules"])

    def test_ecole_suspendue_en_lecture_seule(self):
        acces = self.jeton(HOTE_A, "dir@a.sn")["access"]
        self._statut(self.ecole_a, Ecole.Statut.SUSPENDU)
        client = self.client_pour(HOTE_A)
        auth = {"HTTP_AUTHORIZATION": f"Bearer {acces}"}
        self.assertEqual(client.get("/api/eleves", **auth).status_code, 200)
        r = client.post("/api/eleves", {"matricule": "A-002", "prenom": "Fatou", "nom": "Sow", "sexe": "F"},
                        format="json", **auth)
        self.assertEqual(r.status_code, 403)

    def test_ecole_resiliee_bloquee(self):
        acces = self.jeton(HOTE_A, "dir@a.sn")["access"]
        self._statut(self.ecole_a, Ecole.Statut.RESILIE)
        self.assertEqual(self.get(HOTE_A, "/api/eleves", acces).status_code, 403)

    def test_quota_eleves_du_forfait(self):
        connection.set_schema_to_public()
        Forfait.objects.filter(code="starter").update(max_eleves=1)  # 1 élève déjà inscrit
        acces = self.jeton(HOTE_A, "dir@a.sn")["access"]
        r = self.client_pour(HOTE_A).post(
            "/api/eleves", {"matricule": "A-002", "prenom": "Fatou", "nom": "Sow", "sexe": "F"},
            format="json", HTTP_AUTHORIZATION=f"Bearer {acces}",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("Limite", str(r.json()))

    def test_paiement_reactive_ecole_suspendue(self):
        acces_root = self.jeton(HOTE_ADMIN, "root@nexusecole.sn")["access"]
        self._statut(self.ecole_b, Ecole.Statut.SUSPENDU)
        admin = self.client_pour(HOTE_ADMIN)
        auth = {"HTTP_AUTHORIZATION": f"Bearer {acces_root}"}
        f = admin.post(f"/api/admin/ecoles/{self.ecole_b.pk}/facturer", {"mois": 10}, format="json", **auth)
        self.assertEqual(f.status_code, 201, f.content)
        self.assertEqual(f.json()["montant"], 25_000 * 8)  # 10 mois payés = 2 offerts
        p = admin.post(f"/api/admin/factures/{f.json()['id']}/payer",
                       {"moyen": "wave", "reference": "WV-123"}, format="json", **auth)
        self.assertEqual(p.json()["statut"], "payee")
        connection.set_schema_to_public()
        self.assertEqual(Ecole.objects.get(pk=self.ecole_b.pk).statut, Ecole.Statut.ACTIF)


class ConsoleAdminTests(BaseMultiEcole):
    def test_directeur_ne_peut_pas_se_connecter_a_la_console(self):
        self.assertEqual(self.connexion(HOTE_ADMIN, "dir@a.sn").status_code, 401)

    def test_sous_domaine_reserve_refuse(self):
        acces = self.jeton(HOTE_ADMIN, "root@nexusecole.sn")["access"]
        r = self.client_pour(HOTE_ADMIN).post("/api/admin/ecoles", {
            "nom": "Pirate", "sous_domaine": "admin", "forfait": "starter",
            "directeur": {"email": "x@x.sn", "mot_de_passe": MDP},
        }, format="json", HTTP_AUTHORIZATION=f"Bearer {acces}")
        self.assertEqual(r.status_code, 400)
        self.assertIn("sous_domaine", r.json())

    def test_statistiques(self):
        acces = self.jeton(HOTE_ADMIN, "root@nexusecole.sn")["access"]
        r = self.get(HOTE_ADMIN, "/api/admin/statistiques", acces)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["ecoles_total"], 2)


class CertificatsTests(BaseMultiEcole):
    """Caddy ne doit obtenir de certificat HTTPS que pour les domaines déclarés."""

    def test_domaines_connus_autorises(self):
        c = APIClient()
        for hote in (HOTE_A, HOTE_ADMIN, "LYCEE-A.localhost."):
            self.assertEqual(c.get(f"/interne/tls-autorise?domain={hote}").status_code, 200, hote)

    def test_domaine_inconnu_refuse(self):
        c = APIClient()
        self.assertEqual(c.get("/interne/tls-autorise?domain=pirate.example.com").status_code, 404)
        self.assertEqual(c.get("/interne/tls-autorise").status_code, 404)

    def test_inaccessible_a_travers_le_proxy(self):
        r = APIClient().get(f"/interne/tls-autorise?domain={HOTE_A}", HTTP_X_FORWARDED_FOR="1.2.3.4")
        self.assertEqual(r.status_code, 403)
