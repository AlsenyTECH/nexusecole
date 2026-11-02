"""Règles métier des frais scolaires : génération des échéances, encaissement, annulation."""
from datetime import date

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import CompteurRecu, Echeance, Frais, Imputation, Paiement, Souscription

MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
        "septembre", "octobre", "novembre", "décembre"]


def ajouter_mois(d: date, n: int) -> date:
    mois = d.month - 1 + n
    annee, mois = d.year + mois // 12, mois % 12 + 1
    jours = [31, 29 if annee % 4 == 0 and (annee % 100 or annee % 400 == 0) else 28,
             31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1]
    return date(annee, mois, min(d.day, jours))


def montant_apres_reduction(frais, inscription):
    if frais.categorie == Frais.Categorie.SCOLARITE and inscription.reduction_pct:
        return round(frais.montant * (100 - inscription.reduction_pct) / 100)
    return frais.montant


@transaction.atomic
def generer_echeances(inscription):
    """Crée les échéances d'une inscription depuis la grille. Idempotent : un frais déjà généré est ignoré."""
    deja = set(inscription.echeances.exclude(frais=None).values_list("frais_id", flat=True))
    a_creer = []
    for frais in Frais.objects.filter(annee=inscription.annee, actif=True, obligatoire=True):
        if frais.pk in deja or not frais.concerne(inscription.classe):
            continue
        a_creer += _echeances(inscription, frais)
    Echeance.objects.bulk_create(a_creer)
    return len(a_creer)


def _echeances(inscription, frais, depuis=None):
    """Échéances d'un frais pour une inscription ; `depuis` : seulement les mois à partir de cette date."""
    montant = montant_apres_reduction(frais, inscription)
    if montant == 0:
        return []
    if frais.periodicite == Frais.Periodicite.MENSUEL:
        dates = [ajouter_mois(frais.premiere_echeance, i) for i in range(frais.nombre_echeances)]
        if depuis:
            dates = [d for d in dates if (d.year, d.month) >= (depuis.year, depuis.month)]
        return [Echeance(inscription=inscription, frais=frais, montant=montant, date_limite=d,
                         libelle=f"{frais.libelle} – {MOIS[d.month]} {d.year}") for d in dates]
    limite = max(frais.premiere_echeance, depuis) if depuis else frais.premiere_echeance
    return [Echeance(inscription=inscription, frais=frais, montant=montant, date_limite=limite, libelle=frais.libelle)]


# --------------------------------------------------------------------------- #
# Services à la carte
# --------------------------------------------------------------------------- #
@transaction.atomic
def souscrire(inscription, frais, *, par, depuis=None):
    """Inscrit l'élève à un service : échéances du mois en cours jusqu'à la fin (pas de rattrapage des mois passés)."""
    depuis = depuis or timezone.localdate()
    if frais.obligatoire:
        raise ValidationError("Ce frais est obligatoire : il est déjà dû par tous les élèves concernés.")
    if not frais.actif or frais.annee_id != inscription.annee_id:
        raise ValidationError("Ce service n'est pas proposé pour l'année de l'inscription.")
    if not frais.concerne(inscription.classe):
        raise ValidationError("Ce service n'est pas proposé pour le niveau de l'élève.")
    if Souscription.objects.filter(inscription=inscription, frais=frais, fin__isnull=True).exists():
        raise ValidationError("L'élève est déjà inscrit à ce service.")
    souscription = Souscription.objects.create(inscription=inscription, frais=frais, debut=depuis, par=par)
    # Une souscription précédente (désinscrit puis réinscrit) a peut-être laissé des échéances déjà payées
    existantes = set(inscription.echeances.filter(frais=frais).values_list("date_limite", flat=True))
    Echeance.objects.bulk_create([e for e in _echeances(inscription, frais, depuis) if e.date_limite not in existantes])
    return souscription


