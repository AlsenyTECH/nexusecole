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


class SalleSpecialisee(models.Model):
    """Salle partagée entre les classes (labo, salle informatique, terrain) : `nombre` salles identiques."""

    nom = models.CharField(max_length=60, unique=True)
    nombre = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Matiere(models.Model):
    nom = models.CharField(max_length=60, unique=True)
    code = models.CharField(max_length=10, blank=True)
    lourde = models.BooleanField(default=False, help_text="Placée de préférence le matin par le générateur")
    salle = models.ForeignKey(SalleSpecialisee, null=True, blank=True, on_delete=models.SET_NULL, related_name="matieres",
                              help_text="Salle spécialisée nécessaire (labo, terrain…)")

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
    volume_horaire = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Heures par semaine")
    decoupage = models.CharField(max_length=30, blank=True, help_text="Séances, ex. « 2+2+1 » ; vide : séances de 1 h")

    class Meta:
        ordering = ["classe", "matiere__nom"]
        unique_together = [("classe", "matiere")]
        verbose_name_plural = "cours"

    def __str__(self):
        return f"{self.matiere} – {self.classe.nom}"

    def seances(self):
        """Durées des séances de la semaine (en heures)."""
        if not self.volume_horaire:
            return []
        if self.decoupage:
            return [int(x) for x in self.decoupage.split("+")]
        return [1] * self.volume_horaire


class Surveillance(models.Model):
    """Surveillant affecté à une classe : il peut y saisir notes et absences."""

    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name="surveillances")
    surveillant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="surveillances")

    class Meta:
        unique_together = [("classe", "surveillant")]


class Conseil(models.Model):
    """
    Conseil de classe d'une période : tant qu'il n'est pas rouvert, plus aucune note ne change.
    Une réouverture (droit dédié, motif obligatoire) est conservée : l'historique des conseils
    d'une classe ne se perd jamais.
    """

    classe = models.ForeignKey(Classe, on_delete=models.CASCADE, related_name="conseils")
    periode = models.ForeignKey(Periode, on_delete=models.PROTECT, related_name="conseils")
    verrouille_le = models.DateTimeField(auto_now_add=True)
    verrouille_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    rouvert_le = models.DateTimeField(null=True, blank=True)
    rouvert_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    motif_reouverture = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["verrouille_le"]
        constraints = [models.UniqueConstraint(fields=["classe", "periode"], condition=models.Q(rouvert_le__isnull=True),
                                               name="un_seul_conseil_en_vigueur")]


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
    # Révocation (réouverture du conseil) : le bulletin reste, signé, mais marqué annulé.
    # Le statut n'est pas dans le contenu signé : la signature prouve l'origine, la base dit s'il est en vigueur.
    annule_le = models.DateTimeField(null=True, blank=True)
    motif_annulation = models.CharField(max_length=300, blank=True)
    remplace_par = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="remplace")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["inscription", "periode"], condition=models.Q(annule_le__isnull=True),
                                               name="un_seul_bulletin_en_vigueur")]


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


class GrilleHoraire(models.Model):
    """
    Grille de l'école (une seule ligne) : heures de début des créneaux d'une heure, et créneaux ouverts.
    Un créneau est (jour 1..6, indice dans `heures`). Avant 13 h : matin ; ensuite : après-midi.
    """

    heures = models.JSONField(default=list)
    ouverts = models.JSONField(default=list, help_text="[[jour, indice], …]")

    HEURES_DEFAUT = ["08:00", "09:00", "10:00", "11:00", "12:00", "15:00", "16:00"]

    @classmethod
    def actuelle(cls):
        g = cls.objects.first()
        if g is None:
            ouverts = [[j, i] for j in range(1, 7) for i in range(5)] + [[j, i] for j in (1, 2, 4, 5) for i in (5, 6)]
            g = cls.objects.create(heures=cls.HEURES_DEFAUT, ouverts=sorted(ouverts))
        return g


class Disponibilite(models.Model):
    """
    Disponibilités d'un enseignant sur la grille : créneaux indisponibles et créneaux préférés.
    Le professeur propose depuis son compte ; la direction valide (ou saisit directement). Seule la
    version validée sert au générateur.
    """

    enseignant = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="disponibilite")
    indispo = models.JSONField(default=list)
    prefere = models.JSONField(default=list)
    indispo_propose = models.JSONField(null=True, blank=True)
    prefere_propose = models.JSONField(null=True, blank=True)
    propose_le = models.DateTimeField(null=True, blank=True)
    valide_le = models.DateTimeField(null=True, blank=True)


class GenerationEDT(models.Model):
    """Un calcul d'emplois du temps (lancé en tâche de fond) et ses propositions."""

    class Statut(models.TextChoices):
        EN_COURS = "en_cours", "En cours"
        TERMINEE = "terminee", "Terminée"
        IMPOSSIBLE = "impossible", "Impossible"
        ECHEC = "echec", "Échec"

    annee = models.ForeignKey(AnneeScolaire, on_delete=models.CASCADE, related_name="generations_edt")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.EN_COURS)
    diagnostic = models.JSONField(default=dict)
    propositions = models.JSONField(default=list)
    message = models.CharField(max_length=300, blank=True)
    progression = models.PositiveSmallIntegerField(default=0)
    publiee = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Numéro de la proposition publiée")
    cree_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    cree_le = models.DateTimeField(auto_now_add=True)
    termine_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-cree_le"]
