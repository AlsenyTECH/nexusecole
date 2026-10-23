"""Frais scolaires, reçus, annulations et droits configurables."""
from datetime import date, timedelta

from django.utils import timezone
from django_tenants.utils import schema_context

from comptes.models import Role, RoleEcole, Utilisateur
from finances.models import Frais
from scolarite.models import AnneeScolaire, Classe, Eleve

from .test_isolation import HOTE_A, MDP, BaseMultiEcole


class BaseFinances(BaseMultiEcole):
    def setUp(self):
        super().setUp()
        passe = timezone.localdate() - timedelta(days=40)  # pour avoir des échéances échues
        with schema_context(self.ecole_a.schema_name):
            self.annee = AnneeScolaire.objects.create(libelle="2026-2027", debut=date(2026, 10, 1),
                                                      fin=date(2027, 7, 31), active=True)
            self.sixieme = Classe.objects.create(annee=self.annee, nom="6e A", niveau="6e")
            self.eleve = Eleve.objects.create(matricule="A-100", prenom="Fatou", nom="Sow", sexe="F")
            self.eleve2 = Eleve.objects.create(matricule="A-101", prenom="Modou", nom="Fall", sexe="M")
            Frais.objects.create(annee=self.annee, libelle="Inscription", categorie="inscription", montant=25_000,
                                 premiere_echeance=passe)
            Frais.objects.create(annee=self.annee, libelle="Mensualité", categorie="scolarite", montant=15_000,
                                 periodicite="mensuel", nombre_echeances=10, premiere_echeance=passe, niveaux=["6e"])
            Frais.objects.create(annee=self.annee, libelle="Tenue CM2", categorie="tenue", montant=12_000,
                                 premiere_echeance=passe, niveaux=["CM2"])
            for role, email in ((Role.COMPTABLE, "caisse@a.sn"), (Role.SECRETAIRE, "secret@a.sn"),
                                (Role.ENSEIGNANT, "prof@a.sn")):
                Utilisateur.objects.create_user(email, MDP, role=role)
        self.dir = self.auth(HOTE_A, "dir@a.sn")
        self.caisse = self.auth(HOTE_A, "caisse@a.sn")

    def auth(self, hote, email):
        client = self.client_pour(hote)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jeton(hote, email)['access']}")
        return client

    def inscrire(self, eleve=None, **extra):
        r = self.dir.post("/api/inscriptions", {"eleve": (eleve or self.eleve).pk, "classe": self.sixieme.pk, **extra},
                          format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()["id"]

    def payer(self, client, inscription, montant, moyen="especes", **extra):
        return client.post("/api/paiements", {"inscription": inscription, "montant": montant, "moyen": moyen, **extra},
                           format="json")


class FraisTests(BaseFinances):
    def test_inscription_genere_les_echeances_du_niveau(self):
        insc = self.inscrire()
        s = self.dir.get(f"/api/inscriptions/{insc}/situation").json()
        self.assertEqual(len(s["echeances"]), 11)  # inscription + 10 mensualités, pas la tenue CM2
        self.assertEqual(s["total"], 25_000 + 10 * 15_000)
        self.assertEqual(s["reste"], s["total"])

    def test_echeances_dans_l_ordre_chronologique(self):
        insc = self.inscrire()
        dates = [e["date_limite"] for e in self.dir.get(f"/api/inscriptions/{insc}/situation").json()["echeances"]]
        self.assertEqual(dates, sorted(dates))

    def test_reduction_sur_la_scolarite_uniquement(self):
        insc = self.inscrire(reduction_pct=50, motif_reduction="Fratrie")
        s = self.dir.get(f"/api/inscriptions/{insc}/situation").json()
        self.assertEqual(s["total"], 25_000 + 10 * 7_500)

    def test_une_seule_inscription_par_annee(self):
        self.inscrire()
        r = self.dir.post("/api/inscriptions", {"eleve": self.eleve.pk, "classe": self.sixieme.pk}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_paiement_impute_aux_echeances_les_plus_anciennes(self):
        insc = self.inscrire()
        r = self.payer(self.caisse, insc, 30_000)
        self.assertEqual(r.status_code, 201, r.content)
        recu = self.caisse.get(f"/api/paiements/{r.json()['id']}/recu").json()
        self.assertEqual([d["montant"] for d in recu["detail"]], [25_000, 5_000])
        self.assertEqual(recu["reste_du"], 175_000 - 30_000)

    def test_numeros_de_recu_sequentiels(self):
        insc = self.inscrire()
        n1 = self.payer(self.caisse, insc, 1_000).json()["numero_recu"]
        n2 = self.payer(self.caisse, insc, 1_000).json()["numero_recu"]
        annee = timezone.localdate().year
        self.assertEqual((n1, n2), (f"R-{annee}-000001", f"R-{annee}-000002"))

    def test_paiement_sur_echeances_choisies(self):
        insc = self.inscrire()
        s = self.dir.get(f"/api/inscriptions/{insc}/situation").json()
        derniere = s["echeances"][-1]
        r = self.payer(self.caisse, insc, 15_000, echeances=[derniere["id"]])
        self.assertEqual(r.status_code, 201, r.content)
        s = self.dir.get(f"/api/inscriptions/{insc}/situation").json()
        self.assertEqual(s["echeances"][-1]["reste"], 0)
        self.assertEqual(s["echeances"][0]["reste"], 25_000)

    def test_trop_percu_refuse(self):
        insc = self.inscrire()
        r = self.payer(self.caisse, insc, 175_001)
        self.assertEqual(r.status_code, 400)
        self.assertIn("dépasse", r.json()["detail"])

    def test_reference_obligatoire_pour_wave(self):
        insc = self.inscrire()
        self.assertEqual(self.payer(self.caisse, insc, 5_000, moyen="wave").status_code, 400)
        self.assertEqual(self.payer(self.caisse, insc, 5_000, moyen="wave", reference="WV-1").status_code, 201)

    def test_un_paiement_ne_se_modifie_ni_ne_se_supprime(self):
        insc = self.inscrire()
        pid = self.payer(self.caisse, insc, 5_000).json()["id"]
        self.assertEqual(self.dir.delete(f"/api/paiements/{pid}").status_code, 405)
        self.assertEqual(self.dir.patch(f"/api/paiements/{pid}", {"montant": 1}, format="json").status_code, 405)

    def test_annulation_tracee_et_reste_retabli(self):
        insc = self.inscrire()
        pid = self.payer(self.caisse, insc, 30_000).json()["id"]
        self.assertEqual(self.dir.post(f"/api/paiements/{pid}/annuler", {}, format="json").status_code, 400)  # motif
        r = self.dir.post(f"/api/paiements/{pid}/annuler", {"motif": "Erreur de montant"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["annule"])
        self.assertEqual(self.dir.get(f"/api/inscriptions/{insc}/situation").json()["reste"], 175_000)
        self.assertEqual(self.dir.post(f"/api/paiements/{pid}/annuler", {"motif": "x"}, format="json").status_code, 400)
        self.assertTrue(self.dir.get(f"/api/paiements/{pid}/recu").json()["annule"])

    def test_caissier_ne_peut_pas_annuler_par_defaut(self):
        insc = self.inscrire()
        pid = self.payer(self.caisse, insc, 5_000).json()["id"]
        r = self.caisse.post(f"/api/paiements/{pid}/annuler", {"motif": "test"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_impayes_et_caisse_du_jour(self):
        insc = self.inscrire()
        self.inscrire(self.eleve2)
        self.payer(self.caisse, insc, 25_000)
        pid = self.payer(self.caisse, insc, 10_000, moyen="wave", reference="WV-9").json()["id"]
        self.dir.post(f"/api/paiements/{pid}/annuler", {"motif": "Doublon"}, format="json")

        impayes = self.caisse.get("/api/finances/impayes").json()
        par_eleve = {l["eleve"]: l["montant"] for l in impayes["eleves"]}
        self.assertEqual(par_eleve["Modou Fall (A-101)"], 25_000 + 15_000 * 2)  # inscription + 2 mois échus
        self.assertEqual(par_eleve["Fatou Sow (A-100)"], 15_000 * 2)

        caisse = self.caisse.get("/api/finances/caisse").json()
        self.assertEqual(caisse["total"], 25_000)  # le paiement annulé n'est pas compté
        self.assertEqual(len(caisse["annules"]), 1)


class DroitsTests(BaseFinances):
    def test_les_droits_par_defaut_s_appliquent(self):
        insc = self.inscrire()
        r = self.caisse.post("/api/eleves", {"matricule": "X", "prenom": "a", "nom": "b", "sexe": "F"}, format="json")
        self.assertEqual(r.status_code, 403)  # le caissier n'inscrit pas d'élèves
        self.assertEqual(self.payer(self.caisse, insc, 1_000).status_code, 201)
        prof = self.auth(HOTE_A, "prof@a.sn")
        self.assertEqual(self.payer(prof, insc, 1_000).status_code, 403)
        self.assertEqual(prof.get("/api/roles").status_code, 403)

    def test_le_directeur_modifie_les_droits_d_un_role(self):
        insc = self.inscrire()
        r = self.dir.patch("/api/roles/comptable", {"permissions": ["frais.voir"]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        caisse = self.auth(HOTE_A, "caisse@a.sn")
        self.assertEqual(self.payer(caisse, insc, 1_000).status_code, 403)
        self.assertEqual(caisse.get("/api/moi").json()["permissions"], ["frais.voir"])

    def test_droits_du_directeur_non_modifiables(self):
        self.assertEqual(self.dir.patch("/api/roles/directeur", {"permissions": []}, format="json").status_code, 400)

    def test_permission_inconnue_refusee(self):
        r = self.dir.patch("/api/roles/comptable", {"permissions": ["tout.faire"]}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_pas_d_elevation_de_privileges(self):
        with schema_context(self.ecole_a.schema_name):
            RoleEcole.objects.filter(code=Role.SECRETAIRE).update(permissions=["utilisateurs.gerer"])
        secret = self.auth(HOTE_A, "secret@a.sn")
        r = secret.post("/api/personnel", {"email": "nouveau@a.sn", "role": "directeur", "mot_de_passe": MDP},
                        format="json")
        self.assertEqual(r.status_code, 403)
        moi = secret.get("/api/moi").json()["id"]
        r = secret.patch(f"/api/personnel/{moi}", {"role": "comptable"}, format="json")
        self.assertEqual(r.status_code, 400)
        r = secret.post("/api/personnel", {"email": "prof2@a.sn", "role": "enseignant", "mot_de_passe": MDP},
                        format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_roles_installes_dans_chaque_ecole(self):
        roles = self.dir.get("/api/roles").json()["roles"]
        codes = {r["code"] for r in roles}
        self.assertTrue({"directeur", "comptable", "parent", "eleve"} <= codes)
        self.assertNotIn("superadmin", codes)


class TableauDeBordTests(BaseFinances):
    def test_chiffres_et_argent_selon_les_droits(self):
        insc = self.inscrire()
        self.payer(self.caisse, insc, 25_000)
        d = self.dir.get("/api/tableau-de-bord").json()
        self.assertEqual((d["annee"], d["eleves_inscrits"], d["filles"]), ("2026-2027", 1, 1))
        self.assertEqual(d["finances"]["encaisse_jour"], 25_000)
        self.assertEqual(d["finances"]["impayes"], 2 * 15_000)
        prof = self.auth(HOTE_A, "prof@a.sn").get("/api/tableau-de-bord").json()
        self.assertNotIn("finances", prof)  # l'enseignant ne voit pas l'argent

    def test_recherche_d_inscription_pour_la_caisse(self):
        self.inscrire()
        self.inscrire(self.eleve2)
        r = self.caisse.get("/api/inscriptions?q=fall").json()
        self.assertEqual([i["eleve_nom"] for i in r["results"]], ["Modou Fall (A-101)"])


class AnneeActiveTests(BaseFinances):
    def test_une_seule_annee_active(self):
        r = self.dir.post("/api/annees", {"libelle": "2027-2028", "debut": "2027-10-01", "fin": "2028-07-31", "active": True},
                          format="json")
        self.assertEqual(r.status_code, 201, r.content)
        actives = [a["libelle"] for a in self.dir.get("/api/annees").json()["results"] if a["active"]]
        self.assertEqual(actives, ["2027-2028"])
