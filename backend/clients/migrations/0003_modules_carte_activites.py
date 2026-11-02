"""Ajoute les modules Carte et Activités aux forfaits Standard et Premium existants."""
from django.db import connection, migrations


def installer(apps, schema_editor):
    if connection.schema_name != "public":
        return
    Forfait = apps.get_model("clients", "Forfait")
    for f in Forfait.objects.filter(code__in=["standard", "premium"]):
        f.modules = sorted(set(f.modules) | {"carte", "activites"})
        f.save(update_fields=["modules"])


class Migration(migrations.Migration):
    dependencies = [("clients", "0002_pays")]
    operations = [migrations.RunPython(installer, migrations.RunPython.noop)]
