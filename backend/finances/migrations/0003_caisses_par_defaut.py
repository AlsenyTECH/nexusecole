"""Caisses d'origine de chaque école : celle de l'école (comptabilisée) et le foyer des élèves (non comptabilisée)."""
from django.db import connection, migrations


def installer(apps, schema_editor):
    if connection.schema_name == "public":
        return
    Caisse = apps.get_model("finances", "Caisse")
    Caisse.objects.get_or_create(code="ecole", defaults={
        "nom": "Caisse de l'école", "comptabilisee": True, "description": "Frais scolaires et ventes de l'école"})
    Caisse.objects.get_or_create(code="foyer", defaults={
        "nom": "Foyer des élèves", "comptabilisee": False,
        "description": "Recettes des activités des élèves : elles leur reviennent, hors comptabilité de l'école"})


class Migration(migrations.Migration):
    dependencies = [("finances", "0002_caisse_frais_obligatoire_alter_frais_categorie_and_more")]
    operations = [migrations.RunPython(installer, migrations.RunPython.noop)]
