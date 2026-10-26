"""
Prépare un environnement de développement prêt à l'emploi (utilisé par Docker) :
plateforme, super-admin et école de démo. Sans effet si tout existe déjà.
"""
import os

from django.core.management import BaseCommand, call_command

from clients import demo
from clients.models import Ecole, Forfait
from clients.services import creer_ecole


class Command(BaseCommand):
    help = "Initialise la plateforme et une école de démo (idempotent)"

    def handle(self, *args, **opts):
        call_command("init_plateforme", email=os.environ.get("SUPERADMIN_EMAIL", "admin@nexusecole.sn"))
        call_command("migrate_schemas", interactive=False, verbosity=0)  # migre aussi les écoles existantes

        if not Ecole.objects.filter(schema_name="lycee_demo").exists():
            creer_ecole(
                nom="Lycée Démo",
                sous_domaine="lycee-demo",
                forfait=Forfait.objects.get(code="standard"),
                ville="Dakar",
                directeur={"email": "directeur@lycee-demo.sn", "mot_de_passe": "Demo-Nexus-2026",
                           "prenom": "Awa", "nom": "Diop"},
            )
        ecole_demo = Ecole.objects.get(schema_name="lycee_demo")
        if demo.remplir(ecole_demo):
            self.stdout.write("  Données de démonstration ajoutées (élèves, frais, paiements).")
        if demo.remplir_pedagogie(ecole_demo):
            self.stdout.write("  Pédagogie de démonstration ajoutée (matières, enseignants, notes, absences).")
        if demo.remplir_familles(ecole_demo):
            self.stdout.write("  Familles de démonstration ajoutées (parents, tuteur, emploi du temps).")
        self.stdout.write(self.style.SUCCESS(
            "\n  Console : http://admin.localhost:5173      (admin@nexusecole.sn)"
            "\n  École   : http://lycee-demo.localhost:5173 (directeur@lycee-demo.sn / Demo-Nexus-2026)"
            "\n  Caisse  : caisse@lycee-demo.sn / Demo-Nexus-2026"
            "\n  Prof    : prof@lycee-demo.sn / Demo-Nexus-2026 (mathématiques)"
            "\n  Surveillant : surveillant@lycee-demo.sn / Demo-Nexus-2026 (6e A, 5e A)"
            "\n  Parent  : parent@lycee-demo.sn / Demo-Nexus-2026 (mère d'Aminata, tutrice de Babacar)\n"
        ))
