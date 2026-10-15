"""
Initialise la plateforme : tenant public (console), forfaits par défaut, super-admin.

    python manage.py init_plateforme --email admin@nexusecole.sn
(mot de passe lu dans SUPERADMIN_PASSWORD ou demandé)
"""
import getpass
import os

from django.conf import settings
from django.core.management import BaseCommand, call_command
from django_tenants.utils import schema_context

from clients.models import Domaine, Ecole
from clients.services import installer_forfaits_par_defaut
from comptes.models import Utilisateur


class Command(BaseCommand):
    help = "Crée le tenant public, les forfaits par défaut et un super-admin"

    def add_arguments(self, parser):
        parser.add_argument("--email", required=False)

    def handle(self, *args, email=None, **opts):
        call_command("migrate_schemas", shared=True, interactive=False, verbosity=0)

        public, _ = Ecole.objects.get_or_create(
            schema_name="public", defaults={"nom": "NexusEcole", "statut": Ecole.Statut.ACTIF}
        )
        Domaine.objects.get_or_create(domain=settings.PUBLIC_DOMAIN, defaults={"tenant": public, "is_primary": True})
        installer_forfaits_par_defaut()
        self.stdout.write(self.style.SUCCESS(f"Console disponible sur {settings.PUBLIC_DOMAIN}"))

        if email:
            password = os.environ.get("SUPERADMIN_PASSWORD") or getpass.getpass("Mot de passe super-admin : ")
            with schema_context("public"):
                if not Utilisateur.objects.filter(email=email.lower()).exists():
                    Utilisateur.objects.create_superuser(email, password)
                    self.stdout.write(self.style.SUCCESS(f"Super-admin {email} créé"))
