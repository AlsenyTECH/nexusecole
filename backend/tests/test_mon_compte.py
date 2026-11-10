"""Écran « Mon compte » : chacun change son identifiant et son mot de passe (console et écoles)."""
from django.core.management import call_command
from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur

from .test_isolation import HOTE_A, HOTE_ADMIN, MDP, BaseMultiEcole

NOUVEAU = "Nouveau-Mdp-Test-2026"


class MonCompteTests(BaseMultiEcole):

    def changer(self, hote, connecte, **corps):
        c = self.client_pour(hote)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {self.jeton(hote, connecte)["access"]}")
        return c.patch("/api/moi", corps, format="json")

    def test_super_admin_change_son_identifiant_et_son_mot_de_passe(self):
        r = self.changer(HOTE_ADMIN, "root@nexusecole.sn", email="SuperAdmin@NexusEcole", mot_de_passe_actuel=MDP,
                         nouveau_mot_de_passe=NOUVEAU)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["email"], "superadmin@nexusecole")  # identifiant sans « .sn » accepté
        self.assertEqual(self.connexion(HOTE_ADMIN, "superadmin@nexusecole", NOUVEAU).status_code, 200)
        self.assertEqual(self.connexion(HOTE_ADMIN, "root@nexusecole.sn").status_code, 401)
        # Un redémarrage (init_plateforme) ne recrée pas l'ancien compte
        import os
        os.environ["SUPERADMIN_PASSWORD"] = MDP
        call_command("init_plateforme", email="root@nexusecole.sn", verbosity=0)
        with schema_context("public"):
            self.assertEqual(list(Utilisateur.objects.filter(role=Role.SUPERADMIN).values_list("email", flat=True)),
                             ["superadmin@nexusecole"])

    def test_directeur_d_ecole(self):
        r = self.changer(HOTE_A, "dir@a.sn", email="directeur@nexusecole", mot_de_passe_actuel=MDP, nouveau_mot_de_passe=NOUVEAU)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.connexion(HOTE_A, "directeur@nexusecole", NOUVEAU).status_code, 200)

    def test_garde_fous(self):
        self.assertEqual(self.changer(HOTE_A, "dir@a.sn", nouveau_mot_de_passe=NOUVEAU, mot_de_passe_actuel="faux").status_code, 400)
        self.assertEqual(self.changer(HOTE_A, "dir@a.sn", nouveau_mot_de_passe="1234", mot_de_passe_actuel=MDP).status_code, 400)
        self.assertEqual(self.changer(HOTE_A, "dir@a.sn", email="pas un identifiant", mot_de_passe_actuel=MDP).status_code, 400)
        with schema_context(self.ecole_a.schema_name):
            Utilisateur.objects.create_user("pris@a.sn", MDP, role=Role.SECRETAIRE)
        self.assertEqual(self.changer(HOTE_A, "dir@a.sn", email="pris@a.sn", mot_de_passe_actuel=MDP).status_code, 400)
        self.assertEqual(self.client_pour(HOTE_A).patch("/api/moi", {"mot_de_passe_actuel": MDP}, format="json").status_code, 401)
