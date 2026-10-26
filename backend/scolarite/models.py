"""Modèles propres à chaque école (créés dans le schéma de l'école)."""
from django.conf import settings
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
    bareme = models.PositiveSmallIntegerField(default=20, choices=[(10, "Sur 10"), (20, "Sur 20")],
                                              help_text="Barème des notes : /10 à l'élémentaire, /20 ensuite")

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
    lieu_naissance = models.CharField(max_length=80, blank=True)
    nationalite = models.CharField(max_length=40, blank=True, default="Sénégalaise")
    adresse = models.CharField(max_length=200, blank=True)
    ancien_etablissement = models.CharField(max_length=120, blank=True)
    date_entree = models.DateField(null=True, blank=True, help_text="Arrivée dans l'établissement")
    informations_medicales = models.TextField(blank=True, help_text="Allergies, traitements, personne à prévenir…")
    classe = models.ForeignKey(Classe, null=True, blank=True, on_delete=models.SET_NULL, related_name="eleves")
    # Ancien champ de contact rapide ; les parents et tuteurs sont désormais des Responsables
    telephone_parent = models.CharField(max_length=30, blank=True)
    actif = models.BooleanField(default=True)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom} ({self.matricule})"

    @property
    def telephone_contact(self):
        """Téléphone à appeler : le contact principal, sinon un autre responsable, sinon l'ancien champ."""
        for lien in self.liens.all():
            if lien.responsable.telephone:
                return lien.responsable.telephone
        return self.telephone_parent


class Inscription(models.Model):
    """Un élève dans une classe pour une année : base des frais, notes et absences de l'année."""

    class Statut(models.TextChoices):
        ACTIVE = "active", "Active"
        TRANSFEREE = "transferee", "Transférée (a quitté l'école)"
        ABANDON = "abandon", "Abandon"

    eleve = models.ForeignKey(Eleve, on_delete=models.PROTECT, related_name="inscriptions")
    classe = models.ForeignKey(Classe, on_delete=models.PROTECT, related_name="inscriptions")
    annee = models.ForeignKey(AnneeScolaire, on_delete=models.PROTECT, related_name="inscriptions")
    date_inscription = models.DateField(auto_now_add=True)
    statut = models.CharField(max_length=12, choices=Statut.choices, default=Statut.ACTIVE)
    reduction_pct = models.PositiveSmallIntegerField(default=0, help_text="Réduction sur les frais de scolarité (%)")
    motif_reduction = models.CharField(max_length=120, blank=True)

    class Meta:
        ordering = ["classe__nom", "eleve__nom", "eleve__prenom"]
        constraints = [
            models.UniqueConstraint(fields=["eleve", "annee"], name="une_inscription_par_eleve_et_par_annee"),
            models.CheckConstraint(condition=models.Q(reduction_pct__lte=100), name="reduction_max_100"),
        ]

    def save(self, *args, **kwargs):
        self.annee_id = self.classe.annee_id
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.eleve} – {self.classe}"


class Responsable(models.Model):
    """
    Parent ou tuteur. Une même personne peut suivre plusieurs élèves (fratrie) ;
    un élève peut avoir plusieurs responsables (père, mère, tuteur…).
    Son compte d'accès à l'application (facultatif) est un Utilisateur de type « parent ».
    """

    prenom = models.CharField(max_length=80, blank=True)
    nom = models.CharField(max_length=80)
    telephone = models.CharField(max_length=30)
    telephone2 = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    profession = models.CharField(max_length=80, blank=True)
    adresse = models.CharField(max_length=200, blank=True)
    utilisateur = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name="responsable")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["nom", "prenom"]

    def __str__(self):
        return f"{self.prenom} {self.nom}".strip()


class LienResponsable(models.Model):
    class Lien(models.TextChoices):
        PERE = "pere", "Père"
        MERE = "mere", "Mère"
        TUTEUR = "tuteur", "Tuteur légal"
        AUTRE = "autre", "Autre (oncle, tante, grand-parent…)"

    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE, related_name="liens")
    responsable = models.ForeignKey(Responsable, on_delete=models.CASCADE, related_name="liens")
    lien = models.CharField(max_length=10, choices=Lien.choices)
    contact_principal = models.BooleanField(default=False, help_text="Appelé en premier (relances, urgences)")
    acces_app = models.BooleanField(default=True, help_text="Peut suivre cet élève dans l'application")

    class Meta:
        ordering = ["-contact_principal", "id"]
        unique_together = [("eleve", "responsable")]

    def __str__(self):
        return f"{self.responsable} ({self.get_lien_display()}) – {self.eleve}"
