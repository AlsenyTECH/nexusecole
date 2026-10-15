"""Modèles du schéma public : les écoles clientes et leur abonnement."""
from django.db import models
from django.utils import timezone
from django_tenants.models import DomainMixin, TenantMixin


class Module(models.TextChoices):
    SCOLARITE = "scolarite", "Élèves & classes"
    FRAIS = "frais", "Frais scolaires"
    NOTES = "notes", "Notes & bulletins"
    ABSENCES = "absences", "Absences"
    PARENTS = "parents", "Espace parents"
    SMS = "sms", "Notifications SMS/WhatsApp"
    PAIEMENT_MOBILE = "paiement_mobile", "Paiement Wave / Orange Money"
    CANTINE = "cantine", "Cantine"
    TRANSPORT = "transport", "Transport"
    PAIE = "paie", "Paie du personnel"


class Forfait(models.Model):
    code = models.SlugField(unique=True)
    nom = models.CharField(max_length=60)
    prix_mensuel = models.PositiveIntegerField(help_text="En FCFA")
    max_eleves = models.PositiveIntegerField(null=True, blank=True, help_text="Vide = illimité")
    quota_sms_mensuel = models.PositiveIntegerField(default=0)
    modules = models.JSONField(default=list, help_text="Liste de codes Module inclus")
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["prix_mensuel"]

    def __str__(self):
        return f"{self.nom} ({self.prix_mensuel} FCFA/mois)"


class Ecole(TenantMixin):
    """Une école cliente = un tenant = un schéma PostgreSQL."""

    class Statut(models.TextChoices):
        ESSAI = "essai", "Période d'essai"
        ACTIF = "actif", "Actif"
        SUSPENDU = "suspendu", "Suspendu (lecture seule)"
        RESILIE = "resilie", "Résilié"

    class Type(models.TextChoices):
        PRIVE_LAIC = "prive_laic", "Privé laïc"
        PRIVE_CONFESSIONNEL = "prive_confessionnel", "Privé confessionnel"
        FRANCO_ARABE = "franco_arabe", "Franco-arabe"
        PUBLIC = "public", "Public"

    class Hebergement(models.TextChoices):
        MUTUALISE = "mutualise", "Mutualisé"
        DEDIE = "dedie", "Instance dédiée"

    nom = models.CharField(max_length=150)
    type_etablissement = models.CharField(max_length=30, choices=Type.choices, default=Type.PRIVE_LAIC)
    ville = models.CharField(max_length=80, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    # Marque blanche
    logo_url = models.URLField(blank=True)
    couleur_primaire = models.CharField(max_length=7, default="#0F766E")
    couleur_secondaire = models.CharField(max_length=7, default="#F59E0B")

    # Commercial
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ESSAI)
    forfait = models.ForeignKey(Forfait, null=True, blank=True, on_delete=models.PROTECT, related_name="ecoles")
    modules_supplementaires = models.JSONField(default=list, blank=True)
    hebergement = models.CharField(max_length=10, choices=Hebergement.choices, default=Hebergement.MUTUALISE)
    fin_essai = models.DateField(null=True, blank=True)

    cree_le = models.DateTimeField(auto_now_add=True)

    # Le schéma est créé et migré automatiquement à la création
    auto_create_schema = True
    auto_drop_schema = False

    class Meta:
        ordering = ["nom"]

    def __str__(self):
        return self.nom

    @property
    def est_public(self):
        return self.schema_name == "public"

    def modules_actifs(self):
        inclus = list(self.forfait.modules) if self.forfait else []
        return sorted(set(inclus) | set(self.modules_supplementaires or []))

    def a_module(self, code):
        return code in self.modules_actifs()

    @property
    def lecture_seule(self):
        return self.statut == self.Statut.SUSPENDU

    @property
    def acces_bloque(self):
        if self.statut == self.Statut.RESILIE:
            return True
        return self.statut == self.Statut.ESSAI and self.fin_essai is not None and self.fin_essai < timezone.localdate()


class Domaine(DomainMixin):
    """Nom d'hôte → école (ex. lycee-x.nexusecole.sn, ou domaine propre de l'école)."""


class Abonnement(models.Model):
    class Periodicite(models.TextChoices):
        MENSUEL = "mensuel", "Mensuel"
        TRIMESTRIEL = "trimestriel", "Trimestriel"
        ANNUEL = "annuel", "Annuel (10 mois)"

    ecole = models.ForeignKey(Ecole, on_delete=models.CASCADE, related_name="abonnements")
    forfait = models.ForeignKey(Forfait, on_delete=models.PROTECT)
    periodicite = models.CharField(max_length=12, choices=Periodicite.choices, default=Periodicite.MENSUEL)
    debut = models.DateField()
    fin = models.DateField()
    montant = models.PositiveIntegerField(help_text="Montant par période, en FCFA")
    remise_pct = models.PositiveSmallIntegerField(default=0)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-debut"]

    def __str__(self):
        return f"{self.ecole} – {self.forfait} ({self.debut} → {self.fin})"


class Facture(models.Model):
    class Statut(models.TextChoices):
        EMISE = "emise", "Émise"
        PAYEE = "payee", "Payée"
        EN_RETARD = "en_retard", "En retard"
        ANNULEE = "annulee", "Annulée"

    class Moyen(models.TextChoices):
        WAVE = "wave", "Wave"
        ORANGE_MONEY = "orange_money", "Orange Money"
        FREE_MONEY = "free_money", "Free Money"
        VIREMENT = "virement", "Virement"
        ESPECES = "especes", "Espèces"

    ecole = models.ForeignKey(Ecole, on_delete=models.CASCADE, related_name="factures")
    abonnement = models.ForeignKey(Abonnement, null=True, blank=True, on_delete=models.SET_NULL, related_name="factures")
    numero = models.CharField(max_length=30, unique=True)
    libelle = models.CharField(max_length=200)
    montant = models.PositiveIntegerField(help_text="En FCFA")
    emise_le = models.DateField(default=timezone.localdate)
    echeance = models.DateField()
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.EMISE)
    payee_le = models.DateTimeField(null=True, blank=True)
    moyen_paiement = models.CharField(max_length=15, choices=Moyen.choices, blank=True)
    reference_paiement = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-emise_le", "-id"]

    def __str__(self):
        return f"{self.numero} – {self.ecole} – {self.montant} FCFA"
