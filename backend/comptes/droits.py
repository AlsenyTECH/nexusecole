"""
Catalogue des permissions d'une école et droits par défaut de chaque rôle.

Le directeur peut ensuite modifier les permissions de chaque rôle (modèle RoleEcole).
Ajouter une permission = l'ajouter ici ; elle apparaît dans l'écran « Rôles et droits ».
"""
from .models import Role

PERMISSIONS = {
    # Scolarité
    "scolarite.parametrer": "Gérer les années scolaires et les classes",
    "eleves.voir": "Voir les élèves",
    "eleves.gerer": "Créer et modifier les élèves",
    "inscriptions.gerer": "Inscrire les élèves et modifier les inscriptions",
    # Frais scolaires
    "frais.voir": "Voir les échéances et les paiements",
    "frais.parametrer": "Gérer la grille des frais",
    "frais.encaisser": "Encaisser un paiement et émettre un reçu",
    "frais.annuler": "Annuler un paiement",
    "frais.rapports": "Voir les impayés et la caisse",
    # Pédagogie (phase 1b)
    "notes.voir": "Voir les notes",
    "notes.saisir": "Saisir les notes de ses cours / classes attribués",
    "notes.saisir_toutes": "Saisir les notes de toutes les classes",
    "notes.valider": "Valider les notes et verrouiller une période",
    "absences.saisir": "Faire l'appel et saisir les absences",
    # Administration
    "utilisateurs.gerer": "Créer les comptes du personnel et attribuer les rôles",
    "roles.gerer": "Modifier les droits des rôles",
}

DROITS_PAR_DEFAUT = {
    Role.SECRETAIRE: [
        "eleves.voir", "eleves.gerer", "inscriptions.gerer", "frais.voir", "notes.voir",
    ],
    Role.COMPTABLE: [
        "eleves.voir", "frais.voir", "frais.encaisser", "frais.rapports",
    ],
    Role.ENSEIGNANT: ["eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"],
    Role.SURVEILLANT: ["eleves.voir", "notes.voir", "notes.saisir", "absences.saisir"],
    Role.PARENT: [],
    Role.ELEVE: [],
}

# Le directeur a toujours toutes les permissions : il ne peut pas se bloquer lui-même.
ROLES_TOUS_DROITS = {Role.DIRECTEUR}
