"""Cartes, porte-monnaie (grand livre chaîné), ventes et contrôle d'accès."""
import hashlib
import secrets

from django.core.exceptions import ValidationError
from django.db import connection, transaction
from django.db.models import Sum
from django.utils import timezone

from scolarite.models import AnneeScolaire, Eleve

from . import crypto
from .models import Carte, Mouvement, ParametresCarte, Portefeuille

GENESE = "0" * 64


# --------------------------------------------------------------------------- #
# Cartes
# --------------------------------------------------------------------------- #
def carte_de(eleve):
    """La carte de l'élève, créée au besoin (numéro aléatoire à 8 chiffres)."""
    carte = Carte.objects.filter(eleve=eleve).first()
    if carte:
        return carte
    while True:
        numero = f"{secrets.randbelow(10**8):08d}"
        if not Carte.objects.filter(numero=numero).exists():
            return Carte.objects.create(eleve=eleve, numero=numero)


def qr_carte(carte):
    return crypto.signer("NXC1", connection.schema_name, carte.numero, carte.version)


def lire_carte(texte):
    """
    QR scanné (ou numéro saisi à la main par le contrôleur) → (carte, erreur).
    Un numéro seul est accepté pour la saisie manuelle : la personne au contrôle voit la photo.
    """
    texte = (texte or "").strip()
    if texte.isdigit():
        carte = Carte.objects.select_related("eleve").filter(numero=texte).first()
        return (carte, None) if carte else (None, "Carte inconnue.")
    champs = crypto.lire(texte)
    if not champs or champs[0] != "NXC1":
        return None, "QR code non reconnu : ce n'est pas une carte de cette école, ou elle a été falsifiée."
    carte = Carte.objects.select_related("eleve").filter(numero=champs[2]).first()
    if carte is None:
        return None, "Carte inconnue."
    if str(carte.version) != champs[3]:
        return None, "Ancienne carte : elle a été remplacée (perte ou vol). Retenez-la."
    return carte, None


@transaction.atomic
def reemettre(carte, motif):
    if not (motif or "").strip():
        raise ValidationError("Indiquez le motif (perte, vol, carte abîmée…).")
    carte = Carte.objects.select_for_update().get(pk=carte.pk)
    carte.version += 1
    carte.active = True
    carte.reemise_le = timezone.now()
    carte.motif = motif.strip()
    carte.save()
    return carte


# --------------------------------------------------------------------------- #
# Porte-monnaie : grand livre chaîné
# --------------------------------------------------------------------------- #
def portefeuille_de(eleve):
    return Portefeuille.objects.get_or_create(eleve=eleve)[0]


def _empreinte(precedente, portefeuille_id, type_, montant, solde_apres, reference, le):
    donnees = f"{precedente}|{portefeuille_id}|{type_}|{montant}|{solde_apres}|{reference}|{le.isoformat()}"
    return hashlib.sha256(donnees.encode()).hexdigest()


def _ecrire(portefeuille, montant, *, type_, libelle, reference="", par=None, caisse=None, moyen=""):
    """Écrit un mouvement (portefeuille déjà verrouillé par l'appelant) et met le solde à jour."""
    if portefeuille.solde + montant < 0:
        raise ValidationError(f"Solde insuffisant ({portefeuille.solde} disponibles).")
    with connection.cursor() as c:  # une seule écriture à la fois dans la chaîne
        c.execute("SELECT pg_advisory_xact_lock(hashtext('grand_livre_portefeuilles'))")
    precedente = Mouvement.objects.order_by("-id").values_list("empreinte", flat=True).first() or GENESE
    portefeuille.solde += montant
    portefeuille.save(update_fields=["solde"])
    le = timezone.now()
    return Mouvement.objects.create(
        portefeuille=portefeuille, type=type_, montant=montant, solde_apres=portefeuille.solde, libelle=libelle,
        reference=reference, moyen=moyen, caisse=caisse, par=par, le=le, precedente=precedente,
        empreinte=_empreinte(precedente, portefeuille.pk, type_, montant, portefeuille.solde, reference, le),
    )


