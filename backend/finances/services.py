"""Règles métier des frais scolaires : génération des échéances, encaissement, annulation."""
from datetime import date

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import CompteurRecu, Echeance, Frais, Imputation, Paiement

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
    for frais in Frais.objects.filter(annee=inscription.annee, actif=True):
        if frais.pk in deja or not frais.concerne(inscription.classe):
            continue
        montant = montant_apres_reduction(frais, inscription)
        if montant == 0:
            continue
        if frais.periodicite == Frais.Periodicite.MENSUEL:
            for i in range(frais.nombre_echeances):
                d = ajouter_mois(frais.premiere_echeance, i)
                a_creer.append(Echeance(inscription=inscription, frais=frais, montant=montant, date_limite=d,
                                        libelle=f"{frais.libelle} – {MOIS[d.month]} {d.year}"))
        else:
            a_creer.append(Echeance(inscription=inscription, frais=frais, montant=montant,
                                    date_limite=frais.premiere_echeance, libelle=frais.libelle))
    Echeance.objects.bulk_create(a_creer)
    return len(a_creer)


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
    return paiement


def situation(inscription):
    echeances = list(inscription.echeances.avec_soldes())
    aujourd_hui = timezone.localdate()
    total = sum(e.montant for e in echeances)
    paye = sum(e.paye for e in echeances)
    en_retard = sum(e.reste for e in echeances if e.date_limite < aujourd_hui)
    return {"total": total, "paye": paye, "reste": total - paye, "en_retard": en_retard, "echeances": echeances}
