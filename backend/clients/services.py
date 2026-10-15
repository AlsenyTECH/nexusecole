"""Opérations métier de la console NexusEcole (schéma public)."""
import re
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur

from .models import Domaine, Ecole, Facture, Forfait, Module

SOUS_DOMAINE_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$")

FORFAITS_PAR_DEFAUT = [
    {
        "code": "starter", "nom": "Starter", "prix_mensuel": 25_000, "max_eleves": 200, "quota_sms_mensuel": 200,
        "modules": [Module.SCOLARITE, Module.FRAIS, Module.NOTES, Module.ABSENCES],
    },
    {
        "code": "standard", "nom": "Standard", "prix_mensuel": 50_000, "max_eleves": 600, "quota_sms_mensuel": 1000,
        "modules": [Module.SCOLARITE, Module.FRAIS, Module.NOTES, Module.ABSENCES, Module.PARENTS, Module.SMS],
    },
    {
        "code": "premium", "nom": "Premium", "prix_mensuel": 100_000, "max_eleves": None, "quota_sms_mensuel": 3000,
        "modules": [Module.SCOLARITE, Module.FRAIS, Module.NOTES, Module.ABSENCES, Module.PARENTS, Module.SMS,
                    Module.PAIEMENT_MOBILE],
    },
]


def installer_forfaits_par_defaut():
    for f in FORFAITS_PAR_DEFAUT:
        Forfait.objects.update_or_create(code=f["code"], defaults=f)


def valider_sous_domaine(sous_domaine):
    sous_domaine = (sous_domaine or "").strip().lower()
    if not SOUS_DOMAINE_RE.match(sous_domaine):
        raise ValidationError("Sous-domaine invalide (3 à 40 caractères : lettres minuscules, chiffres, tirets).")
    if sous_domaine in settings.RESERVED_SUBDOMAINS:
        raise ValidationError("Ce sous-domaine est réservé.")
    if Ecole.objects.filter(schema_name=sous_domaine.replace("-", "_")).exists():
        raise ValidationError("Ce sous-domaine est déjà utilisé.")
    return sous_domaine


def creer_ecole(*, nom, sous_domaine, directeur, forfait=None, jours_essai=30, **infos):
    """
    Crée une école : schéma PostgreSQL + migrations + domaine + compte directeur.

    `directeur` : dict(email, mot_de_passe, prenom, nom, telephone).
    """
    sous_domaine = valider_sous_domaine(sous_domaine)
    ecole = Ecole(
        schema_name=sous_domaine.replace("-", "_"),
        nom=nom,
        forfait=forfait,
        statut=Ecole.Statut.ESSAI,
        fin_essai=timezone.localdate() + timedelta(days=jours_essai) if jours_essai else None,
        **infos,
    )
    ecole.save(verbosity=0)  # crée et migre le schéma (hors transaction : DDL long)

    try:
        with transaction.atomic():
            Domaine.objects.create(domain=f"{sous_domaine}.{settings.BASE_DOMAIN}", tenant=ecole, is_primary=True)
            with schema_context(ecole.schema_name):
                Utilisateur.objects.create_user(
                    email=directeur["email"],
                    password=directeur["mot_de_passe"],
                    prenom=directeur.get("prenom", ""),
                    nom=directeur.get("nom", ""),
                    telephone=directeur.get("telephone", ""),
                    role=Role.DIRECTEUR,
                )
    except Exception:
        ecole.delete(force_drop=True)
        raise
    return ecole


@transaction.atomic
def emettre_facture(ecole, *, mois=1, libelle=None, delai_jours=10):
    if not ecole.forfait:
        raise ValidationError("L'école n'a pas de forfait.")
    remise = 2 if mois >= 10 else 0  # 10 mois payés d'avance → 2 mois offerts (≈ -17 %)
    montant = ecole.forfait.prix_mensuel * (mois - remise)
    facture = Facture.objects.create(
        ecole=ecole,
        numero=f"TMP-{timezone.now().timestamp()}",
        libelle=libelle or f"Abonnement {ecole.forfait.nom} – {mois} mois",
        montant=montant,
        echeance=timezone.localdate() + timedelta(days=delai_jours),
    )
    facture.numero = f"NE-{facture.emise_le:%Y}-{facture.pk:05d}"
    facture.save(update_fields=["numero"])
    return facture


@transaction.atomic
def enregistrer_paiement(facture, *, moyen, reference=""):
    facture.statut = Facture.Statut.PAYEE
    facture.payee_le = timezone.now()
    facture.moyen_paiement = moyen
    facture.reference_paiement = reference
    facture.save()
    ecole = facture.ecole
    if ecole.statut in (Ecole.Statut.ESSAI, Ecole.Statut.SUSPENDU):
        ecole.statut = Ecole.Statut.ACTIF
        ecole.save(update_fields=["statut"])
    return facture
