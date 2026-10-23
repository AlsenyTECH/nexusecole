"""Notes, moyennes, rangs, appel, conseil de classe, journal chaîné et bulletins signés."""
from datetime import date, timedelta

from django.utils import timezone
from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur
from pedagogie.models import Bulletin, Cours, JournalNote, Matiere, Parametres, Periode, Surveillance
from scolarite.models import Eleve

from .test_finances import BaseFinances
from .test_isolation import HOTE_A, HOTE_B, MDP


class BasePedagogie(BaseFinances):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            self.prof = Utilisateur.objects.get(email="prof@a.sn")
            self.prof2 = Utilisateur.objects.create_user("prof2@a.sn", MDP, role=Role.ENSEIGNANT, prenom="Ousmane", nom="Fall")
            self.surv = Utilisateur.objects.create_user("surv@a.sn", MDP, role=Role.SURVEILLANT)
            Utilisateur.objects.create_user("surv2@a.sn", MDP, role=Role.SURVEILLANT)
            Surveillance.objects.create(classe=self.sixieme, surveillant=self.surv)
            maths = Matiere.objects.create(nom="Mathématiques")
            francais = Matiere.objects.create(nom="Français")
            self.maths = Cours.objects.create(classe=self.sixieme, matiere=maths, coefficient=4, enseignant=self.prof)
            self.francais = Cours.objects.create(classe=self.sixieme, matiere=francais, coefficient=2, enseignant=self.prof2)
            self.t1 = Periode.objects.create(annee=self.annee, nom="1er trimestre", ordre=1,
                                             debut=timezone.localdate() - timedelta(days=30), fin=timezone.localdate() + timedelta(days=30))
            self.eleve3 = Eleve.objects.create(matricule="A-102", prenom="Awa", nom="Ba", sexe="F")
        self.i1, self.i2, self.i3 = self.inscrire(), self.inscrire(self.eleve2), self.inscrire(self.eleve3)
        self.prof_c = self.auth(HOTE_A, "prof@a.sn")
        self.prof2_c = self.auth(HOTE_A, "prof2@a.sn")
        self.surv_c = self.auth(HOTE_A, "surv@a.sn")

    def evaluation(self, client, cours, titre="Devoir 1", type="devoir", sur=20):
        r = client.post("/api/evaluations", {"cours": cours.pk, "periode": self.t1.pk, "type": type, "titre": titre,
                                             "date": str(timezone.localdate()), "sur": sur}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def noter(self, client, evaluation, notes):
        return client.post(f"/api/evaluations/{evaluation}/notes",
                           {"notes": [{"inscription": i, **n} for i, n in notes.items()]}, format="json")


class SaisieTests(BasePedagogie):
    def test_seul_le_prof_du_cours_ou_le_surveillant_affecte_saisit(self):
        ev = self.evaluation(self.prof_c, self.maths)
        self.assertEqual(self.noter(self.prof_c, ev, {self.i1: {"valeur": 12}}).status_code, 200)
        self.assertEqual(self.noter(self.prof2_c, ev, {self.i1: {"valeur": 20}}).status_code, 403)  # autre matière
        self.assertEqual(self.noter(self.surv_c, ev, {self.i2: {"valeur": 9}}).status_code, 200)  # affecté à la 6e A
        surv2 = self.auth(HOTE_A, "surv2@a.sn")
        self.assertEqual(self.noter(surv2, ev, {self.i2: {"valeur": 9}}).status_code, 403)  # pas affecté
        self.assertEqual(self.noter(self.caisse, ev, {self.i2: {"valeur": 9}}).status_code, 403)  # pas de droit notes
        r = self.prof2_c.post("/api/evaluations", {"cours": self.maths.pk, "periode": self.t1.pk, "titre": "x",
                                                    "date": str(timezone.localdate())}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_mes_cours(self):
        cours = {c["matiere_nom"] for c in self.surv_c.get("/api/cours/mes-cours").json()}
        self.assertEqual(cours, {"Mathématiques", "Français"})  # le surveillant couvre toute sa classe
        self.assertEqual({c["matiere_nom"] for c in self.prof2_c.get("/api/cours/mes-cours").json()}, {"Français"})

    def test_bornes_et_eleves_hors_classe(self):
        ev = self.evaluation(self.prof_c, self.maths, sur=10)
        self.assertEqual(self.noter(self.prof_c, ev, {self.i1: {"valeur": 11}}).status_code, 400)
        self.assertEqual(self.noter(self.prof_c, ev, {self.i1: {"valeur": -1}}).status_code, 400)
        self.assertEqual(self.noter(self.prof_c, ev, {99999: {"valeur": 5}}).status_code, 400)
        self.assertEqual(self.noter(self.prof_c, ev, {self.i1: {"valeur": "7,5"}}).status_code, 200)  # virgule acceptée

    def test_validation_des_notes_du_surveillant(self):
        with schema_context(self.ecole_a.schema_name):
            Parametres.objects.update_or_create(id=Parametres.actuels().id, defaults={"validation_notes_surveillant": True})
        ev = self.evaluation(self.prof_c, self.maths)
        self.noter(self.surv_c, ev, {self.i1: {"valeur": 15}})
        r = self.prof_c.get(f"/api/evaluations/{ev}/notes").json()
        self.assertEqual(next(e for e in r["eleves"] if e["inscription"] == self.i1)["statut"], "a_valider")
        res = self.dir.get(f"/api/resultats?classe={self.sixieme.pk}&periode={self.t1.pk}").json()
        self.assertIsNone(next(e for e in res["eleves"] if e["inscription"] == self.i1)["moyenne"])  # pas encore comptée
        self.assertEqual(self.surv_c.post(f"/api/evaluations/{ev}/valider").status_code, 403)
        self.assertEqual(self.prof_c.post(f"/api/evaluations/{ev}/valider").json()["validees"], 1)
        res = self.dir.get(f"/api/resultats?classe={self.sixieme.pk}&periode={self.t1.pk}").json()
        self.assertEqual(next(e for e in res["eleves"] if e["inscription"] == self.i1)["moyenne"], 15)


class MoyennesTests(BasePedagogie):
    def test_moyennes_coefficients_rangs_et_mentions(self):
        d1 = self.evaluation(self.prof_c, self.maths, "Devoir 1")
        d2 = self.evaluation(self.prof_c, self.maths, "Devoir 2")
        c1 = self.evaluation(self.prof_c, self.maths, "Composition", type="composition")
        cf = self.evaluation(self.prof2_c, self.francais, "Composition", type="composition", sur=10)
        self.noter(self.prof_c, d1, {self.i1: {"valeur": 10}, self.i2: {"valeur": 8}, self.i3: {"valeur": 10}})
        self.noter(self.prof_c, d2, {self.i1: {"valeur": 14}, self.i2: {"absent": True}, self.i3: {"valeur": 14}})
        self.noter(self.prof_c, c1, {self.i1: {"valeur": 16}, self.i2: {"valeur": 6}, self.i3: {"valeur": 16}})
        self.noter(self.prof2_c, cf, {self.i1: {"valeur": 8}, self.i2: {"valeur": 5}, self.i3: {"valeur": 8}})

        res = self.dir.get(f"/api/resultats?classe={self.sixieme.pk}&periode={self.t1.pk}").json()
        par = {e["inscription"]: e for e in res["eleves"]}
        maths1 = next(m for m in par[self.i1]["matieres"] if m["matiere"] == "Mathématiques")
        self.assertEqual((maths1["devoirs"], maths1["composition"], maths1["moyenne"]), (12, 16, 14))
        # Français : 8/10 ramené sur 20 = 16 ; générale = (14×4 + 16×2) / 6 = 14,67
        self.assertEqual(par[self.i1]["moyenne"], 14.67)
        self.assertEqual(par[self.i1]["mention"], "Bien")
        # Élève 2 : l'absence au devoir 2 n'est pas comptée → devoirs 8, compo 6 → 7 ; FR 10 → (28+20)/6 = 8
        self.assertEqual(par[self.i2]["moyenne"], 8)
        self.assertEqual(par[self.i2]["mention"], "Insuffisant")
        # Ex aequo : élèves 1 et 3 tous deux 1ers, élève 2 3e
        self.assertEqual((par[self.i1]["rang"], par[self.i3]["rang"], par[self.i2]["rang"]), (1, 1, 3))
        self.assertEqual(res["statistiques"]["admis"], 2)


class AppelTests(BasePedagogie):
    def test_appel_et_cumul_sur_le_bulletin(self):
        jour = str(timezone.localdate())
        r = self.prof_c.post("/api/appel", {"classe": self.sixieme.pk, "date": jour, "creneau": "matin", "eleves": [
            {"inscription": self.i1, "etat": "absence"}, {"inscription": self.i2, "etat": "retard"},
            {"inscription": self.i3, "etat": "present"}]}, format="json")
        self.assertEqual(r.json(), {"absence": 1, "retard": 1})
        etats = {e["inscription"]: e["etat"] for e in self.prof_c.get(
            f"/api/appel?classe={self.sixieme.pk}&date={jour}&creneau=matin").json()["eleves"]}
        self.assertEqual(etats[self.i1], "absence")
        # Correction : l'élève 1 était en fait présent
        self.prof_c.post("/api/appel", {"classe": self.sixieme.pk, "date": jour, "creneau": "matin",
                                        "eleves": [{"inscription": self.i1, "etat": "present"}]}, format="json")
        res = self.dir.get(f"/api/resultats?classe={self.sixieme.pk}&periode={self.t1.pk}").json()
        par = {e["inscription"]: e for e in res["eleves"]}
        self.assertEqual((par[self.i1]["absences"], par[self.i2]["retards"]), (0, 1))

    def test_appel_reserve_et_pas_dans_le_futur(self):
        demain = str(timezone.localdate() + timedelta(days=1))
        r = self.prof_c.post("/api/appel", {"classe": self.sixieme.pk, "date": demain, "eleves": []}, format="json")
        self.assertEqual(r.status_code, 400)
        surv2 = self.auth(HOTE_A, "surv2@a.sn")
        self.assertEqual(surv2.get(f"/api/appel?classe={self.sixieme.pk}&date={timezone.localdate()}").status_code, 403)


class ConseilEtBulletinsTests(BasePedagogie):
    def preparer(self):
        ev = self.evaluation(self.prof_c, self.maths, "Composition", type="composition")
        self.noter(self.prof_c, ev, {self.i1: {"valeur": 15}, self.i2: {"valeur": 9}, self.i3: {"valeur": 12}})
        return ev

    def test_conseil_verrouille_et_emet_des_bulletins_signes(self):
        ev = self.preparer()
        self.assertEqual(self.prof_c.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk},
                                          format="json").status_code, 403)  # réservé à qui valide
        r = self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk}, format="json")
        self.assertEqual(r.json()["bulletins"], 3)
        self.assertEqual(self.noter(self.prof_c, ev, {self.i1: {"valeur": 20}}).status_code, 400)  # verrouillé
        self.assertEqual(self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk},
                                       format="json").status_code, 400)  # pas deux fois

        b = self.dir.get(f"/api/bulletins?inscription={self.i1}").json()["results"][0]
        self.assertEqual((b["contenu"]["moyenne"], b["contenu"]["rang"]), (15, 1))
        public = self.client_pour(HOTE_A).get(f"/api/verifier/{b['code']}").json()  # sans connexion
        self.assertTrue(public["authentique"])
        self.assertEqual(public["eleve"], "Fatou Sow (A-100)")

    def test_bulletin_falsifie_detecte(self):
        self.preparer()
        self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk}, format="json")
        with schema_context(self.ecole_a.schema_name):
            b = Bulletin.objects.get(inscription_id=self.i2)
            b.contenu = {**b.contenu, "moyenne": 18}  # quelqu'un « remonte » la moyenne en base
            b.save()
            code = b.code
        r = self.client_pour(HOTE_A).get(f"/api/verifier/{code}").json()
        self.assertFalse(r["authentique"])

    def test_code_d_une_ecole_inconnu_dans_une_autre(self):
        self.preparer()
        self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk}, format="json")
        with schema_context(self.ecole_a.schema_name):
            code = Bulletin.objects.first().code
        self.assertEqual(self.client_pour(HOTE_B).get(f"/api/verifier/{code}").status_code, 404)

    def test_conseil_bloque_si_notes_a_valider(self):
        with schema_context(self.ecole_a.schema_name):
            Parametres.objects.update_or_create(id=Parametres.actuels().id, defaults={"validation_notes_surveillant": True})
        ev = self.evaluation(self.prof_c, self.maths)
        self.noter(self.surv_c, ev, {self.i1: {"valeur": 15}})
        r = self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": self.t1.pk}, format="json")
        self.assertEqual(r.status_code, 400)


