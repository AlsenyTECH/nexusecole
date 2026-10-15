"""Modèles propres à chaque école (créés dans le schéma de l'école)."""
from django.db import models


class AnneeScolaire(models.Model):
    libelle = models.CharField(max_length=20, unique=True, help_text="ex. 2026-2027")
    debut = models.DateField()
    fin = models.DateField()
    active = models.BooleanField(default=False)

    class Meta:
        ordering = ["-debut"]

    def __str__(self):
        return self.libelle


class Classe(models.Model):
    annee = models.ForeignKey(AnneeScolaire, on_delete=models.PROTECT, related_name="classes")
    nom = models.CharField(max_length=40, help_text="ex. 6e A, Terminale S2")
    niveau = models.CharField(max_length=30, blank=True)

    class Meta:
        ordering = ["niveau", "nom"]
        unique_together = [("annee", "nom")]

    def __str__(self):
        return f"{self.nom} ({self.annee})"


class Eleve(models.Model):
    class Sexe(models.TextChoices):
        F = "F", "Fille"
        M = "M", "Garçon"

    matricule = models.CharField(max_length=30, unique=True)
    prenom = models.CharField(max_length=80)
    nom = models.CharField(max_length=80)
    sexe = models.CharField(max_length=1, choices=Sexe.choices)
    date_naissance = models.DateField(null=True, blank=True)
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.SET_NULL, related_name="eleves")
    telephone_parent = models.CharField(max_length=30, blank=True)
    actif = models.BooleanField(default=True)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.matricule})"
