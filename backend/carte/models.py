"""
Carte scolaire et porte-monnaie (schéma de l'école).

- La carte porte un QR code signé (Ed25519) : numéro + version. Réémettre une carte (perte, vol)
  incrémente la version : l'ancienne carte est aussitôt refusée partout.
- Le porte-monnaie est un grand livre : on n'efface ni ne modifie jamais un mouvement, le solde
  est la somme des mouvements. Chaque ligne contient l'empreinte de la précédente (SHA-256) :
  une modification en base après coup casse la chaîne et se détecte.
- L'argent du porte-monnaie appartient aux familles tant qu'il n'est pas dépensé : ce n'est pas
  une recette de l'école. Une dépense est versée à la caisse du point de vente (comptabilisée ou non).
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

from finances.models import Caisse
from scolarite.models import Eleve


class ParametresCarte(models.Model):
    """Règles de l'école (une seule ligne)."""

    refuser_si_retard = models.BooleanField(default=False, help_text="Refuser l'entrée d'un élève en retard de paiement")
    seuil_retard = models.PositiveIntegerField(default=0, help_text="Retard toléré avant refus (montant)")
    plafond_journalier = models.PositiveIntegerField(null=True, blank=True,
                                                     help_text="Dépenses maximum par jour et par élève (vide : sans limite)")

    @classmethod
    def actuels(cls):
        return cls.objects.first() or cls.objects.create()


class PhotoEleve(models.Model):
    """Photo d'identité (petite image JPEG/PNG gardée en base : pas de stockage de fichiers à gérer)."""

    eleve = models.OneToOneField(Eleve, on_delete=models.CASCADE, related_name="photo")
    image = models.BinaryField()
    type_mime = models.CharField(max_length=20)
    modifiee_le = models.DateTimeField(auto_now=True)


class Carte(models.Model):
    eleve = models.OneToOneField(Eleve, on_delete=models.CASCADE, related_name="carte")
    numero = models.CharField(max_length=12, unique=True)
    version = models.PositiveSmallIntegerField(default=1, help_text="Augmente à chaque réémission : les anciennes sont refusées")
    active = models.BooleanField(default=True)
    emise_le = models.DateTimeField(auto_now_add=True)
    reemise_le = models.DateTimeField(null=True, blank=True)
    motif = models.CharField(max_length=120, blank=True, help_text="Motif de la dernière réémission ou désactivation")

    def __str__(self):
        return f"Carte {self.numero} v{self.version} – {self.eleve}"


class Portefeuille(models.Model):
    eleve = models.OneToOneField(Eleve, on_delete=models.CASCADE, related_name="portefeuille")
    solde = models.IntegerField(default=0)
    plafond_journalier = models.PositiveIntegerField(null=True, blank=True, help_text="Fixé par le parent ; vide : règle de l'école")
    bloque = models.BooleanField(default=False, help_text="Achats suspendus (carte perdue, décision du parent)")

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(solde__gte=0), name="solde_jamais_negatif")]


class Mouvement(models.Model):
    class Type(models.TextChoices):
        RECHARGE = "recharge", "Recharge"
        ACHAT = "achat", "Achat"
        TICKET = "ticket", "Ticket d'activité"
        FRAIS = "frais", "Frais scolaires"
        REMBOURSEMENT = "remboursement", "Remboursement"

    portefeuille = models.ForeignKey(Portefeuille, on_delete=models.PROTECT, related_name="mouvements")
    type = models.CharField(max_length=14, choices=Type.choices)
    montant = models.IntegerField(help_text="Positif : crédit ; négatif : débit")
    solde_apres = models.IntegerField()
    libelle = models.CharField(max_length=150)
    reference = models.CharField(max_length=60, blank=True)
    moyen = models.CharField(max_length=15, blank=True, help_text="Pour une recharge : espèces, wave, orange_money…")
    caisse = models.ForeignKey(Caisse, null=True, blank=True, on_delete=models.PROTECT, related_name="mouvements",
                               help_text="Pour une dépense : la caisse qui reçoit l'argent")
    par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField()
    precedente = models.CharField(max_length=64)
    empreinte = models.CharField(max_length=64, unique=True)

    class Meta:
        ordering = ["-le", "-id"]


class DemandeRecharge(models.Model):
    """Recharge en ligne (Wave, Orange Money…) : créditée seulement quand l'opérateur confirme le paiement."""

    class Statut(models.TextChoices):
        EN_ATTENTE = "en_attente", "En attente du paiement"
        PAYEE = "payee", "Payée"
        ECHOUEE = "echouee", "Échouée ou annulée"

    portefeuille = models.ForeignKey(Portefeuille, on_delete=models.PROTECT, related_name="demandes")
    montant = models.PositiveIntegerField()
    operateur = models.CharField(max_length=15)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.EN_ATTENTE)
    reference = models.CharField(max_length=40, unique=True)
    reference_operateur = models.CharField(max_length=100, blank=True)
    demandee_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    cree_le = models.DateTimeField(auto_now_add=True)
    traitee_le = models.DateTimeField(null=True, blank=True)
    mouvement = models.OneToOneField(Mouvement, null=True, blank=True, on_delete=models.PROTECT, related_name="demande")

    class Meta:
        ordering = ["-cree_le"]


class PointDeVente(models.Model):
    """Cantine, boutique (uniformes), librairie… L'argent des ventes va dans sa caisse."""

    nom = models.CharField(max_length=60, unique=True)
    caisse = models.ForeignKey(Caisse, on_delete=models.PROTECT, related_name="points_de_vente")
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom


class Article(models.Model):
    point_de_vente = models.ForeignKey(PointDeVente, on_delete=models.CASCADE, related_name="articles")
    nom = models.CharField(max_length=80)
    prix = models.PositiveIntegerField()
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["nom"]


class Vente(models.Model):
    point_de_vente = models.ForeignKey(PointDeVente, on_delete=models.PROTECT, related_name="ventes")
    eleve = models.ForeignKey(Eleve, on_delete=models.PROTECT, related_name="achats")
    montant = models.PositiveIntegerField()
    lignes = models.JSONField(default=list, help_text="[{article, nom, prix, quantite}]")
    mouvement = models.OneToOneField(Mouvement, on_delete=models.PROTECT, related_name="vente")
    par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField(auto_now_add=True)
    annulee_le = models.DateTimeField(null=True, blank=True)
    annulee_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-le"]


class Passage(models.Model):
    """Chaque présentation de carte à un contrôle (portail ou activité) : base de l'assiduité."""

    eleve = models.ForeignKey(Eleve, null=True, on_delete=models.CASCADE, related_name="passages")
    lieu = models.CharField(max_length=80, help_text="« Portail » ou le titre de l'activité")
    autorise = models.BooleanField()
    motifs = models.JSONField(default=list)
    par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-le"]
