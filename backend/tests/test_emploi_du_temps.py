"""Génération automatique des emplois du temps : solveur, diagnostic, disponibilités, API et publication."""
from django.test import SimpleTestCase, override_settings
from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur
from pedagogie import generation
from pedagogie.generation import Donnees, Seance
from pedagogie.models import Cours, Creneau, Matiere, SalleSpecialisee
from scolarite.models import Classe

from .test_finances import BaseFinances
from .test_isolation import HOTE_A, MDP

HEURES = ["08:00", "09:00", "10:00", "11:00", "12:00", "15:00", "16:00"]
OUVERTS = {(j, i) for j in range(1, 7) for i in range(5)} | {(j, i) for j in (1, 2, 4, 5) for i in (5, 6)}


def petite_ecole(**kw):
    """Deux classes, deux profs (maths partagé), un labo."""
    s = [Seance(1, "6e A", "Maths", 1, 2, True, None), Seance(1, "6e A", "Maths", 1, 2, True, None),
         Seance(1, "6e A", "Maths", 1, 1, True, None),
         Seance(2, "6e B", "Maths", 1, 2, True, None), Seance(2, "6e B", "Maths", 1, 2, True, None),
         Seance(3, "6e A", "SVT", 2, 2, True, 1), Seance(4, "6e B", "SVT", 2, 2, True, 1)]
    return Donnees(heures=HEURES, ouverts=set(OUVERTS), seances=s, profs={1: "M. Diop", 2: "Mme Ndiaye"},
                   salles={1: ("Labo", 1)}, **kw)


def verifier(test, d, placements):
    """Contraintes dures sur une proposition."""
    occupe = {}
    for p in placements:
        for x in range(p["heure"], p["heure"] + p["duree"]):
            test.assertIn((p["jour"], x), d.ouverts)
            test.assertNotIn((p["jour"], x), d.indispo.get(p["prof"], set()))
            test.assertEqual(d.demi(x), d.demi(p["heure"]), "séance coupée par la pause de midi")
            for cle in (("classe", p["classe"]), ("prof", p["prof"]), ("salle", p["salle"] or id(p))):
                test.assertNotIn((cle, p["jour"], x), occupe, f"conflit {cle} {p}")
                occupe[cle, p["jour"], x] = p
    test.assertEqual(len(placements), len(d.seances))


class SolveurTests(SimpleTestCase):
    def test_trois_propositions_valides_et_differentes(self):
        d = petite_ecole(indispo={2: {(1, i) for i in range(7)}})  # Mme Ndiaye absente le lundi
        props = generation.resoudre(d, propositions=3, limite=10)
        self.assertEqual(len(props), 3)
        for p in props:
            verifier(self, d, p["placements"])
        self.assertEqual(props[0]["score"], 0)  # tout le confort est atteignable ici
        cles = [{(x["cours"], x["jour"], x["heure"]) for x in p["placements"]} for p in props]
        self.assertNotEqual(cles[0], cles[1])

    def test_matiere_lourde_le_matin_et_repartie(self):
        d = petite_ecole()
        p = generation.resoudre(d, propositions=1, limite=10)[0]["placements"]
        self.assertTrue(all(x["heure"] < 5 for x in p))
        jours_maths_6a = [x["jour"] for x in p if x["cours"] == 1]
        self.assertEqual(len(jours_maths_6a), len(set(jours_maths_6a)))

    def test_salle_numerotee_quand_plusieurs(self):
        d = petite_ecole()
        d.salles = {1: ("Labo", 2)}
        p = generation.resoudre(d, propositions=1, limite=10)[0]["placements"]
        self.assertTrue(all(x["salle"].startswith("Labo ") for x in p if x["matiere"] == "SVT"))

    def test_diagnostic_explique_l_impossible(self):
        d = petite_ecole(indispo={1: {(j, i) for j in range(1, 7) for i in range(7) if j > 1}})  # maths : lundi seulement
        erreurs = generation.diagnostiquer(d)["erreurs"]
        self.assertTrue(any("M. Diop a 9 h de cours mais n'est disponible que 7 h" in e for e in erreurs), erreurs)
        d = petite_ecole()
        d.ouverts = {(1, 0), (1, 1)}
        erreurs = generation.diagnostiquer(d)["erreurs"]
        self.assertTrue(any("6e A a 7 h de cours pour 2 créneaux" in e for e in erreurs), erreurs)
        self.assertTrue(any("Labo" in e for e in erreurs), erreurs)

    def test_seance_qui_ne_tient_nulle_part(self):
        d = petite_ecole()
        d.ouverts = {(j, i) for j, i in OUVERTS if i in (0, 2, 4)}  # aucun créneau consécutif
        self.assertTrue(any("séance de 2 h" in e for e in generation.diagnostiquer(d)["erreurs"]))
        self.assertEqual(generation.resoudre(d, propositions=1, limite=5), [])


