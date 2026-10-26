"""
Pédagogie (schéma de l'école) : matières, cours, périodes, évaluations, notes, absences, bulletins.

Règles clés :
- une note est saisie par l'enseignant du cours, ou par un surveillant affecté à la classe ;
- chaque création / modification de note est inscrite dans un journal chaîné (empreintes SHA-256) :
  modifier une ligne du journal après coup casse la chaîne et se détecte ;
- après le conseil de classe, la période est verrouillée pour la classe et les bulletins sont émis,
  signés (Ed25519) et vérifiables publiquement par QR code.
"""
from django.conf import settings
from django.db import models

from scolarite.models import AnneeScolaire, Classe, Inscription


class Parametres(models.Model):
    """Règles pédagogiques de l'école (une seule ligne). Jamais codées en dur."""

    class Decoupage(models.TextChoices):
        TRIMESTRE = "trimestre", "Trimestres"
        SEMESTRE = "semestre", "Semestres"

    decoupage = models.CharField(max_length=10, choices=Decoupage.choices, default=Decoupage.TRIMESTRE)
    poids_devoirs = models.PositiveSmallIntegerField(default=1, help_text="Poids de la moyenne des devoirs")
    poids_composition = models.PositiveSmallIntegerField(default=1, help_text="Poids de la composition")
    validation_notes_surveillant = models.BooleanField(
        default=False, help_text="Les notes saisies par un surveillant doivent être validées par l'enseignant")

    @classmethod
    def actuels(cls):
        return cls.objects.first() or cls.objects.create()


class Periode(models.Model):
    annee = models.ForeignKey(AnneeScolaire, on_delete=models.PROTECT, related_name="periodes")
    nom = models.CharField(max_length=40)
    ordre = models.PositiveSmallIntegerField()
    debut = models.DateField()
    fin = models.DateField()

    class Meta:
        ordering = ["annee", "ordre"]
        unique_together = [("annee", "ordre")]

    def __str__(self):
        return f"{self.nom} {self.annee}"


class Matiere(models.Model):
    nom = models.CharField(max_length=60, unique=True)
    code = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Cours(models.Model):
    """Une matière dans une classe : coefficient et enseignant titulaire."""

    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name="cours")
    matiere = models.ForeignKey(Matiere, on_delete=models.PROTECT, related_name="cours")
    coefficient = models.DecimalField(max_digits=4, decimal_places=1, default=1)
    enseignant = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="cours")

    class Meta:
        ordering = ["classe", "matiere__nom"]
        unique_together = [("classe", "matiere")]
        verbose_name_plural = "cours"

    def __str__(self):
        return f"{self.matiere} – {self.classe.nom}"


class Surveillance(models.Model):
    """Surveillant affecté à une classe : il peut y saisir notes et absences."""

    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name="surveillances")
    surveillant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="surveillances")

    class Meta:
        unique_together = [("classe", "surveillant")]


class Conseil(models.Model):
    """Conseil de classe d'une période : une fois verrouillé, plus aucune note ne change."""

    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name="conseils")
    periode = models.ForeignKey(Periode, on_delete=models.PROTECT, related_name="conseils")
    verrouille_le = models.DateTimeField(auto_now_add=True)
    verrouille_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        unique_together = [("classe", "periode")]


class Evaluation(models.Model):
    class Type(models.TextChoices):
        DEVOIR = "devoir", "Devoir / interrogation"
        COMPOSITION = "composition", "Composition"

    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="evaluations")
    periode = models.ForeignKey(Periode, on_delete=models.PROTECT, related_name="evaluations")
    type = models.CharField(max_length=12, choices=Type.choices, default=Type.DEVOIR)
    titre = models.CharField(max_length=80)
    date = models.DateField()
    sur = models.PositiveSmallIntegerField(default=20, help_text="Note maximale de l'évaluation")
    creee_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["date", "id"]

    def __str__(self):
        return f"{self.titre} ({self.cours})"


