"""Vente, annulation et contrôle des tickets."""
import secrets

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.utils import timezone

from carte import crypto
from carte.models import Mouvement
from carte.services import crediter, debiter, inscription_courante

from .models import Activite, Ticket

MOYENS_DIRECTS = {"especes", "wave", "orange_money", "free_money", "gratuit"}


@transaction.atomic
def vendre(activite, *, par, eleve=None, beneficiaire="", moyen="portefeuille"):
    """
    Vend un ticket. Payé par le porte-monnaie de l'élève (achat en ligne par le parent ou carte
    présentée au guichet), ou en direct (espèces, Wave…) au guichet.
    """
    activite = Activite.objects.select_for_update().get(pk=activite.pk)  # sérialise les ventes : pas de survente
    if not activite.ouverte:
        raise ValidationError("La vente de tickets est close pour cette activité.")
    if activite.date < timezone.localdate():
        raise ValidationError("Cette activité est passée.")
    if activite.places is not None and activite.tickets.exclude(statut=Ticket.Statut.ANNULE).count() >= activite.places:
        raise ValidationError("Complet : plus aucune place.")
    if eleve is None and not beneficiaire.strip():
        raise ValidationError("Indiquez l'élève ou le nom de l'invité.")
    if eleve is not None:
        insc = inscription_courante(eleve)
        if not activite.concerne(insc.classe if insc else None):
            raise ValidationError("Cette activité n'est pas ouverte au niveau de l'élève.")
        if activite.tickets.filter(eleve=eleve).exclude(statut=Ticket.Statut.ANNULE).exists():
            raise ValidationError("L'élève a déjà un ticket pour cette activité.")
    prix = activite.prix
    mouvement = None
    if moyen == "portefeuille":
        if eleve is None:
            raise ValidationError("Le porte-monnaie demande un élève.")
        if prix:
            mouvement = debiter(eleve, prix, type_=Mouvement.Type.TICKET, libelle=f"Ticket : {activite.titre}",
                                reference=f"activite-{activite.pk}", par=par, caisse=activite.caisse)
    elif moyen not in MOYENS_DIRECTS:
        raise ValidationError("Moyen de paiement inconnu.")
    while True:
        code = secrets.token_hex(5).upper()
        if not Ticket.objects.filter(code=code).exists():
            break
    return Ticket.objects.create(activite=activite, eleve=eleve, beneficiaire=beneficiaire.strip(), code=code,
                                 prix_paye=0 if moyen == "gratuit" else prix, moyen=moyen, mouvement=mouvement, vendu_par=par)


@transaction.atomic
def annuler(ticket, par):
    ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
    if ticket.statut != Ticket.Statut.VALIDE:
        raise ValidationError("Seul un ticket valide (non utilisé) peut être annulé.")
    ticket.statut = Ticket.Statut.ANNULE
    ticket.save(update_fields=["statut"])
    if ticket.mouvement_id:  # payé par le porte-monnaie : remboursé
        crediter(ticket.eleve, ticket.prix_paye, type_=Mouvement.Type.REMBOURSEMENT,
                 libelle=f"Ticket annulé : {ticket.activite.titre}", reference=ticket.code, par=par)
    return ticket


def qr_ticket(ticket):
    return crypto.signer("NXT1", connection.schema_name, ticket.code)


@transaction.atomic
def composter(ticket, par):
    """Marque le ticket utilisé à l'entrée ; refuse un second passage."""
    ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
    if ticket.statut == Ticket.Statut.UTILISE:
        raise ValidationError(f"Ticket déjà utilisé à {timezone.localtime(ticket.utilise_le):%H:%M}.")
    if ticket.statut == Ticket.Statut.ANNULE:
        raise ValidationError("Ticket annulé.")
    ticket.statut, ticket.utilise_le, ticket.controle_par = Ticket.Statut.UTILISE, timezone.now(), par
    ticket.save(update_fields=["statut", "utilise_le", "controle_par"])
    return ticket
