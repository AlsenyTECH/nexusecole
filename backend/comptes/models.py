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
