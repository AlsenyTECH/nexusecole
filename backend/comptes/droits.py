"""
Catalogue des permissions d'une école et droits par défaut de chaque rôle.

Le directeur peut ensuite modifier les droits de chaque rôle et créer ses propres rôles (modèle RoleEcole).
Ajouter une permission = l'ajouter ici ; elle apparaît dans l'écran « Rôles et droits ».
"""
from .models import Role

# code : (groupe, libellé)
CATALOGUE = {
    # Scolarité
    "scolarite.parametrer": ("Scolarité", "Gérer les années scolaires, les classes et les cours"),
    "eleves.voir": ("Scolarité", "Voir les élèves"),
    "classes.toutes": ("Scolarité", "Voir toutes les classes (sinon : uniquement les classes où l'on enseigne ou surveille)"),
    "eleves.gerer": ("Scolarité", "Créer et modifier les élèves"),
    "responsables.gerer": ("Scolarité", "Gérer les parents et tuteurs et leurs accès à l'application"),
    "inscriptions.gerer": ("Scolarité", "Inscrire les élèves et modifier les inscriptions"),
    # Frais scolaires
    "frais.voir": ("Frais scolaires", "Voir les échéances et les paiements"),
    "frais.parametrer": ("Frais scolaires", "Gérer la grille des frais"),
    "frais.encaisser": ("Frais scolaires", "Encaisser un paiement et émettre un reçu"),
    "frais.annuler": ("Frais scolaires", "Annuler un paiement"),
    "frais.rapports": ("Frais scolaires", "Voir les impayés et la caisse"),
    # Pédagogie
    "notes.voir": ("Pédagogie", "Voir les notes et les résultats"),
    "notes.saisir": ("Pédagogie", "Saisir les notes de ses cours / classes attribués"),
    "notes.saisir_toutes": ("Pédagogie", "Saisir les notes de toutes les classes"),
    "notes.valider": ("Pédagogie", "Valider les notes et tenir le conseil de classe"),
    "absences.saisir": ("Pédagogie", "Faire l'appel et saisir les absences"),
    "emploi_du_temps.gerer": ("Pédagogie", "Construire l'emploi du temps des classes"),
    # Administration
    "utilisateurs.gerer": ("Administration", "Créer les comptes du personnel et des enseignants"),
    "roles.gerer": ("Administration", "Créer et modifier les rôles et leurs droits"),
}
PERMISSIONS = {code: libelle for code, (_, libelle) in CATALOGUE.items()}

# Rôles d'origine de chaque école : (nom, description, droits par défaut)
ROLES_ORIGINE = {
    Role.DIRECTEUR: ("Directeur", "Tous les droits, y compris ceux ajoutés plus tard.", []),
    Role.SECRETAIRE: ("Secrétariat", "Dossiers des élèves, familles et inscriptions.", [
        "eleves.voir", "classes.toutes", "eleves.gerer", "responsables.gerer", "inscriptions.gerer", "frais.voir", "notes.voir"]),
    Role.COMPTABLE: ("Comptable / Caissier", "Encaissements, reçus et impayés.", [
        "eleves.voir", "classes.toutes", "frais.voir", "frais.encaisser", "frais.rapports"]),
    Role.ENSEIGNANT: ("Enseignant", "Ses classes : notes, appel, emploi du temps.", [
        "eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"]),
    Role.SURVEILLANT: ("Surveillant", "Les classes qui lui sont affectées : appel et notes.", [
        "eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"]),
}

# Le directeur a toujours toutes les permissions : il ne peut pas se bloquer lui-même.
ROLES_TOUS_DROITS = {Role.DIRECTEUR}
# Parents et élèves : un espace à part, jamais de droits de gestion.
ROLES_SANS_DROITS = {Role.PARENT, Role.ELEVE}
