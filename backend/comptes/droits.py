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
    "services.gerer": ("Frais scolaires", "Inscrire les élèves aux services (transport, cantine, études…)"),
    "frais.parametrer": ("Frais scolaires", "Gérer la grille des frais"),
    "frais.encaisser": ("Frais scolaires", "Encaisser un paiement et émettre un reçu"),
    "frais.annuler": ("Frais scolaires", "Annuler un paiement"),
    "frais.rapports": ("Frais scolaires", "Voir les impayés et la caisse"),
    # Carte scolaire et porte-monnaie
    "cartes.gerer": ("Carte et porte-monnaie", "Photos, impression, réémission et désactivation des cartes"),
    "acces.controler": ("Carte et porte-monnaie", "Contrôler les cartes à l'entrée (école et activités)"),
    "portefeuille.voir": ("Carte et porte-monnaie", "Voir les porte-monnaie et leurs mouvements"),
    "portefeuille.recharger": ("Carte et porte-monnaie", "Recharger un porte-monnaie au guichet"),
    "ventes.encaisser": ("Carte et porte-monnaie", "Vendre aux points de vente (cantine, boutique…) par la carte"),
    "ventes.parametrer": ("Carte et porte-monnaie", "Gérer les caisses, points de vente, articles et règles d'accès"),
    "activites.gerer": ("Carte et porte-monnaie", "Créer les activités payantes et vendre les tickets"),
    # Pédagogie
    "notes.voir": ("Pédagogie", "Voir les notes et les résultats"),
    "notes.saisir": ("Pédagogie", "Saisir les notes de ses cours / classes attribués"),
    "notes.saisir_toutes": ("Pédagogie", "Saisir les notes de toutes les classes"),
    "notes.valider": ("Pédagogie", "Valider les notes et tenir le conseil de classe"),
    "conseils.rouvrir": ("Pédagogie", "Rouvrir un conseil de classe tenu (annule les bulletins émis)"),
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
        "eleves.voir", "classes.toutes", "eleves.gerer", "responsables.gerer", "inscriptions.gerer", "frais.voir", "notes.voir",
        "services.gerer", "cartes.gerer", "portefeuille.voir"]),
    Role.COMPTABLE: ("Comptable / Caissier", "Encaissements, reçus et impayés.", [
        "eleves.voir", "classes.toutes", "frais.voir", "frais.encaisser", "frais.rapports",
        "services.gerer", "portefeuille.voir", "portefeuille.recharger", "ventes.encaisser"]),
    Role.ENSEIGNANT: ("Enseignant", "Ses classes : notes, appel, emploi du temps.", [
        "eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"]),
    Role.SURVEILLANT: ("Surveillant", "Les classes qui lui sont affectées : appel, notes, contrôle des cartes.", [
        "eleves.voir", "notes.voir", "notes.saisir", "absences.saisir", "acces.controler"]),
}

# Le directeur a toujours toutes les permissions : il ne peut pas se bloquer lui-même.
ROLES_TOUS_DROITS = {Role.DIRECTEUR}
# Parents et élèves : un espace à part, jamais de droits de gestion.
ROLES_SANS_DROITS = {Role.PARENT, Role.ELEVE}
