"""Services à la carte, carte scolaire signée, porte-monnaie (grand livre), ventes, activités, contrôle d'accès."""
from datetime import timedelta

from django.test import override_settings
from django.utils import timezone
from django_tenants.utils import schema_context

from carte.models import Mouvement
from clients.models import Ecole
from finances.models import Caisse, Frais

from .test_finances import BaseFinances
from .test_isolation import HOTE_A, HOTE_B, MDP


class BaseCarte(BaseFinances):
    def setUp(self):
        super().setUp()
        Ecole.objects.filter(pk=self.ecole_a.pk).update(modules_supplementaires=["parents", "carte", "activites", "paiement_mobile"])
        self.secret = self.auth(HOTE_A, "secret@a.sn")
        self.insc = self.inscrire()
        with schema_context(self.ecole_a.schema_name):
            from comptes.models import Role, Utilisateur
            Utilisateur.objects.create_user("surv@a.sn", MDP, role=Role.SURVEILLANT)
        self.surv = self.auth(HOTE_A, "surv@a.sn")

    def carte(self, eleve=None):
        return self.dir.get(f"/api/eleves/{(eleve or self.eleve).pk}/carte").json()["carte"]

    def recharger(self, montant, eleve=None):
        r = self.caisse.post(f"/api/eleves/{(eleve or self.eleve).pk}/recharger", {"montant": montant, "moyen": "especes"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def solde(self, eleve=None):
        return self.dir.get(f"/api/eleves/{(eleve or self.eleve).pk}/carte").json()["portefeuille"]["solde"]


class ServicesTests(BaseCarte):
    def test_souscrire_puis_arreter_un_service(self):
        aujourdhui = timezone.localdate()
        with schema_context(self.ecole_a.schema_name):
            transport = Frais.objects.create(annee=self.annee, libelle="Transport zone 1", categorie="transport", montant=10_000,
                                             periodicite="mensuel", nombre_echeances=10, obligatoire=False,
                                             premiere_echeance=(aujourdhui - timedelta(days=62)).replace(day=5))
        # Un service à la carte n'est pas dû à l'inscription
        insc2 = self.inscrire(self.eleve2)
        libelles = [e["libelle"] for e in self.dir.get(f"/api/inscriptions/{insc2}/situation").json()["echeances"]]
        self.assertFalse(any("Transport" in l for l in libelles))

        r = self.secret.post("/api/souscriptions", {"inscription": self.insc, "frais": transport.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        transports = [e for e in self.dir.get(f"/api/inscriptions/{self.insc}/situation").json()["echeances"] if "Transport" in e["libelle"]]
        self.assertEqual(len(transports), 8)  # 10 mois dont 2 déjà passés : pas de rattrapage
        self.assertEqual(self.secret.post("/api/souscriptions", {"inscription": self.insc, "frais": transport.pk},
                                          format="json").status_code, 400)  # déjà inscrit

        # Payer le mois en cours, puis arrêter : le mois payé reste, les mois futurs non payés disparaissent
        self.payer(self.caisse, self.insc, 10_000, echeances=[transports[0]["id"]])
        r = self.secret.post(f"/api/souscriptions/{r.json()['id']}/arreter")
        self.assertEqual(r.json()["echeances_retirees"], 7)
        restants = [e for e in self.dir.get(f"/api/inscriptions/{self.insc}/situation").json()["echeances"] if "Transport" in e["libelle"]]
        self.assertEqual([e["reste"] for e in restants], [0])

    def test_frais_obligatoire_non_souscriptible_et_droits(self):
        with schema_context(self.ecole_a.schema_name):
            mensualite = Frais.objects.get(libelle="Mensualité")
        r = self.secret.post("/api/souscriptions", {"inscription": self.insc, "frais": mensualite.pk}, format="json")
        self.assertEqual(r.status_code, 400)
        prof = self.auth(HOTE_A, "prof@a.sn")
        self.assertEqual(prof.post("/api/souscriptions", {"inscription": self.insc, "frais": mensualite.pk}, format="json").status_code, 403)


class CarteTests(BaseCarte):
    def test_carte_automatique_signee_et_reemission(self):
        c = self.carte()
        self.assertTrue(c["qr"].startswith(f"NXC1.{self.ecole_a.schema_name}.{c['numero']}.1."))
        self.assertTrue(self.surv.post("/api/controle", {"qr": c["qr"]}, format="json").json()["autorise"])

        # QR modifié (autre numéro, même signature) : refusé
        morceaux = c["qr"].split(".")
        faux = ".".join(morceaux[:2] + ["12345678"] + morceaux[3:])
        r = self.surv.post("/api/controle", {"qr": faux}, format="json").json()
        self.assertFalse(r["autorise"])
        self.assertIn("falsifiée", r["motifs"][0])

        # Réémission (perte) : l'ancienne carte est refusée, la nouvelle acceptée
        nouvelle = self.dir.post(f"/api/eleves/{self.eleve.pk}/carte", {"motif": "Carte perdue"}, format="json").json()
        self.assertEqual(nouvelle["version"], 2)
        r = self.surv.post("/api/controle", {"qr": c["qr"]}, format="json").json()
        self.assertFalse(r["autorise"])
        self.assertIn("Ancienne carte", r["motifs"][0])
        self.assertTrue(self.surv.post("/api/controle", {"qr": nouvelle["qr"]}, format="json").json()["autorise"])

    def test_carte_d_une_autre_ecole_refusee(self):
        c = self.carte()
        with schema_context(self.ecole_b.schema_name):
            from comptes.models import Role, Utilisateur
            Utilisateur.objects.create_user("surv@b.sn", MDP, role=Role.SURVEILLANT)
        Ecole.objects.filter(pk=self.ecole_b.pk).update(modules_supplementaires=["carte"])
        r = self.auth(HOTE_B, "surv@b.sn").post("/api/controle", {"qr": c["qr"]}, format="json").json()
        self.assertFalse(r["autorise"])

    def test_photo(self):
        jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
        self.assertEqual(self.secret.put(f"/api/eleves/{self.eleve.pk}/photo", {"image": jpeg}, format="json").status_code, 204)
        r = self.dir.get(f"/api/eleves/{self.eleve.pk}/photo")
        self.assertEqual((r.status_code, r["Content-Type"]), (200, "image/jpeg"))
        r = self.secret.put(f"/api/eleves/{self.eleve.pk}/photo", {"image": "data:text/html;base64,PHNjcmlwdD4="}, format="json")
        self.assertEqual(r.status_code, 400)  # pas une image

    def test_entree_refusee_en_cas_de_retard_si_l_ecole_le_decide(self):
        c = self.carte()
        r = self.surv.post("/api/controle", {"qr": c["qr"]}, format="json").json()
        self.assertTrue(r["autorise"])
        self.assertFalse(r["a_jour"])  # des échéances sont échues dans le jeu de test
        self.dir.patch("/api/cartes/parametres", {"refuser_si_retard": True, "seuil_retard": 0}, format="json")
        r = self.surv.post("/api/controle", {"qr": c["qr"]}, format="json").json()
        self.assertFalse(r["autorise"])
        self.assertTrue(r["motifs"][0].startswith("Retard de paiement"))
        self.assertEqual(len(self.surv.get("/api/passages").json()["results"]), 2)
        self.surv.post("/api/controle", {"qr": "00000000"}, format="json")  # carte inconnue : passage sans élève
        self.assertIsNone(self.surv.get("/api/passages").json()["results"][0]["eleve_nom"])
        self.assertEqual(self.caisse.post("/api/controle", {"qr": c["qr"]}, format="json").status_code, 403)


class PorteMonnaieTests(BaseCarte):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            from carte.models import Article, PointDeVente
            self.cantine = PointDeVente.objects.create(nom="Cantine", caisse=Caisse.de_l_ecole())
            self.repas = Article.objects.create(point_de_vente=self.cantine, nom="Repas", prix=500)
        self.qr = self.carte()["qr"]

    def vendre(self, quantite=1):
        return self.caisse.post("/api/ventes", {"point_de_vente": self.cantine.pk, "qr": self.qr,
                                                "lignes": [{"article": self.repas.pk, "quantite": quantite}]}, format="json")

    def test_recharge_achat_plafond_blocage(self):
        self.assertEqual(self.vendre().status_code, 400)  # solde nul
        self.recharger(2_000)
        r = self.vendre(2)
        self.assertEqual((r.status_code, r.json()["solde"]), (201, 1_000))
        self.dir.patch(f"/api/eleves/{self.eleve.pk}/porte-monnaie", {"plafond_journalier": 1_200}, format="json")
        self.assertIn("Plafond", self.vendre().json()["detail"])  # 1 000 déjà dépensés aujourd'hui
        self.dir.patch(f"/api/eleves/{self.eleve.pk}/porte-monnaie", {"plafond_journalier": None, "bloque": True}, format="json")
        self.assertIn("bloqué", self.vendre().json()["detail"])
        self.assertEqual(self.solde(), 1_000)

    def test_annulation_rembourse_et_grand_livre_infalsifiable(self):
        self.recharger(1_000)
        vente = self.vendre().json()["id"]
        self.assertEqual(self.dir.post(f"/api/ventes/{vente}/annuler").status_code, 200)
        self.assertEqual(self.solde(), 1_000)
        self.assertEqual(self.dir.post(f"/api/ventes/{vente}/annuler").status_code, 400)
        self.assertTrue(self.dir.get("/api/porte-monnaie/grand-livre").json()["intact"])
        with schema_context(self.ecole_a.schema_name):
            m = Mouvement.objects.order_by("id").first()
            Mouvement.objects.filter(pk=m.pk).update(montant=100_000, solde_apres=100_000)  # falsification en base
        j = self.dir.get("/api/porte-monnaie/grand-livre").json()
        self.assertEqual((j["intact"], j["premier_mouvement_altere"]), (False, m.pk))

    def test_frais_payes_par_le_porte_monnaie_et_annulation(self):
        self.recharger(30_000)
        r = self.payer(self.caisse, self.insc, 25_000, moyen="portefeuille")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.solde(), 5_000)
        self.assertEqual(self.payer(self.caisse, self.insc, 10_000, moyen="portefeuille").status_code, 400)  # solde insuffisant
        self.dir.post(f"/api/paiements/{r.json()['id']}/annuler", {"motif": "Erreur"}, format="json")
        self.assertEqual(self.solde(), 30_000)

    def test_droits(self):
        prof = self.auth(HOTE_A, "prof@a.sn")
        self.assertEqual(prof.post(f"/api/eleves/{self.eleve.pk}/recharger", {"montant": 500}, format="json").status_code, 403)
        self.assertEqual(prof.get(f"/api/eleves/{self.eleve.pk}/porte-monnaie").status_code, 403)
        # Le secrétariat voit le solde mais ne recharge pas
        self.assertIn("portefeuille", self.secret.get(f"/api/eleves/{self.eleve.pk}/carte").json())
        self.assertEqual(self.secret.post(f"/api/eleves/{self.eleve.pk}/recharger", {"montant": 500}, format="json").status_code, 403)


class ActivitesTests(BaseCarte):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            foyer = Caisse.objects.get(code="foyer")
        r = self.dir.post("/api/activites", {"titre": "Soirée culturelle", "date": str(timezone.localdate() + timedelta(days=3)),
                                             "prix": 1_000, "places": 2, "caisse": foyer.pk}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.activite = r.json()["id"]
        self.qr = self.carte()["qr"]

    def test_ticket_porte_monnaie_controle_et_recette_hors_comptabilite(self):
        self.recharger(1_500)
        r = self.dir.post(f"/api/activites/{self.activite}/tickets", {"qr": self.qr}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.solde(), 500)
        self.assertEqual(self.dir.post(f"/api/activites/{self.activite}/tickets", {"qr": self.qr}, format="json").status_code, 400)

        invite = self.dir.post(f"/api/activites/{self.activite}/tickets", {"beneficiaire": "Cousin Ali", "moyen": "especes"},
                               format="json").json()
        self.assertTrue(invite["qr"].startswith("NXT1."))
        complet = self.dir.post(f"/api/activites/{self.activite}/tickets", {"beneficiaire": "X", "moyen": "especes"}, format="json")
        self.assertIn("Complet", complet.json()["detail"])

        controle = {"activite": self.activite}
        self.assertTrue(self.surv.post("/api/controle", {**controle, "qr": self.qr}, format="json").json()["autorise"])
        second = self.surv.post("/api/controle", {**controle, "qr": self.qr}, format="json").json()
        self.assertFalse(second["autorise"])
        self.assertIn("déjà utilisé", second["motifs"][0])
        self.assertTrue(self.surv.post("/api/controle", {**controle, "qr": invite["qr"]}, format="json").json()["autorise"])

        rapport = {c["nom"]: c for c in self.dir.get("/api/finances/caisses").json()["caisses"]}
        self.assertEqual(rapport["Foyer des élèves"]["total"], 2_000)
        self.assertFalse(rapport["Foyer des élèves"]["comptabilisee"])
        self.assertEqual(rapport["Caisse de l'école"]["total"], 0)

    def test_sans_ticket_refuse_et_annulation_rembourse(self):
        r = self.surv.post("/api/controle", {"activite": self.activite, "qr": self.qr}, format="json").json()
        self.assertEqual((r["autorise"], r["motifs"]), (False, ["Pas de ticket pour cette activité."]))
        self.recharger(1_000)
        t = self.dir.post(f"/api/activites/{self.activite}/tickets", {"qr": self.qr}, format="json").json()
        self.dir.post(f"/api/activites/{self.activite}/tickets/{t['id']}/annuler")
        self.assertEqual(self.solde(), 1_000)
        rapport = {c["nom"]: c for c in self.dir.get("/api/finances/caisses").json()["caisses"]}
        self.assertEqual(rapport["Foyer des élèves"]["total"], 0)  # remboursé : pas une recette


class FamilleCarteTests(BaseCarte):
    def setUp(self):
        super().setUp()
        r = self.secret.post(f"/api/eleves/{self.eleve.pk}/responsables", {
            "lien": "mere", "nom": "Sow", "telephone": "77 0", "acces": {"email": "maman@a.sn", "mot_de_passe": MDP}}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.maman = self.auth(HOTE_A, "maman@a.sn")
        self.base = f"/api/famille/enfants/{self.eleve.pk}"

    def test_porte_monnaie_et_carte_virtuelle(self):
        self.recharger(3_000)
        pm = self.maman.get(f"{self.base}/porte-monnaie").json()
        self.assertEqual((pm["solde"], pm["mouvements"][0]["montant"]), (3_000, 3_000))
        self.assertTrue(pm["carte"]["qr"].startswith("NXC1."))
        self.maman.patch(f"{self.base}/reglages", {"bloque": True}, format="json")
        self.assertTrue(self.maman.get(f"{self.base}/porte-monnaie").json()["bloque"])
        self.assertEqual(self.maman.get(f"/api/famille/enfants/{self.eleve2.pk}/porte-monnaie").status_code, 404)

    def test_recharge_en_ligne_desactivee_par_defaut(self):
        r = self.maman.post(f"{self.base}/recharges", {"montant": 5_000, "operateur": "wave"}, format="json")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(self.client_pour(HOTE_A).get("/api/paiements-mobiles/simulateur/x").status_code, 404)

    @override_settings(PAIEMENT_MOBILE_SIMULATION="lycee_demo")
    def test_simulation_limitee_aux_ecoles_listees(self):
        r = self.maman.post(f"{self.base}/recharges", {"montant": 5_000, "operateur": "wave"}, format="json")
        self.assertEqual(r.status_code, 503)  # l'école A n'est pas l'école de démonstration

    @override_settings(PAIEMENT_MOBILE_SIMULATION=True)
    def test_recharge_simulee_creditee_une_seule_fois(self):
        r = self.maman.post(f"{self.base}/recharges", {"montant": 5_000, "operateur": "wave"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        ref = r.json()["reference"]
        operateur = self.client_pour(HOTE_A)
        self.assertEqual(operateur.get(f"/api/paiements-mobiles/simulateur/{ref}").json()["montant"], 5_000)
        operateur.post(f"/api/paiements-mobiles/simulateur/{ref}", {"succes": True}, format="json")
        operateur.post(f"/api/paiements-mobiles/simulateur/{ref}", {"succes": True}, format="json")  # notification rejouée
        self.assertEqual(self.solde(), 5_000)
        self.assertEqual(self.maman.post(f"{self.base}/recharges", {"montant": 10, "operateur": "wave"}, format="json").status_code, 400)

    def test_acheter_un_ticket_et_payer_une_echeance(self):
        with schema_context(self.ecole_a.schema_name):
            foyer = Caisse.objects.get(code="foyer")
        a = self.dir.post("/api/activites", {"titre": "Kermesse", "date": str(timezone.localdate()), "prix": 500,
                                             "caisse": foyer.pk}, format="json").json()["id"]
        self.recharger(30_000)
        activites = self.maman.get(f"{self.base}/activites").json()
        self.assertTrue(activites[0]["achetable"])
        self.assertEqual(self.maman.post(f"{self.base}/tickets", {"activite": a}, format="json").status_code, 201)
        self.assertFalse(self.maman.get(f"{self.base}/activites").json()[0]["achetable"])

        echeance = self.maman.get(f"{self.base}/scolarite").json()["echeances"][0]
        r = self.maman.post(f"{self.base}/echeances/{echeance['id']}/payer")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.solde(), 30_000 - 500 - echeance["reste"])
        self.assertEqual(self.maman.post(f"{self.base}/echeances/{echeance['id']}/payer").status_code, 400)  # déjà réglée
        autre = self.inscrire(self.eleve2)
        e2 = self.dir.get(f"/api/inscriptions/{autre}/situation").json()["echeances"][0]["id"]
        self.assertEqual(self.maman.post(f"{self.base}/echeances/{e2}/payer").status_code, 404)  # pas son enfant
