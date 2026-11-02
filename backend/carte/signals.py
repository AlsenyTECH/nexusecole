"""Chaque nouvel élève reçoit automatiquement sa carte et son porte-monnaie."""
from django.db.models.signals import post_save
from django.dispatch import receiver

from scolarite.models import Eleve


@receiver(post_save, sender=Eleve)
def carte_automatique(sender, instance, created, **kwargs):
    if created:
        from .services import carte_de, portefeuille_de

        carte_de(instance)
        portefeuille_de(instance)
