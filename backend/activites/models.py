"""
Activités organisées par l'école (soirée, kermesse, sortie, tournoi…) et leurs tickets.

Les recettes vont dans la caisse choisie pour l'activité : souvent une caisse non comptabilisée
(foyer, coopérative, gouvernement scolaire), car l'argent revient aux élèves.
Un élève entre avec sa carte (son ticket y est rattaché) ; un invité sans carte a un ticket à QR code.
"""
from django.conf import settings
from django.db import models
from django.db.models import Q

from finances.models import Caisse
from scolarite.models import Eleve


class Activite(models.Model):
    titre = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    date = models.DateField()
    heure = models.TimeField(null=True, blank=True)
    lieu = models.CharField(max_length=100, blank=True)
    prix = models.PositiveIntegerField(default=0)
    places = models.PositiveIntegerField(null=True, blank=True, help_text="Vide : sans limite")
    niveaux = models.JSONField(default=list, blank=True, help_text="Niveaux invités ; vide = toute l'école")
    caisse = models.ForeignKey(Caisse, on_delete=models.PROTECT, related_name="activites")
    vente_en_ligne = models.BooleanField(default=True, help_text="Les parents achètent le ticket depuis l'application")
    ouverte = models.BooleanField(default=True, help_text="Faux : vente close")
    cree_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return self.titre

    def concerne(self, classe):
        return not self.niveaux or (classe is not None and classe.niveau in self.niveaux)


class Ticket(models.Model):
    class Statut(models.TextChoices):
        VALIDE = "valide", "Valide"
        UTILISE = "utilise", "Utilisé"
        ANNULE = "annule", "Annulé"

    activite = models.ForeignKey(Activite, on_delete=models.PROTECT, related_name="tickets")
    eleve = models.ForeignKey(Eleve, null=True, blank=True, on_delete=models.PROTECT, related_name="tickets")
    beneficiaire = models.CharField(max_length=100, blank=True, help_text="Invité sans carte")
    code = models.CharField(max_length=16, unique=True)
    statut = models.CharField(max_length=8, choices=Statut.choices, default=Statut.VALIDE)
    prix_paye = models.PositiveIntegerField()
    moyen = models.CharField(max_length=15, help_text="portefeuille, especes, wave, orange_money…")
    mouvement = models.OneToOneField("carte.Mouvement", null=True, blank=True, on_delete=models.PROTECT, related_name="ticket")
    vendu_par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    cree_le = models.DateTimeField(auto_now_add=True)
    utilise_le = models.DateTimeField(null=True, blank=True)
    controle_par = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-cree_le"]
        constraints = [models.UniqueConstraint(fields=["activite", "eleve"], condition=~Q(statut="annule") & Q(eleve__isnull=False),
                                               name="un_ticket_par_eleve_et_activite")]