class Note(models.Model):
    class Statut(models.TextChoices):
        VALIDEE = "validee", "Validée"
        A_VALIDER = "a_valider", "À valider par l'enseignant"

    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="notes")
    inscription = models.ForeignKey(Inscription, on_delete=models.PROTECT, related_name="notes")
    valeur = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    absent = models.BooleanField(default=False, help_text="Absent à l'évaluation : non compté dans la moyenne")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.VALIDEE)
    saisie_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    modifiee_le = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("evaluation", "inscription")]


class JournalNote(models.Model):
    """
    Journal d'audit chaîné : chaque ligne contient l'empreinte de la précédente.
    empreinte = SHA-256(précédente | données canoniques de la ligne).
    """

    note = models.ForeignKey(Note, null=True, on_delete=models.SET_NULL, related_name="journal")
    evaluation_id_fige = models.IntegerField()
    inscription_id_fige = models.IntegerField()
    ancienne_valeur = models.CharField(max_length=12, blank=True)
    nouvelle_valeur = models.CharField(max_length=12)
    par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField()
    precedente = models.CharField(max_length=64)
    empreinte = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["id"]


class Absence(models.Model):
    class Type(models.TextChoices):
        ABSENCE = "absence", "Absence"
        RETARD = "retard", "Retard"

    class Creneau(models.TextChoices):
        MATIN = "matin", "Matin"
        APRES_MIDI = "apres_midi", "Après-midi"

    inscription = models.ForeignKey(Inscription, on_delete=models.PROTECT, related_name="absences")
    date = models.DateField()
    creneau = models.CharField(max_length=10, choices=Creneau.choices, default=Creneau.MATIN)
    type = models.CharField(max_length=8, choices=Type.choices, default=Type.ABSENCE)
    justifiee = models.BooleanField(default=False)
    motif = models.CharField(max_length=120, blank=True)
    saisie_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    saisie_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "creneau"]
        unique_together = [("inscription", "date", "creneau")]


class Bulletin(models.Model):
    """Bulletin émis au verrouillage : contenu figé, signé, vérifiable par QR code."""

    inscription = models.ForeignKey(Inscription, on_delete=models.PROTECT, related_name="bulletins")
    periode = models.ForeignKey(Periode, on_delete=models.PROTECT, related_name="bulletins")
    contenu = models.JSONField()
    empreinte = models.CharField(max_length=64)
    signature = models.CharField(max_length=128)
    code = models.CharField(max_length=16, unique=True, help_text="Code de vérification (dans le QR code)")
    emis_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("inscription", "periode")]


class ProfilEnseignant(models.Model):
    """Informations propres à un enseignant (son compte reste un Utilisateur de type « enseignant »)."""

    class Statut(models.TextChoices):
        PERMANENT = "permanent", "Permanent"
        VACATAIRE = "vacataire", "Vacataire"
        STAGIAIRE = "stagiaire", "Stagiaire"

    utilisateur = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profil_enseignant")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.PERMANENT)
    matieres = models.ManyToManyField(Matiere, blank=True, related_name="enseignants",
                                      help_text="Matières qu'il peut enseigner")
    diplome = models.CharField(max_length=120, blank=True)
    date_arrivee = models.DateField(null=True, blank=True)


class Creneau(models.Model):
    """Une heure de cours dans l'emploi du temps hebdomadaire d'une classe."""

    class Jour(models.IntegerChoices):
        LUNDI = 1, "Lundi"
        MARDI = 2, "Mardi"
        MERCREDI = 3, "Mercredi"
        JEUDI = 4, "Jeudi"
        VENDREDI = 5, "Vendredi"
        SAMEDI = 6, "Samedi"

    cours = models.ForeignKey(Cours, on_delete=models.CASCADE, related_name="creneaux")
    jour = models.PositiveSmallIntegerField(choices=Jour.choices)
    debut = models.TimeField()
    fin = models.TimeField()
    salle = models.CharField(max_length=40, blank=True)

    class Meta:
        ordering = ["jour", "debut"]
        constraints = [models.CheckConstraint(condition=models.Q(fin__gt=models.F("debut")), name="creneau_fin_apres_debut")]