class JournalTests(BasePedagogie):
    def test_journal_chaine_et_falsification_detectee(self):
        ev = self.evaluation(self.prof_c, self.maths)
        self.noter(self.prof_c, ev, {self.i1: {"valeur": 8}, self.i2: {"valeur": 11}})
        self.noter(self.prof_c, ev, {self.i1: {"valeur": 9}})  # correction → nouvelle ligne
        self.noter(self.prof_c, ev, {self.i1: {"valeur": 9}})  # identique → rien
        j = self.dir.get("/api/pedagogie/journal").json()
        self.assertEqual((j["intact"], j["lignes"]), (True, 3))
        with schema_context(self.ecole_a.schema_name):
            ligne = JournalNote.objects.order_by("id")[1]
            JournalNote.objects.filter(pk=ligne.pk).update(nouvelle_valeur="19")  # falsification
        j = self.dir.get("/api/pedagogie/journal").json()
        self.assertFalse(j["intact"])
        self.assertEqual(j["premiere_ligne_alteree"], ligne.pk)


class PeriodesTests(BasePedagogie):
    def test_generer_les_trimestres(self):
        with schema_context(self.ecole_a.schema_name):
            Periode.objects.all().delete()
        r = self.dir.post("/api/periodes/generer", {"annee": self.annee.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        p = r.json()
        self.assertEqual([x["nom"] for x in p], ["1er trimestre", "2e trimestre", "3e trimestre"])
        self.assertEqual((p[0]["debut"], p[-1]["fin"]), ("2026-10-01", "2027-07-31"))
        self.assertEqual(date.fromisoformat(p[1]["debut"]) - date.fromisoformat(p[0]["fin"]), timedelta(days=1))
