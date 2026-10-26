"""Rôles personnalisés : chaque rôle a un nom, une description et ses droits ; chaque compte pointe vers son rôle."""
import django.db.models.deletion
from django.db import connection, migrations, models

ORIGINE = {
    "directeur": ("Directeur", "Tous les droits, y compris ceux ajoutés plus tard.", []),
    "secretaire": ("Secrétariat", "Dossiers des élèves, familles et inscriptions.", ["classes.toutes", "responsables.gerer"]),
    "comptable": ("Comptable / Caissier", "Encaissements, reçus et impayés.", ["classes.toutes"]),
    "enseignant": ("Enseignant", "Ses classes : notes, appel, emploi du temps.", []),
    "surveillant": ("Surveillant", "Les classes qui lui sont affectées : appel et notes.", []),
}


def installer(apps, schema_editor):
    if connection.schema_name == "public":
        return
    RoleEcole = apps.get_model("comptes", "RoleEcole")
    Utilisateur = apps.get_model("comptes", "Utilisateur")
    # Parents et élèves n'ont pas de rôle de gestion : leur accès vient des liens avec les élèves
    RoleEcole.objects.filter(code__in=["parent", "eleve"]).delete()
    for code, (nom, description, ajouts) in ORIGINE.items():
        role, cree = RoleEcole.objects.get_or_create(code=code, defaults={"nom": nom, "permissions": ajouts})
        role.nom, role.description = nom, description
        if not cree:  # nouveaux droits du catalogue, ajoutés aux droits déjà réglés par l'école
            role.permissions = sorted(set(role.permissions) | set(ajouts))
        role.save()
        Utilisateur.objects.filter(role=code, role_ecole__isnull=True).update(role_ecole=role)


class Migration(migrations.Migration):
    dependencies = [("comptes", "0003_roles_par_defaut")]

    operations = [
        migrations.AlterField("roleecole", "code", models.CharField(
            blank=True, help_text="Rôle d'origine (directeur, enseignant…) ; vide pour un rôle créé par l'école",
            max_length=15, null=True, unique=True)),
        migrations.AddField("roleecole", "nom", models.CharField(max_length=60, null=True)),
        migrations.AddField("roleecole", "description", models.CharField(blank=True, max_length=300)),
        migrations.AlterModelOptions("roleecole", {"ordering": ["code", "nom"]}),
        migrations.AlterField("utilisateur", "role", models.CharField(max_length=15, choices=[
            ("superadmin", "Super-admin NexusEcole"), ("directeur", "Directeur / Fondateur"), ("secretaire", "Secrétariat"),
            ("comptable", "Comptabilité"), ("enseignant", "Enseignant"), ("surveillant", "Surveillant / Censeur"),
            ("personnel", "Personnel (rôle personnalisé)"), ("parent", "Parent"), ("eleve", "Élève")])),
        migrations.AddField("utilisateur", "role_ecole", models.ForeignKey(
            blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="comptes", to="comptes.roleecole")),
        migrations.RunPython(installer, migrations.RunPython.noop),
        migrations.AlterField("roleecole", "nom", models.CharField(max_length=60, unique=True)),
    ]
