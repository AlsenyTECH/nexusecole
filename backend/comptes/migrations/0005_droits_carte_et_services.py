"""Nouveaux droits (services, carte, porte-monnaie, ventes, activités) ajoutés aux rôles d'origine."""
from django.db import connection, migrations

AJOUTS = {
    "secretaire": ["services.gerer", "cartes.gerer", "portefeuille.voir"],
    "comptable": ["services.gerer", "portefeuille.voir", "portefeuille.recharger", "ventes.encaisser"],
    "surveillant": ["acces.controler"],
}


def installer(apps, schema_editor):
    if connection.schema_name == "public":
        return
    RoleEcole = apps.get_model("comptes", "RoleEcole")
    for code, ajouts in AJOUTS.items():
        for role in RoleEcole.objects.filter(code=code):
            role.permissions = sorted(set(role.permissions) | set(ajouts))
            role.save(update_fields=["permissions"])


class Migration(migrations.Migration):
    dependencies = [("comptes", "0004_roles_personnalises")]
    operations = [migrations.RunPython(installer, migrations.RunPython.noop)]
