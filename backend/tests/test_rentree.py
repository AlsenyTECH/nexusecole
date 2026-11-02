"""Passage d'année : statut des années, reconduction, décisions de fin d'année, réinscriptions, blocage des comptes."""

from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur
from pedagogie.models import Cours, Matiere
from scolarite.models import Classe, Eleve

from .test_finances import BaseFinances
from .test_isolation import HOTE_A, MDP


class BaseRentree(BaseFinances):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            self.cinquieme = Classe.objects.create(annee=self.annee, nom="5e A", niveau="5e")
            prof = Utilisateur.objects.get(email="prof@a.sn")
            Cours.objects.create(classe=self.sixieme, matiere=Matiere.objects.create(nom="Maths"), coefficient=4, enseignant=prof)

    def reconduire(self, **options):
        r = self.dir.post(f"/api/annees/{self.annee.pk}/reconduire",
                          {"libelle": "2027-2028", "debut": "2027-10-01", "fin": "2028-07-31", **options}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()


class AnneesTests(BaseRentree):
    def test_preparer_l_annee_suivante_en_reconduisant(self):
        r = self.reconduire()
        self.assertEqual(r["annee"]["statut"], "preparation")
        self.assertEqual(r["bilan"], {"classes": 2, "frais": 3, "cours": 1, "periodes": 3})
        cible = r["annee"]["id"]
        with schema_context(self.ecole_a.schema_name):
            cours = Cours.objects.get(classe__annee=cible)
            self.assertIsNone(cours.enseignant)  # affectations des enseignants remises à zéro
            self.assertEqual(float(cours.coefficient), 4.0)
            from finances.models import Frais
            inscription = Frais.objects.get(annee=cible, libelle="Inscription")
            ancienne = Frais.objects.get(annee=self.annee, libelle="Inscription")
            self.assertEqual(inscription.premiere_echeance.year, ancienne.premiere_echeance.year + 1)
        # L'année active n'a pas changé : les listes restent sur 2026-2027
        actives = [a for a in self.dir.get("/api/annees").json()["results"] if a["active"]]
        self.assertEqual([a["libelle"] for a in actives], ["2026-2027"])
        self.assertEqual(self.dir.post(f"/api/annees/{self.annee.pk}/reconduire",
                                       {"libelle": "2027-2028", "debut": "2027-10-01", "fin": "2028-07-31"}, format="json").status_code, 400)

    def test_reconduire_sans_rien(self):
        r = self.reconduire(classes=False, frais=False, cours=False, periodes=False)
        self.assertEqual(r["bilan"], {"classes": 0, "frais": 0, "cours": 0, "periodes": 0})

    def test_activer_desactiver_cloturer(self):
        cible = self.reconduire()["annee"]["id"]
        r = self.dir.post(f"/api/annees/{cible}/statut", {"statut": "active"}, format="json").json()
        self.assertEqual(r["statut"], "active")
        statuts = {a["libelle"]: a["statut"] for a in self.dir.get("/api/annees").json()["results"]}
        self.assertEqual(statuts, {"2026-2027": "cloturee", "2027-2028": "active"})
        # Désactiver l'année active sans en activer une autre
        self.dir.post(f"/api/annees/{cible}/statut", {"statut": "preparation"}, format="json")
        self.assertFalse(any(a["active"] for a in self.dir.get("/api/annees").json()["results"]))
        # Pas de nouvelle inscription dans une année clôturée
        r = self.dir.post("/api/inscriptions", {"eleve": self.eleve.pk, "classe": self.sixieme.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.caisse.post(f"/api/annees/{cible}/statut", {"statut": "active"}, format="json").status_code, 403)

    def test_nouvelle_annee_inactive_par_defaut(self):
        r = self.dir.post("/api/annees", {"libelle": "2028-2029", "debut": "2028-10-01", "fin": "2029-07-31"}, format="json")
        self.assertEqual(r.json()["statut"], "preparation")


class DecisionsEtReinscriptionsTests(BaseRentree):
    def setUp(self):
        super().setUp()
        self.i1, self.i2 = self.inscrire(), self.inscrire(self.eleve2)
        with schema_context(self.ecole_a.schema_name):
            self.eleve3 = Eleve.objects.create(matricule="A-102", prenom="Awa", nom="Ba", sexe="F")
        self.i3 = self.inscrire(self.eleve3)
        self.cible = self.reconduire()["annee"]["id"]

    def test_decisions_puis_reinscriptions_proposees(self):
        d = self.dir.get(f"/api/decisions?classe={self.sixieme.pk}").json()
        self.assertEqual(len(d["eleves"]), 3)
        prof = self.auth(HOTE_A, "prof@a.sn")
        decisions = {"classe": self.sixieme.pk, "decisions": [
            {"inscription": self.i1, "decision": "passe"}, {"inscription": self.i2, "decision": "redouble"},
            {"inscription": self.i3, "decision": "depart"}]}
        self.assertEqual(prof.put("/api/decisions", decisions, format="json").status_code, 403)
        self.assertEqual(self.dir.put("/api/decisions", decisions, format="json").json()["enregistrees"], 3)

        r = self.dir.get(f"/api/reinscriptions?annee={self.cible}").json()
        self.assertEqual(r["source"]["libelle"], "2026-2027")
        with schema_context(self.ecole_a.schema_name):
            nouvelles = {c.nom: c.pk for c in Classe.objects.filter(annee=self.cible)}
        proposees = {l["eleve"]: l["classe_proposee"] for l in r["lignes"]}
        self.assertEqual(proposees[self.eleve.pk], nouvelles["5e A"])   # passe : 6e A → 5e A
        self.assertEqual(proposees[self.eleve2.pk], nouvelles["6e A"])  # redouble
        self.assertIsNone(proposees[self.eleve3.pk])                    # quitte l'école

        lignes = [{"eleve": e, "classe": c} for e, c in proposees.items() if c]
        self.assertEqual(self.dir.post("/api/reinscriptions", {"annee": self.cible, "lignes": lignes}, format="json").json()["reinscrits"], 2)
        self.assertEqual(self.dir.post("/api/reinscriptions", {"annee": self.cible, "lignes": lignes}, format="json").json()["reinscrits"], 0)
        insc = self.dir.get(f"/api/inscriptions?annee={self.cible}&eleve={self.eleve.pk}").json()["results"][0]
        self.assertEqual(insc["classe_nom"], "5e A")
        self.assertTrue(self.dir.get(f"/api/inscriptions/{insc['id']}/situation").json()["echeances"])  # échéances de la nouvelle année
        # La classe affichée ne change qu'à l'activation de la nouvelle année
        self.assertEqual(self.dir.get(f"/api/eleves/{self.eleve.pk}").json()["classe_nom"], "6e A")
        self.dir.post(f"/api/annees/{self.cible}/statut", {"statut": "active"}, format="json")
        self.assertEqual(self.dir.get(f"/api/eleves/{self.eleve.pk}").json()["classe_nom"], "5e A")


class ComptesTests(BaseFinances):
    def test_bloquer_un_compte_coupe_l_acces_tout_de_suite(self):
        jetons = self.jeton(HOTE_A, "prof@a.sn")
        prof = next(c for c in self.dir.get("/api/comptes?q=prof").json()["results"])
        self.assertEqual(self.dir.patch(f"/api/comptes/{prof['id']}", {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(self.get(HOTE_A, "/api/moi", jetons["access"]).status_code, 401)
        r = self.client_pour(HOTE_A).post("/api/auth/rafraichir", {"refresh": jetons["refresh"]}, format="json")
        self.assertEqual(r.status_code, 401)
        r = self.connexion(HOTE_A, "prof@a.sn")
        self.assertEqual(r.status_code, 401)
        self.assertIn("bloqué", r.json()["detail"])
        self.assertNotIn("bloqué", self.connexion(HOTE_A, "prof@a.sn", "mauvais").json()["detail"])  # rien révélé sans le mot de passe
        self.dir.patch(f"/api/comptes/{prof['id']}", {"is_active": True}, format="json")
        self.assertEqual(self.connexion(HOTE_A, "prof@a.sn").status_code, 200)

    def test_regles_de_blocage(self):
        moi = self.dir.get("/api/moi").json()["id"]
        self.assertEqual(self.dir.patch(f"/api/comptes/{moi}", {"is_active": False}, format="json").status_code, 400)
        with schema_context(self.ecole_a.schema_name):
            from comptes.models import RoleEcole
            RoleEcole.objects.filter(code="secretaire").update(permissions=["utilisateurs.gerer"])
        secret = self.auth(HOTE_A, "secret@a.sn")
        self.assertEqual(secret.patch(f"/api/comptes/{moi}", {"is_active": False}, format="json").status_code, 403)
        # Un seul directeur actif : il ne peut pas être bloqué, même par un autre directeur qu'on vient de bloquer
        with schema_context(self.ecole_a.schema_name):
            Utilisateur.objects.create_user("dir2@a.sn", MDP, role=Role.DIRECTEUR)
        dir2 = self.auth(HOTE_A, "dir2@a.sn")
        self.assertEqual(dir2.patch(f"/api/comptes/{moi}", {"is_active": False}, format="json").status_code, 200)
        autre = dir2.get("/api/moi").json()["id"]
        self.assertEqual(self.connexion(HOTE_A, "dir@a.sn").status_code, 401)
        self.assertEqual(dir2.patch(f"/api/personnel/{autre}", {"is_active": False}, format="json").status_code, 400)

    def test_suppression_seulement_sans_operation(self):
        insc = self.inscrire()
        self.payer(self.caisse, insc, 1_000)
        caissier = self.caisse.get("/api/moi").json()["id"]
        r = self.dir.delete(f"/api/personnel/{caissier}")
        self.assertEqual(r.status_code, 400)
        self.assertIn("traçabilité", r.json()["detail"])
        with schema_context(self.ecole_a.schema_name):
            neuf = Utilisateur.objects.create_user("neuf@a.sn", MDP, role=Role.SECRETAIRE).pk
        self.assertEqual(self.dir.delete(f"/api/personnel/{neuf}").status_code, 204)
        prof = self.auth(HOTE_A, "prof@a.sn").get("/api/moi").json()["id"]
        self.assertEqual(self.dir.delete(f"/api/enseignants/{prof}").status_code, 204)  # n'a jamais rien saisi