def verifier_grand_livre():
    """(True, None) si la chaîne est intacte et chaque solde cohérent ; sinon (False, id du premier mouvement altéré)."""
    precedente, soldes = GENESE, {}
    for m in Mouvement.objects.order_by("id"):
        attendu = soldes.get(m.portefeuille_id, 0) + m.montant
        if (m.precedente != precedente or m.solde_apres != attendu or
                m.empreinte != _empreinte(precedente, m.portefeuille_id, m.type, m.montant, m.solde_apres, m.reference, m.le)):
            return False, m.pk
        soldes[m.portefeuille_id], precedente = attendu, m.empreinte
    for p in Portefeuille.objects.all():
        if p.solde != soldes.get(p.pk, 0):
            return False, None
    return True, None


@transaction.atomic
def crediter(eleve, montant, *, type_=Mouvement.Type.RECHARGE, libelle="Recharge", reference="", par=None, moyen=""):
    if montant <= 0:
        raise ValidationError("Le montant doit être positif.")
    p = Portefeuille.objects.select_for_update().get(pk=portefeuille_de(eleve).pk)
    return _ecrire(p, montant, type_=type_, libelle=libelle, reference=reference, par=par, moyen=moyen)


def depenses_du_jour(portefeuille):
    debut = timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)
    total = portefeuille.mouvements.filter(le__gte=debut, type__in=[Mouvement.Type.ACHAT, Mouvement.Type.TICKET]
                                           ).aggregate(t=Sum("montant"))["t"] or 0
    return -total


def plafond(portefeuille):
    return portefeuille.plafond_journalier if portefeuille.plafond_journalier is not None else ParametresCarte.actuels().plafond_journalier


@transaction.atomic
def debiter(eleve, montant, *, type_, libelle, reference="", par=None, caisse=None, achat=True):
    """
    Débite le porte-monnaie. Un achat (cantine, boutique, ticket) respecte le blocage et le plafond
    journalier ; le règlement de frais scolaires par le parent, non.
    """
    if montant <= 0:
        raise ValidationError("Le montant doit être positif.")
    p = Portefeuille.objects.select_for_update().get(pk=portefeuille_de(eleve).pk)
    if achat:
        if p.bloque:
            raise ValidationError("Porte-monnaie bloqué (carte perdue ou décision des parents).")
        limite = plafond(p)
        if limite is not None and depenses_du_jour(p) + montant > limite:
            raise ValidationError(f"Plafond journalier atteint ({limite} par jour).")
    return _ecrire(p, -montant, type_=type_, libelle=libelle, reference=reference, par=par, caisse=caisse)


# --------------------------------------------------------------------------- #
# Situation et contrôle d'accès
# --------------------------------------------------------------------------- #
def inscription_courante(eleve):
    annee = AnneeScolaire.objects.filter(active=True).first()
    return eleve.inscriptions.select_related("classe").filter(annee=annee).first() if annee else None


def en_retard(inscription):
    if inscription is None:
        return 0
    from finances.models import Echeance

    echues = Echeance.objects.filter(inscription=inscription, date_limite__lt=timezone.localdate()).avec_soldes()
    return sum(e.reste for e in echues if e.reste > 0)


def droit_d_acces(carte):
    """(autorisé, motifs, inscription, retard) pour l'entrée dans l'école."""
    eleve, motifs = carte.eleve, []
    if not carte.active:
        motifs.append("Carte désactivée.")
    if not eleve.actif:
        motifs.append("Élève sorti des effectifs.")
    inscription = inscription_courante(eleve)
    if inscription is None or inscription.statut != "active":
        motifs.append("Pas inscrit pour l'année en cours.")
    retard = en_retard(inscription)
    params = ParametresCarte.actuels()
    if params.refuser_si_retard and retard > params.seuil_retard:
        motifs.append(f"Retard de paiement : {retard}.")
    return not motifs, motifs, inscription, retard


def eleves_sans_carte():
    return Eleve.objects.filter(actif=True, carte__isnull=True)
