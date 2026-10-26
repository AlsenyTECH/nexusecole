"""Rôles personnalisés, parents / tuteurs et espace famille, enseignants et leur périmètre, emploi du temps."""
from datetime import time

from django.utils import timezone
from django_tenants.utils import schema_context

from clients.models import Ecole
from comptes.models import RoleEcole
from pedagogie.models import Cours, Matiere, Periode
from scolarite.models import Classe, Eleve

from .test_finances import BaseFinances
from .test_isolation import HOTE_A, HOTE_B, MDP


class RolesPersonnalisesTests(BaseFinances):
    def test_creer_attribuer_et_supprimer_un_role(self):
        r = self.dir.post("/api/roles", {"nom": "Économe", "description": "Suit la caisse",
                                         "permissions": ["frais.voir", "frais.rapports"]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        role = r.json()["id"]
        self.assertFalse(r.json()["systeme"])
        self.assertEqual(self.dir.post("/api/roles", {"nom": "économe", "permissions": []}, format="json").status_code, 400)

        r = self.dir.post("/api/personnel", {"email": "econome@a.sn", "prenom": "Ndèye", "role_ecole": role,
                                             "mot_de_passe": MDP}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["role"], r.json()["role_nom"]), ("personnel", "Économe"))
        econome = self.auth(HOTE_A, "econome@a.sn")
        self.assertEqual(econome.get("/api/moi").json()["permissions"], ["frais.rapports", "frais.voir"])
        self.assertEqual(econome.get("/api/finances/impayes").status_code, 200)
        self.assertEqual(econome.get("/api/eleves").status_code, 403)

        # Un rôle attribué ne se supprime pas ; un rôle libre, si
        self.assertEqual(self.dir.delete(f"/api/roles/{role}").status_code, 400)
        libre = self.dir.post("/api/roles", {"nom": "Bibliothécaire", "permissions": ["eleves.voir"]}, format="json").json()["id"]
        self.assertEqual(self.dir.delete(f"/api/roles/{libre}").status_code, 204)

    def test_on_ne_donne_que_les_droits_qu_on_a(self):
        with schema_context(self.ecole_a.schema_name):
            RoleEcole.objects.filter(code="secretaire").update(permissions=["roles.gerer", "eleves.voir", "utilisateurs.gerer"])
        secret = self.auth(HOTE_A, "secret@a.sn")
        r = secret.post("/api/roles", {"nom": "Caisse bis", "permissions": ["frais.encaisser"]}, format="json")
        self.assertEqual(r.status_code, 403)
        r = secret.post("/api/roles", {"nom": "Lecteur", "permissions": ["eleves.voir"]}, format="json")
        self.assertEqual(r.status_code, 201)
        # Ni à soi-même via son propre rôle…
        mon_role = next(x["id"] for x in secret.get("/api/roles").json()["roles"] if x["code"] == "secretaire")
        r = secret.patch(f"/api/roles/{mon_role}", {"permissions": ["roles.gerer", "eleves.voir", "utilisateurs.gerer",
                                                                    "frais.encaisser"]}, format="json")
        self.assertEqual(r.status_code, 403)
        # … ni en attribuant à quelqu'un un rôle plus puissant que le sien
        comptable = next(x["id"] for x in secret.get("/api/roles").json()["roles"] if x["code"] == "comptable")
        r = secret.post("/api/personnel", {"email": "x@a.sn", "role_ecole": comptable, "mot_de_passe": MDP}, format="json")
        self.assertEqual(r.status_code, 403)


class BaseFamilles(BaseFinances):
    def setUp(self):
        super().setUp()
        Ecole.objects.filter(pk=self.ecole_a.pk).update(modules_supplementaires=["parents"])
        self.secret = self.auth(HOTE_A, "secret@a.sn")

    def nouvel_eleve(self, client=None, **extra):
        r = (client or self.secret).post("/api/eleves", {"prenom": "Aïda", "nom": "Ndiaye", "sexe": "F",
                                                         "lieu_naissance": "Thiès", **extra}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()


class ResponsablesTests(BaseFamilles):
    def test_eleve_cree_avec_ses_parents_et_son_tuteur(self):
        e = self.nouvel_eleve(responsables=[
            {"lien": "pere", "prenom": "Ibrahima", "nom": "Ndiaye", "telephone": "77 111 22 33"},
            {"lien": "tuteur", "prenom": "Mariama", "nom": "Diallo", "telephone": "76 444 55 66", "contact_principal": True,
             "acces": {"email": "Tutrice@Mail.sn", "mot_de_passe": MDP}},
        ])
        self.assertRegex(e["matricule"], r"^\d{4}-\d{4}$")  # matricule automatique
        liens = self.secret.get(f"/api/eleves/{e['id']}/responsables").json()
        self.assertEqual([(l["lien"], l["contact_principal"]) for l in liens], [("tuteur", True), ("pere", False)])
        self.assertEqual(liens[0]["responsable"]["acces"]["email"], "tutrice@mail.sn")
        self.assertIsNone(liens[1]["responsable"]["acces"])
        self.assertEqual(self.secret.get(f"/api/eleves/{e['id']}").json()["telephone_contact"], "76 444 55 66")
        self.assertEqual(self.connexion(HOTE_A, "tutrice@mail.sn").status_code, 200)

    def test_fratrie_et_detachement(self):
        e1 = self.nouvel_eleve(responsables=[{"lien": "mere", "nom": "Sarr", "telephone": "70 000 00 01"}])
        mere = self.secret.get(f"/api/eleves/{e1['id']}/responsables").json()[0]["responsable"]["id"]
        e2 = self.nouvel_eleve(prenom="Omar")
        r = self.secret.post(f"/api/eleves/{e2['id']}/responsables", {"responsable": mere, "lien": "mere"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(r.json()["contact_principal"])  # seul responsable → contact principal
        r = self.secret.post(f"/api/eleves/{e2['id']}/responsables", {"responsable": mere, "lien": "mere"}, format="json")
        self.assertEqual(r.status_code, 400)  # déjà rattachée
        fiche = self.secret.get(f"/api/responsables/{mere}").json()
        self.assertEqual({x["eleve"] for x in fiche["enfants"]}, {e1["id"], e2["id"]})
        lien = self.secret.get(f"/api/eleves/{e2['id']}/responsables").json()[0]["id"]
        self.assertEqual(self.secret.delete(f"/api/liens-responsables/{lien}").status_code, 204)
        self.assertEqual(self.secret.get(f"/api/eleves/{e2['id']}/responsables").json(), [])

    def test_droit_responsables_et_forfait(self):
        r = self.caisse.post("/api/eleves", {"prenom": "a", "nom": "b", "sexe": "F",
                                             "responsables": [{"lien": "pere", "nom": "x", "telephone": "1"}]}, format="json")
        self.assertEqual(r.status_code, 403)
        Ecole.objects.filter(pk=self.ecole_a.pk).update(modules_supplementaires=[])  # forfait sans espace parents
        r = self.secret.post("/api/eleves", {"prenom": "a", "nom": "b", "sexe": "F", "responsables": [
            {"lien": "pere", "nom": "x", "telephone": "1", "acces": {"email": "p@a.sn", "mot_de_passe": MDP}}]}, format="json")
        self.assertEqual(r.status_code, 400)


class EspaceFamilleTests(BaseFamilles):
    def setUp(self):
        super().setUp()
        self.enfant = self.nouvel_eleve(responsables=[
            {"lien": "mere", "nom": "Ndiaye", "prenom": "Khady", "telephone": "77 0",
             "acces": {"email": "maman@a.sn", "mot_de_passe": MDP}}])
        self.inscription = self.inscrire(self._eleve(self.enfant["id"]))
        self.autre = self.inscrire()  # Fatou Sow, sans lien avec ce parent
        self.maman = self.auth(HOTE_A, "maman@a.sn")

    def _eleve(self, pk):
        with schema_context(self.ecole_a.schema_name):
            return Eleve.objects.get(pk=pk)

    def test_le_parent_ne_voit_que_ses_enfants(self):
        r = self.maman.get("/api/famille/enfants").json()
        self.assertEqual([e["id"] for e in r["enfants"]], [self.enfant["id"]])
        self.assertEqual(r["enfants"][0]["classe"], "6e A")
        self.assertEqual(self.maman.get(f"/api/famille/enfants/{self.enfant['id']}/scolarite").status_code, 200)
        self.assertEqual(self.maman.get(f"/api/famille/enfants/{self.eleve.pk}/scolarite").status_code, 404)
        # Aucun accès aux écrans de gestion
        for url in ("/api/eleves", f"/api/inscriptions/{self.inscription}/situation", "/api/personnel", "/api/roles",
                    "/api/responsables"):
            self.assertEqual(self.maman.get(url).status_code, 403, url)
        self.assertEqual(self.maman.get("/api/moi").json()["permissions"], [])
        # Le personnel n'entre pas dans l'espace famille
        self.assertEqual(self.dir.get("/api/famille/enfants").status_code, 403)

    def test_paiements_et_recus_de_ses_enfants_seulement(self):
        p = self.payer(self.caisse, self.inscription, 25_000).json()["id"]
        autre = self.payer(self.caisse, self.autre, 25_000).json()["id"]
        s = self.maman.get(f"/api/famille/enfants/{self.enfant['id']}/scolarite").json()
        self.assertEqual((s["paye"], len(s["paiements"])), (25_000, 1))
        self.assertEqual(self.maman.get(f"/api/famille/recus/{p}").status_code, 200)
        self.assertEqual(self.maman.get(f"/api/famille/recus/{autre}").status_code, 404)

    def test_acces_retire_ou_compte_suspendu(self):
        lien = self.secret.get(f"/api/eleves/{self.enfant['id']}/responsables").json()[0]
        self.secret.patch(f"/api/liens-responsables/{lien['id']}", {"acces_app": False}, format="json")
        self.assertEqual(self.maman.get("/api/famille/enfants").json()["enfants"], [])
        self.assertEqual(self.maman.get(f"/api/famille/enfants/{self.enfant['id']}/notes").status_code, 404)
        r = self.secret.patch(f"/api/responsables/{lien['responsable']['id']}/acces", {"actif": False}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.connexion(HOTE_A, "maman@a.sn").status_code, 401)

    def test_jeton_parent_refuse_dans_une_autre_ecole(self):
        acces = self.jeton(HOTE_A, "maman@a.sn")["access"]
        self.assertEqual(self.get(HOTE_B, "/api/famille/enfants", acces).status_code, 401)

    def test_notes_evaluations_bulletins_et_emploi_du_temps(self):
        with schema_context(self.ecole_a.schema_name):
            maths = Cours.objects.create(classe=self.sixieme, matiere=Matiere.objects.create(nom="Maths"), coefficient=4)
            t1 = Periode.objects.create(annee=self.annee, nom="1er trimestre", ordre=1, debut=self.annee.debut,
                                        fin=timezone.localdate() + timezone.timedelta(days=30))
        hier = str(timezone.localdate() - timezone.timedelta(days=1))
        ev = self.dir.post("/api/evaluations", {"cours": maths.pk, "periode": t1.pk, "titre": "Devoir 1",
                                                "date": hier}, format="json").json()["id"]
        self.dir.post(f"/api/evaluations/{ev}/notes", {"notes": [{"inscription": self.inscription, "valeur": 14},
                                                                 {"inscription": self.autre, "valeur": 8}]}, format="json")
        futur = str(timezone.localdate() + timezone.timedelta(days=7))
        self.dir.post("/api/evaluations", {"cours": maths.pk, "periode": t1.pk, "titre": "Composition", "type": "composition",
                                           "date": futur}, format="json")
        self.dir.post("/api/creneaux", {"cours": maths.pk, "jour": 1, "debut": "08:00", "fin": "10:00", "salle": "B2"},
                      format="json")

        base = f"/api/famille/enfants/{self.enfant['id']}"
        notes = self.maman.get(f"{base}/notes").json()["periodes"][0]
        self.assertEqual(notes["moyenne"], 14.0)
        self.assertEqual([n["valeur"] for n in notes["matieres"][0]["notes"]], [14.0])  # pas la note de l'autre élève
        self.assertNotIn("rang", notes)
        self.assertEqual([e["titre"] for e in self.maman.get(f"{base}/a-venir").json()], ["Composition"])
        self.assertEqual(self.maman.get(f"{base}/emploi-du-temps").json()[0]["salle"], "B2")

        self.dir.post("/api/conseils", {"classe": self.sixieme.pk, "periode": t1.pk}, format="json")
        bulletins = self.maman.get(f"{base}/bulletins").json()
        self.assertEqual(len(bulletins), 1)
        self.assertEqual(self.maman.get(f"/api/famille/bulletins/{bulletins[0]['id']}").status_code, 200)
        autre = self.dir.get(f"/api/bulletins?inscription={self.autre}").json()["results"][0]["id"]
        self.assertEqual(self.maman.get(f"/api/famille/bulletins/{autre}").status_code, 404)


class EnseignantsTests(BaseFamilles):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            self.cinquieme = Classe.objects.create(annee=self.annee, nom="5e A", niveau="5e")
            self.maths = Matiere.objects.create(nom="Mathématiques")
            self.svt = Matiere.objects.create(nom="SVT")
        self.inscrire()

    def creer_prof(self):
        r = self.dir.post("/api/enseignants", {"email": "awa.prof@a.sn", "prenom": "Awa", "nom": "Kane", "mot_de_passe": MDP,
                                               "statut": "vacataire", "matieres": [self.maths.pk], "diplome": "CAES"},
                          format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["role"], r.json()["role_nom"], r.json()["statut"]), ("enseignant", "Enseignant", "vacataire"))
        return r.json()["id"]

    def test_attribuer_des_classes(self):
        prof = self.creer_prof()
        r = self.dir.put(f"/api/enseignants/{prof}/affectations", {"affectations": [
            {"classe": self.sixieme.pk, "matiere": self.maths.pk}, {"classe": self.cinquieme.pk, "matiere": self.maths.pk}]},
            format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({a["classe_nom"] for a in r.json()}, {"6e A", "5e A"})
        r = self.dir.put(f"/api/enseignants/{prof}/affectations",
                         {"affectations": [{"classe": self.sixieme.pk, "matiere": self.maths.pk}]}, format="json")
        self.assertEqual([a["classe_nom"] for a in r.json()], ["6e A"])
        with schema_context(self.ecole_a.schema_name):
            self.assertIsNone(Cours.objects.get(classe=self.cinquieme, matiere=self.maths).enseignant)
        self.assertNotIn(prof, [p["id"] for p in self.dir.get("/api/personnel").json()["results"]])

    def test_l_enseignant_ne_voit_que_ses_classes(self):
        prof = self.creer_prof()
        self.dir.put(f"/api/enseignants/{prof}/affectations",
                     {"affectations": [{"classe": self.cinquieme.pk, "matiere": self.svt.pk}]}, format="json")
        c = self.auth(HOTE_A, "awa.prof@a.sn")
        self.assertEqual([x["nom"] for x in c.get("/api/classes").json()["results"]], ["5e A"])
        self.assertEqual(c.get("/api/eleves").json()["count"], 0)  # Fatou est en 6e A
        self.assertEqual(c.get(f"/api/eleves/{self.eleve.pk}").status_code, 404)
        with schema_context(self.ecole_a.schema_name):
            t1 = Periode.objects.create(annee=self.annee, nom="T1", ordre=1, debut=self.annee.debut, fin=self.annee.fin)
        self.assertEqual(c.get(f"/api/resultats?classe={self.sixieme.pk}&periode={t1.pk}").status_code, 404)
        self.assertEqual(c.get(f"/api/resultats?classe={self.cinquieme.pk}&periode={t1.pk}").status_code, 200)
        # La direction voit tout ; donner « classes.toutes » au rôle Enseignant élargit la vue
        self.assertEqual(self.dir.get("/api/classes").json()["count"], 2)
        with schema_context(self.ecole_a.schema_name):
            role = RoleEcole.objects.get(code="enseignant")
            role.permissions = role.permissions + ["classes.toutes"]
            role.save()
        self.assertEqual(c.get("/api/eleves").json()["count"], 3)


class EmploiDuTempsTests(BaseFamilles):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            self.cinquieme = Classe.objects.create(annee=self.annee, nom="5e A", niveau="5e")
            from comptes.models import Utilisateur
            prof = Utilisateur.objects.get(email="prof@a.sn")
            self.maths6 = Cours.objects.create(classe=self.sixieme, matiere=Matiere.objects.create(nom="Maths"), enseignant=prof)
            self.fr6 = Cours.objects.create(classe=self.sixieme, matiere=Matiere.objects.create(nom="Français"))
            self.maths5 = Cours.objects.create(classe=self.cinquieme, matiere=Matiere.objects.get(nom="Maths"), enseignant=prof)

    def creneau(self, cours, debut, fin, jour=1, salle=""):
        return self.dir.post("/api/creneaux", {"cours": cours.pk, "jour": jour, "debut": debut, "fin": fin, "salle": salle},
                             format="json")

    def test_conflits_detectes(self):
        self.assertEqual(self.creneau(self.maths6, "08:00", "10:00", salle="B1").status_code, 201)
        r = self.creneau(self.fr6, "09:00", "11:00")
        self.assertEqual(r.status_code, 400)
        self.assertIn("La classe a déjà Maths", r.json()["detail"][0])
        r = self.creneau(self.maths5, "09:30", "10:30")
        self.assertIn("a déjà cours en 6e A", r.json()["detail"][0])  # même professeur
        self.assertEqual(self.creneau(self.fr6, "10:00", "12:00", salle="b1").status_code, 201)  # bout à bout : permis
        self.assertEqual(self.creneau(self.maths6, "10:00", "09:00", jour=2).status_code, 400)
        self.assertEqual(self.creneau(self.maths5, "08:00", "09:00", jour=1, salle="B1").status_code, 400)  # salle prise

    def test_planning_du_professeur_et_droits(self):
        self.creneau(self.maths6, "08:00", "10:00")
        self.creneau(self.maths5, "10:00", "12:00")
        prof = self.auth(HOTE_A, "prof@a.sn")
        planning = prof.get("/api/creneaux/mon-planning").json()
        self.assertEqual([c["classe_nom"] for c in planning], ["6e A", "5e A"])
        r = prof.post("/api/creneaux", {"cours": self.maths6.pk, "jour": 3, "debut": "08:00", "fin": "09:00"}, format="json")
        self.assertEqual(r.status_code, 403)  # construire l'emploi du temps est un droit à part
