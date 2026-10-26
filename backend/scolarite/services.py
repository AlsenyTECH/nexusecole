"""Élèves et familles : matricule automatique, rattachement des parents / tuteurs, accès à l'application."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from comptes.models import Role, Utilisateur

from .models import Eleve, LienResponsable, Responsable

CHAMPS_RESPONSABLE = ("prenom", "nom", "telephone", "telephone2", "email", "profession", "adresse")


def matricule_suivant():
    """Matricule du type 2026-0001, unique dans l'école."""
    prefixe = f"{timezone.localdate().year}-"
    n = Eleve.objects.filter(matricule__startswith=prefixe).count() + 1
    while Eleve.objects.filter(matricule=f"{prefixe}{n:04d}").exists():
        n += 1
    return f"{prefixe}{n:04d}"


def creer_acces(responsable, email, mot_de_passe):
    """Crée (ou réactive avec un nouveau mot de passe) le compte « parent » d'un responsable."""
    email = (email or "").strip().lower()
    if not email:
        raise ValidationError("L'e-mail de connexion est obligatoire.")
    validate_password(mot_de_passe)
    compte = responsable.utilisateur
    if Utilisateur.objects.filter(email=email).exclude(pk=getattr(compte, "pk", None)).exists():
        raise ValidationError("Cet e-mail est déjà utilisé par un autre compte de l'école.")
    if compte is None:
        compte = Utilisateur.objects.create_user(email, mot_de_passe, role=Role.PARENT, prenom=responsable.prenom,
                                                 nom=responsable.nom, telephone=responsable.telephone)
        responsable.utilisateur = compte
    else:
        compte.email, compte.is_active = email, True
        compte.set_password(mot_de_passe)
        compte.save()
    if not responsable.email:
        responsable.email = email
    responsable.save()
    return compte


@transaction.atomic
def rattacher(eleve, donnees, acces_permis=True):
    """
    Rattache un responsable à l'élève.
    donnees : {responsable: id} pour une personne déjà connue (fratrie), ou ses informations
    (nom, téléphone…) pour la créer ; plus lien, contact_principal, acces_app et, en option,
    acces: {email, mot_de_passe} pour lui ouvrir l'application.
    """
    if donnees.get("responsable"):
        responsable = Responsable.objects.filter(pk=donnees["responsable"]).first()
        if responsable is None:
            raise ValidationError("Parent / tuteur introuvable.")
    else:
        infos = {k: (donnees.get(k) or "").strip() for k in CHAMPS_RESPONSABLE}
        if not infos["nom"] or not infos["telephone"]:
            raise ValidationError("Le nom et le téléphone du parent / tuteur sont obligatoires.")
        responsable = Responsable.objects.create(**infos)
    lien = donnees.get("lien")
    if lien not in LienResponsable.Lien.values:
        raise ValidationError("Lien de parenté invalide (père, mère, tuteur légal ou autre).")
    if LienResponsable.objects.filter(eleve=eleve, responsable=responsable).exists():
        raise ValidationError(f"{responsable} est déjà rattaché à cet élève.")
    principal = bool(donnees.get("contact_principal")) or not eleve.liens.exists()
    if principal:
        eleve.liens.update(contact_principal=False)
    rattache = LienResponsable.objects.create(eleve=eleve, responsable=responsable, lien=lien,
                                              contact_principal=principal, acces_app=donnees.get("acces_app", True))
    acces = donnees.get("acces") or {}
    if acces.get("mot_de_passe"):
        if not acces_permis:
            raise ValidationError("L'espace parents n'est pas inclus dans le forfait de l'école.")
        creer_acces(responsable, acces.get("email") or responsable.email, acces["mot_de_passe"])
    return rattache


def definir_contact_principal(lien):
    LienResponsable.objects.filter(eleve=lien.eleve_id).exclude(pk=lien.pk).update(contact_principal=False)
    if not lien.contact_principal:
        lien.contact_principal = True
        lien.save(update_fields=["contact_principal"])
