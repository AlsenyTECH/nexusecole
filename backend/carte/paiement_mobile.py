"""
Recharge en ligne du porte-monnaie (Wave, Orange Money, Free Money…).

Parcours : le parent demande une recharge → l'opérateur encaisse → l'opérateur confirme
(notification serveur à serveur) → le porte-monnaie est crédité, une seule fois.

Les vrais opérateurs exigent un compte marchand et des clés d'API propres à l'école (ou à
NexusEcole) ; chaque opérateur s'ajoute en écrivant une classe Fournisseur (création du paiement,
vérification de la signature de ses notifications). En attendant, le mode SIMULATION permet de
démontrer le parcours complet.

⚠️ Le simulateur crédite sans argent réel : il ne doit JAMAIS être actif pour une vraie école
(PAIEMENT_MOBILE_SIMULATION vide par défaut ; « lycee_demo » le limite à l'école de démonstration).
"""
import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.utils import timezone

from .models import DemandeRecharge, Mouvement
from .services import crediter, portefeuille_de

OPERATEURS = {"wave": "Wave", "orange_money": "Orange Money", "free_money": "Free Money"}
MONTANT_MIN, MONTANT_MAX = 100, 500_000


class PaiementMobileIndisponible(Exception):
    pass


def simulation_active():
    """Simulation pour toutes les écoles (« true », développement) ou seulement celles listées (ex. l'école de démo)."""
    valeur = getattr(settings, "PAIEMENT_MOBILE_SIMULATION", "")
    if valeur is True or str(valeur).strip().lower() in ("true", "1", "oui"):
        return True
    return connection.schema_name in {s.strip() for s in str(valeur or "").split(",") if s.strip()}


@transaction.atomic
def demander_recharge(eleve, montant, operateur, par):
    """Crée la demande et renvoie l'adresse de paiement à ouvrir (page de l'opérateur ou simulateur)."""
    if operateur not in OPERATEURS:
        raise ValidationError("Opérateur inconnu.")
    if not MONTANT_MIN <= montant <= MONTANT_MAX:
        raise ValidationError(f"Montant entre {MONTANT_MIN} et {MONTANT_MAX}.")
    if not simulation_active():
        raise PaiementMobileIndisponible(
            f"La recharge par {OPERATEURS[operateur]} n'est pas encore activée pour cette école : rechargez à la caisse.")
    demande = DemandeRecharge.objects.create(portefeuille=portefeuille_de(eleve), montant=montant, operateur=operateur,
                                             reference=secrets.token_urlsafe(18), demandee_par=par)
    return demande, f"/paiement-simule/{demande.reference}"


@transaction.atomic
def traiter_resultat(reference, succes, reference_operateur=""):
    """
    Point unique de traitement d'une confirmation d'opérateur. Idempotent : une notification
    rejouée (ou reçue deux fois) ne crédite jamais deux fois.
    """
    demande = DemandeRecharge.objects.select_for_update().select_related("portefeuille__eleve").filter(reference=reference).first()
    if demande is None:
        raise ValidationError("Demande de recharge inconnue.")
    if demande.statut != DemandeRecharge.Statut.EN_ATTENTE:
        return demande
    demande.traitee_le = timezone.now()
    demande.reference_operateur = reference_operateur
    if succes:
        demande.mouvement = crediter(demande.portefeuille.eleve, demande.montant, type_=Mouvement.Type.RECHARGE,
                                     libelle=f"Recharge {OPERATEURS[demande.operateur]}", reference=reference_operateur or reference,
                                     par=demande.demandee_par, moyen=demande.operateur)
        demande.statut = DemandeRecharge.Statut.PAYEE
    else:
        demande.statut = DemandeRecharge.Statut.ECHOUEE
    demande.save()
    return demande
