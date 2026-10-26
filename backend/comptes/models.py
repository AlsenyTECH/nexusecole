"""
Utilisateurs.

L'application est installée dans le schéma public ET dans chaque schéma d'école :
- dans `public`  : uniquement les super-admins NexusEcole ;
- dans une école : le personnel et les parents de CETTE école.
Un compte n'existe donc que dans un seul établissement.
"""
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class Role(models.TextChoices):
    SUPERADMIN = "superadmin", "Super-admin NexusEcole"
    DIRECTEUR = "directeur", "Directeur / Fondateur"
    SECRETAIRE = "secretaire", "Secrétariat"
    COMPTABLE = "comptable", "Comptabilité"
    ENSEIGNANT = "enseignant", "Enseignant"
    SURVEILLANT = "surveillant", "Surveillant / Censeur"
    PERSONNEL = "personnel", "Personnel (rôle personnalisé)"
    PARENT = "parent", "Parent"
    ELEVE = "eleve", "Élève"


class UtilisateurManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("L'email est obligatoire")
        if "role_ecole" not in extra and "role_ecole_id" not in extra and extra.get("role"):
            # Compte d'un type d'origine (enseignant, comptable…) : rôle d'origine correspondant
            extra["role_ecole"] = RoleEcole.objects.filter(code=extra["role"]).first()
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", Role.SUPERADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class Utilisateur(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    prenom = models.CharField(max_length=80, blank=True)
    nom = models.CharField(max_length=80, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    # Type de compte (directeur, enseignant, parent…) : fixe la logique de l'application.
    role = models.CharField(max_length=15, choices=Role.choices)
    # Rôle de l'école (d'origine ou créé par l'école) : fixe les droits.
    role_ecole = models.ForeignKey("RoleEcole", null=True, blank=True, on_delete=models.PROTECT, related_name="comptes")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    cree_le = models.DateTimeField(auto_now_add=True)

    objects = UtilisateurManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom} <{self.email}>".strip()

    @property
    def nom_complet(self):
        return f"{self.prenom} {self.nom}".strip() or self.email

    def permissions_ecole(self):
        """Permissions du compte dans l'école courante (mises en cache sur l'objet)."""
        if not hasattr(self, "_permissions_ecole"):
            from .droits import PERMISSIONS, ROLES_TOUS_DROITS, ROLES_SANS_DROITS

            if self.role in ROLES_TOUS_DROITS:
                self._permissions_ecole = set(PERMISSIONS)
            elif self.role in ROLES_SANS_DROITS:
                # Parents et élèves : leur accès vient des liens avec les élèves, jamais de droits de gestion
                self._permissions_ecole = set()
            else:
                role = self.role_ecole if self.role_ecole_id else RoleEcole.objects.filter(code=self.role).first()
                self._permissions_ecole = set(role.permissions) & set(PERMISSIONS) if role else set()
        return self._permissions_ecole

    def a_permission(self, code):
        return self.is_active and code in self.permissions_ecole()


class RoleEcole(models.Model):
    """
    Un rôle de l'école = un nom et un ensemble de droits.
    Les rôles d'origine (code renseigné) ne se suppriment pas ; l'école peut en créer d'autres
    (économe, bibliothécaire, censeur…) et les attribuer à son personnel.
    """

    code = models.CharField(max_length=15, null=True, blank=True, unique=True,
                            help_text="Rôle d'origine (directeur, enseignant…) ; vide pour un rôle créé par l'école")
    nom = models.CharField(max_length=60, unique=True)
    description = models.CharField(max_length=300, blank=True)
    permissions = models.JSONField(default=list)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code", "nom"]

    @property
    def systeme(self):
        return bool(self.code)

    def __str__(self):
        return self.nom