@transaction.atomic
def desinscrire(souscription, *, fin=None):
    """
    Arrête un service : les échéances à venir qui n'ont reçu aucun paiement sont retirées ;
    celles déjà échues ou (même partiellement) payées restent dues / acquises.
    """
    if souscription.fin:
        raise ValidationError("Cette souscription est déjà arrêtée.")
    fin = fin or timezone.localdate()
    souscription.fin = fin
    souscription.save(update_fields=["fin"])
    a_retirer = souscription.inscription.echeances.filter(frais=souscription.frais, date_limite__gt=fin, imputations__isnull=True)
    n = a_retirer.count()
    a_retirer.delete()
    return n


def _prochain_numero_recu():
    annee = timezone.localdate().year
    CompteurRecu.objects.get_or_create(annee=annee)
    compteur = CompteurRecu.objects.select_for_update().get(annee=annee)  # sérialise les encaissements
    compteur.dernier += 1
    compteur.save(update_fields=["dernier"])
    return f"R-{annee}-{compteur.dernier:06d}"


@transaction.atomic
def encaisser(inscription, *, montant, moyen, encaisse_par, reference="", observation="", echeances=None):
    """
    Enregistre un paiement et l'impute aux échéances : les plus anciennes d'abord,
    ou uniquement celles choisies (`echeances` : liste d'ids). Refuse tout trop-perçu.
    """
    if montant <= 0:
        raise ValidationError("Le montant doit être positif.")

    # Verrouille les échéances de l'élève : deux caisses ne peuvent pas imputer la même échéance en même temps
    ids_verrouilles = list(
        Echeance.objects.select_for_update().filter(inscription=inscription).values_list("id", flat=True)
    )
    qs = Echeance.objects.filter(id__in=ids_verrouilles).avec_soldes().filter(reste__gt=0).order_by("date_limite", "id")
    if echeances:
        qs = qs.filter(id__in=echeances)
    a_imputer = list(qs)

    reste_total = sum(e.reste for e in a_imputer)
    if reste_total == 0:
        raise ValidationError("Aucune échéance à régler.")
    if montant > reste_total:
        raise ValidationError(f"Le montant dépasse le reste dû ({reste_total} FCFA).")

    paiement = Paiement.objects.create(
        inscription=inscription, numero_recu=_prochain_numero_recu(), montant=montant, moyen=moyen,
        reference=reference, observation=observation, encaisse_par=encaisse_par,
    )
    restant = montant
    imputations = []
    for e in a_imputer:
        part = min(restant, e.reste)
        imputations.append(Imputation(paiement=paiement, echeance=e, montant=part))
        restant -= part
        if restant == 0:
            break
    Imputation.objects.bulk_create(imputations)
    if moyen == Paiement.Moyen.PORTEFEUILLE:
        from carte.services import debiter

        debiter(inscription.eleve, montant, type_="frais", libelle=f"Frais scolaires – reçu {paiement.numero_recu}",
                reference=paiement.numero_recu, par=encaisse_par, achat=False)
    return paiement


@transaction.atomic
def annuler_paiement(paiement, *, motif, par):
    paiement = Paiement.objects.select_for_update().get(pk=paiement.pk)
    if paiement.annule:
        raise ValidationError("Ce paiement est déjà annulé.")
    if not (motif or "").strip():
        raise ValidationError("Le motif d'annulation est obligatoire.")
    paiement.annule = True
    paiement.motif_annulation = motif.strip()
    paiement.annule_par = par
    paiement.annule_le = timezone.now()
    paiement.save(update_fields=["annule", "motif_annulation", "annule_par", "annule_le"])
    if paiement.moyen == Paiement.Moyen.PORTEFEUILLE:  # l'argent revient sur la carte
        from carte.services import crediter

        crediter(paiement.inscription.eleve, paiement.montant, type_="remboursement",
                 libelle=f"Annulation du reçu {paiement.numero_recu}", reference=paiement.numero_recu, par=par)
    return paiement


def situation(inscription):
    echeances = list(inscription.echeances.avec_soldes())
    aujourd_hui = timezone.localdate()
    total = sum(e.montant for e in echeances)
    paye = sum(e.paye for e in echeances)
    en_retard = sum(e.reste for e in echeances if e.date_limite < aujourd_hui)
    return {"total": total, "paye": paye, "reste": total - paye, "en_retard": en_retard, "echeances": echeances}
