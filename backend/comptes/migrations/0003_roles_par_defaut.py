"""Installe les droits par défaut des rôles dans chaque école (pas dans le schéma public)."""
from django.db import connection, migrations

DROITS = {
    "secretaire": ["eleves.voir", "eleves.gerer", "inscriptions.gerer", "frais.voir", "notes.voir"],
    "comptable": ["eleves.voir", "frais.voir", "frais.encaisser", "frais.rapports"],
    "enseignant": ["eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"],
    "surveillant": ["eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"],
    "parent": [],
    "eleve": [],
}


def installer(apps, schema_editor):
    if connection.schema_name == "public":
        return
    RoleEcole = apps.get_model("comptes", "RoleEcole")
    for code, permissions in DROITS.items():
        RoleEcole.objects.get_or_create(code=code, defaults={"permissions": permissions})


class Migration(migrations.Migration):
    dependencies = [("comptes", "0002_roleecole_alter_utilisateur_role")]
    operations = [migrations.RunPython(installer, migrations.RunPython.noop)]
