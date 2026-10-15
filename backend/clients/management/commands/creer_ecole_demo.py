"""Crée une école de démonstration : python manage.py creer_ecole_demo demo"""
from django.core.management import BaseCommand

from clients.models import Forfait
from clients.services import creer_ecole


class Command(BaseCommand):
    def add_arguments(self, parser):
        parser.add_argument("sous_domaine")
        parser.add_argument("--forfait", default="standard")
        parser.add_argument("--mot-de-passe", default="Demo-Nexus-2026")

    def handle(self, sous_domaine, forfait, mot_de_passe, **opts):
        ecole = creer_ecole(
            nom=f"École {sous_domaine.title()}",
            sous_domaine=sous_domaine,
            forfait=Forfait.objects.get(code=forfait),
            ville="Dakar",
            directeur={"email": f"directeur@{sous_domaine}.sn", "mot_de_passe": mot_de_passe, "prenom": "Awa", "nom": "Diop"},
        )
        self.stdout.write(self.style.SUCCESS(
            f"{ecole.nom} créée → {ecole.domains.first().domain} (directeur@{sous_domaine}.sn / {mot_de_passe})"
        ))