@override_settings(EDT_SYNCHRONE=True)
class GenerationApiTests(BaseFinances):
    def setUp(self):
        super().setUp()
        with schema_context(self.ecole_a.schema_name):
            self.prof = Utilisateur.objects.get(email="prof@a.sn")
            self.prof2 = Utilisateur.objects.create_user("prof2@a.sn", MDP, role=Role.ENSEIGNANT, prenom="Awa",
                                                         nom="Ndiaye")
            labo = SalleSpecialisee.objects.create(nom="Labo", nombre=1)
            maths = Matiere.objects.create(nom="Maths", lourde=True)
            svt = Matiere.objects.create(nom="SVT", lourde=True, salle=labo)
            b = Classe.objects.create(annee=self.annee, nom="6e B", niveau="6e")
            self.cours = [Cours.objects.create(classe=c, matiere=maths, enseignant=self.prof, volume_horaire=4, decoupage="2+2")
                          for c in (self.sixieme, b)]
            self.cours += [Cours.objects.create(classe=c, matiere=svt, enseignant=self.prof2, volume_horaire=2, decoupage="2")
                           for c in (self.sixieme, b)]
        self.prof_client = self.auth(HOTE_A, "prof@a.sn")

    def test_generer_comparer_publier(self):
        diag = self.dir.get("/api/edt/diagnostic").json()
        self.assertEqual(diag["erreurs"], [])
        self.assertEqual(diag["charge"]["heures"], 12)
        r = self.dir.post("/api/edt/generations", {}, format="json")
        self.assertEqual(r.status_code, 202, r.content)
        gen = r.json()
        self.assertEqual(gen["statut"], "terminee", gen["message"])
        self.assertEqual(len(gen["propositions"]), 3)
        r = self.dir.post(f"/api/edt/generations/{gen['id']}/publier", {"proposition": 2}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["creneaux"], 6)
        creneaux = self.dir.get("/api/creneaux").json()
        self.assertEqual(len(creneaux), 6)
        self.assertTrue(all(c["salle"] == "Labo" for c in creneaux if c["matiere_nom"] == "SVT"))
        # Le professeur voit son planning
        self.assertEqual(len(self.prof_client.get("/api/creneaux/mon-planning").json()), 4)
        # Republier remplace (pas de doublon)
        self.dir.post(f"/api/edt/generations/{gen['id']}/publier", {"proposition": 1}, format="json")
        self.assertEqual(len(self.dir.get("/api/creneaux").json()), 6)

    def test_donnees_impossibles(self):
        self.dir.put("/api/edt/grille", {"ouverts": [[1, 0], [1, 1], [1, 2]]}, format="json")
        gen = self.dir.post("/api/edt/generations", {}, format="json").json()
        self.assertEqual(gen["statut"], "impossible")
        self.assertTrue(gen["diagnostic"]["erreurs"])

    def test_droits(self):
        self.assertEqual(self.prof_client.post("/api/edt/generations", {}, format="json").status_code, 403)
        self.assertEqual(self.prof_client.get("/api/edt/disponibilites").status_code, 403)
        self.assertEqual(self.caisse.put("/api/edt/grille", {"ouverts": []}, format="json").status_code, 403)

    def test_disponibilites_proposees_puis_validees(self):
        # Le prof propose : rien ne change tant que la direction n'a pas validé
        r = self.prof_client.put("/api/edt/mes-disponibilites", {"indispo": [[1, 0], [1, 1]], "prefere": [[2, 0]]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["indispo"], [])
        liste = {d["enseignant"]: d for d in self.dir.get("/api/edt/disponibilites").json()}
        self.assertEqual(liste[self.prof.pk]["proposition"]["indispo"], [[1, 0], [1, 1]])
        r = self.dir.post(f"/api/edt/disponibilites/{self.prof.pk}", {}, format="json").json()
        self.assertEqual(r["indispo"], [[1, 0], [1, 1]])
        self.assertIsNone(r["proposition"])
        # La direction saisit directement (créneau invalide refusé)
        self.assertEqual(self.dir.put(f"/api/edt/disponibilites/{self.prof2.pk}", {"indispo": [[7, 0]]}, format="json").status_code, 400)
        self.dir.put(f"/api/edt/disponibilites/{self.prof2.pk}", {"indispo": [[j, i] for j in (1, 2, 3) for i in range(7)]},
                     format="json")
        gen = self.dir.post("/api/edt/generations", {}, format="json").json()
        self.assertEqual(gen["statut"], "terminee", gen["message"])
        for p in gen["propositions"][0]["placements"]:
            if p["prof"] == self.prof2.pk:
                self.assertGreaterEqual(p["jour"], 4)
            if p["prof"] == self.prof.pk:
                self.assertNotIn((p["jour"], p["heure"]), {(1, 0), (1, 1)})

    def test_volume_et_decoupage(self):
        url = f"/api/cours/{self.cours[0].pk}"
        self.assertEqual(self.dir.patch(url, {"decoupage": "2+1"}, format="json").status_code, 400)
        self.assertEqual(self.dir.patch(url, {"volume_horaire": 5, "decoupage": "2+2+1"}, format="json").status_code, 200)
        self.assertEqual(self.dir.patch(url, {"decoupage": "abc"}, format="json").status_code, 400)

    def test_grille(self):
        g = self.dir.get("/api/edt/grille").json()
        self.assertEqual(len(g["ouverts"]), 38)
        self.assertEqual(self.dir.put("/api/edt/grille", {"heures": ["08:00", "08:30"]}, format="json").status_code, 400)
        r = self.dir.put("/api/edt/grille", {"heures": ["07:30", "08:30", "09:30"], "ouverts": [[1, 0]]}, format="json")
        self.assertEqual(r.json(), {"heures": ["07:30", "08:30", "09:30"], "ouverts": [[1, 0]]})
        with schema_context(self.ecole_a.schema_name):
            self.assertFalse(Creneau.objects.exists())
