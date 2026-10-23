"""
Frais scolaires d'une école (schéma de l'école).

Principe comptable : on ne modifie ni ne supprime jamais un paiement. Le « payé » d'une échéance
est la somme des imputations des paiements NON annulés ; une annulation est tracée (qui, quand,
pourquoi). Les montants sont en FCFA entiers.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q, Sum
from django.db.models.functions import Coalesce

from scolarite.models import AnneeScolaire, Inscription


class Frais(models.Model):
    """Ligne de la grille des frais d'une année (ex. « Mensualité 6e » : 15 000 × 10)."""

    class Categorie(models.TextChoices):
        INSCRIPTION = "inscription", "Inscription"
        SCOLARITE = "scolarite", "Scolarité (mensualités)"
        TENUE = "tenue", "Tenue / uniforme"
        ASSURANCE = "assurance", "Assurance"
        APE = "ape", "Cotisation APE"
        AUTRE = "autre", "Autre"

    class Periodicite(models.TextChoices):
        UNIQUE = "unique", "En une fois"
        MENSUEL = "mensuel", "Mensuel"

    annee = models.ForeignKey(AnneeScolaire, on_delete=models.PROTECT, related_name="frais")
    libelle = models.CharField(max_length=80)
    categorie = models.CharField(max_length=12, choices=Categorie.choices)
    montant = models.PositiveIntegerField(help_text="Montant par échéance, en FCFA")
    periodicite = models.CharField(max_length=8, choices=Periodicite.choices, default=Periodicite.UNIQUE)
    nombre_echeances = models.PositiveSmallIntegerField(default=1, help_text="Pour le mensuel, ex. 10 (oct. → juil.)")
    premiere_echeance = models.DateField(help_text="Date limite de la première échéance")
    niveaux = models.JSONField(default=list, blank=True, help_text="Niveaux concernés ; vide = tous")
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["annee", "categorie", "libelle"]
        verbose_name_plural = "frais"

    def __str__(self):
        return f"{self.libelle} ({self.montant} FCFA)"

    def concerne(self, classe):
        return not self.niveaux or classe.niveau in self.niveaux


class EcheanceQuerySet(models.QuerySet):
    def avec_soldes(self):
        paye = Coalesce(Sum("imputations__montant", filter=Q(imputations__paiement__annule=False)), 0)
        # order_by explicite : Django ignore Meta.ordering dans les requêtes avec agrégation
        return (self.annotate(paye=paye).annotate(reste=models.F("montant") - models.F("paye"))
                .order_by("date_limite", "id"))


class Echeance(models.Model):
    inscription = models.ForeignKey(Inscription, on_delete=models.PROTECT, related_name="echeances")
    frais = models.ForeignKey(Frais, null=True, blank=True, on_delete=models.SET_NULL, related_name="echeances")
    libelle = models.CharField(max_length=120)
    montant = models.PositiveIntegerField()
    date_limite = models.DateField()

    objects = EcheanceQuerySet.as_manager()

    class Meta:
        ordering = ["date_limite", "id"]

    def __str__(self):
        return f"{self.libelle} – {self.montant} FCFA"


class Paiement(models.Model):
    class Moyen(models.TextChoices):
        ESPECES = "especes", "Espèces"
        WAVE = "wave", "Wave"
        ORANGE_MONEY = "orange_money", "Orange Money"
        FREE_MONEY = "free_money", "Free Money"
        VIREMENT = "virement", "Virement"
        CHEQUE = "cheque", "Chèque"

    inscription = models.ForeignKey(Inscription, on_delete=models.PROTECT, related_name="paiements")
    numero_recu = models.CharField(max_length=20, unique=True, editable=False)
    montant = models.PositiveIntegerField()
    moyen = models.CharField(max_length=15, choices=Moyen.choices)
    reference = models.CharField(max_length=100, blank=True, help_text="Référence de transaction Wave / OM, n° de chèque…")
    observation = models.CharField(max_length=200, blank=True)
    encaisse_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="paiements_encaisses")
    encaisse_le = models.DateTimeField(auto_now_add=True)

    annule = models.BooleanField(default=False)
    motif_annulation = models.CharField(max_length=200, blank=True)
    annule_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="paiements_annules")
    annule_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-encaisse_le", "-id"]
        constraints = [models.CheckConstraint(condition=Q(montant__gt=0), name="paiement_montant_positif")]

    def __str__(self):
        return f"{self.numero_recu} – {self.montant} FCFA"


class Imputation(models.Model):
    """Part d'un paiement affectée à une échéance."""

    paiement = models.ForeignKey(Paiement, on_delete=models.PROTECT, related_name="imputations")
    echeance = models.ForeignKey(Echeance, on_delete=models.PROTECT, related_name="imputations")
    montant = models.PositiveIntegerField()

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(montant__gt=0), name="imputation_montant_positif")]


class CompteurRecu(models.Model):
    """Numérotation des reçus sans trou, par année civile (verrouillée pendant l'encaissement)."""

    annee = models.PositiveSmallIntegerField(primary_key=True)
    dernier = models.PositiveIntegerField(default=0)
