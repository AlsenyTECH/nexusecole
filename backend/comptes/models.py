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
    PARENT = "parent", "Parent"
    ELEVE = "eleve", "Élève"


class UtilisateurManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("L'email est obligatoire")
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
    role = models.CharField(max_length=15, choices=Role.choices)
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
        """Permissions du rôle de l'utilisateur dans l'école courante (mises en cache sur l'objet)."""
        if not hasattr(self, "_permissions_ecole"):
            from .droits import PERMISSIONS, ROLES_TOUS_DROITS

            if self.role in ROLES_TOUS_DROITS:
                self._permissions_ecole = set(PERMISSIONS)
            else:
                role = RoleEcole.objects.filter(code=self.role).first()
                self._permissions_ecole = set(role.permissions) if role else set()
        return self._permissions_ecole

    def a_permission(self, code):
        return self.is_active and code in self.permissions_ecole()


class RoleEcole(models.Model):
    """Droits d'un rôle dans une école, modifiables par le directeur."""

    code = models.CharField(max_length=15, choices=Role.choices, unique=True)
    permissions = models.JSONField(default=list)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.get_code_display()
