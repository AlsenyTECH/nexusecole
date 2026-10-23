"""Règles métier de la pédagogie : droits de saisie, notes et journal, moyennes, bulletins signés."""
import base64
import hashlib
import json
import secrets
from collections import defaultdict
from decimal import Decimal

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection, transaction
from django.db.models import Count, Q
from django.utils import timezone

from scolarite.models import Inscription

from .models import Absence, Bulletin, Conseil, Cours, JournalNote, Note, Parametres, Surveillance

GENESE = "0" * 64


# --------------------------------------------------------------------------- #
# Qui peut saisir ?
# --------------------------------------------------------------------------- #
def surveille(user, classe):
    return Surveillance.objects.filter(classe=classe, surveillant=user).exists()


def peut_saisir_notes(user, cours):
    if user.a_permission("notes.saisir_toutes"):
        return True
    if not user.a_permission("notes.saisir"):
        return False
    return cours.enseignant_id == user.pk or surveille(user, cours.classe)


def peut_faire_l_appel(user, classe):
    if user.a_permission("notes.saisir_toutes"):
        return True
    if not user.a_permission("absences.saisir"):
        return False
    return surveille(user, classe) or Cours.objects.filter(classe=classe, enseignant=user).exists()


def peut_valider(user, cours):
    return user.a_permission("notes.valider") or cours.enseignant_id == user.pk


def cours_saisissables(user, annee):
    qs = Cours.objects.filter(classe__annee=annee).select_related("classe", "matiere", "enseignant")
    if user.a_permission("notes.saisir_toutes"):
        return qs
    if not user.a_permission("notes.saisir"):
        return qs.none()
    return qs.filter(Q(enseignant=user) | Q(classe__surveillances__surveillant=user)).distinct()


def est_verrouille(classe, periode):
    return Conseil.objects.filter(classe=classe, periode=periode).exists()


# --------------------------------------------------------------------------- #
# Journal chaîné
# --------------------------------------------------------------------------- #
def _empreinte(precedente, evaluation_id, inscription_id, ancienne, nouvelle, par_id, le):
    donnees = f"{precedente}|{evaluation_id}|{inscription_id}|{ancienne}|{nouvelle}|{par_id}|{le.isoformat()}"
    return hashlib.sha256(donnees.encode()).hexdigest()


def _journaliser(note, ancienne, nouvelle, par):
    # Verrou consultatif : deux saisies simultanées ne peuvent pas « bifurquer » la chaîne
    with connection.cursor() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext('journal_notes'))")
    derniere = JournalNote.objects.order_by("-id").values_list("empreinte", flat=True).first() or GENESE
    le = timezone.now()
    JournalNote.objects.create(
        note=note, evaluation_id_fige=note.evaluation_id, inscription_id_fige=note.inscription_id,
        ancienne_valeur=ancienne, nouvelle_valeur=nouvelle, par=par, le=le, precedente=derniere,
        empreinte=_empreinte(derniere, note.evaluation_id, note.inscription_id, ancienne, nouvelle, par.pk, le),
    )


def verifier_journal():
    """Recalcule toute la chaîne ; renvoie (True, None) ou (False, id de la première ligne altérée)."""
    precedente = GENESE
    for j in JournalNote.objects.order_by("id"):
        attendue = _empreinte(precedente, j.evaluation_id_fige, j.inscription_id_fige, j.ancienne_valeur,
                              j.nouvelle_valeur, j.par_id, j.le)
        if j.precedente != precedente or j.empreinte != attendue:
            return False, j.pk
        precedente = j.empreinte
    return True, None


def _texte(note):
    if note is None:
        return ""
    return "ABS" if note.absent else ("" if note.valeur is None else format(note.valeur.normalize(), "f"))


# --------------------------------------------------------------------------- #
# Saisie des notes
# --------------------------------------------------------------------------- #
@transaction.atomic
def enregistrer_notes(evaluation, saisies, par):
    """saisies : [{"inscription": id, "valeur": "12.5" | None, "absent": bool}]"""
    cours = evaluation.cours
    if not peut_saisir_notes(par, cours):
        raise PermissionDenied("Vous n'êtes pas affecté à ce cours.")
    if est_verrouille(cours.classe, evaluation.periode):
        raise ValidationError("Le conseil de classe a verrouillé cette période : les notes ne peuvent plus changer.")

    inscrits = set(Inscription.objects.filter(classe=cours.classe, statut=Inscription.Statut.ACTIVE)
                   .values_list("id", flat=True))
    a_valider = (Parametres.actuels().validation_notes_surveillant
                 and cours.enseignant_id != par.pk and not par.a_permission("notes.valider"))
    existantes = {n.inscription_id: n for n in evaluation.notes.select_for_update()}
    modifiees = 0
    for s in saisies:
        insc_id = int(s["inscription"])
        if insc_id not in inscrits:
            raise ValidationError(f"L'élève {insc_id} n'est pas inscrit dans cette classe.")
        absent = bool(s.get("absent"))
        valeur = None if absent or s.get("valeur") in (None, "") else Decimal(str(s["valeur"]).replace(",", "."))
        if valeur is not None and not (0 <= valeur <= evaluation.sur):
            raise ValidationError(f"Une note doit être comprise entre 0 et {evaluation.sur}.")
        note = existantes.get(insc_id)
        ancienne = _texte(note)
        if note is None:
            if valeur is None and not absent:
                continue  # rien à saisir
            note = Note(evaluation=evaluation, inscription_id=insc_id)
        note.valeur, note.absent, note.saisie_par = valeur, absent, par
        if _texte(note) == ancienne and note.pk:
            continue
        note.statut = Note.Statut.A_VALIDER if a_valider else Note.Statut.VALIDEE
        note.save()
        _journaliser(note, ancienne, _texte(note), par)
        modifiees += 1
    return modifiees


@transaction.atomic
def valider_notes(evaluation, par):
    if not peut_valider(par, evaluation.cours):
        raise PermissionDenied("Seul l'enseignant du cours (ou la direction) valide les notes.")
    return evaluation.notes.filter(statut=Note.Statut.A_VALIDER).update(statut=Note.Statut.VALIDEE)


# --------------------------------------------------------------------------- #
# Moyennes, rangs, mentions
# --------------------------------------------------------------------------- #
def mention(moyenne, bareme):
    if moyenne is None:
        return ""
    sur20 = moyenne * 20 / bareme
    for seuil, libelle in ((16, "Très bien"), (14, "Bien"), (12, "Assez bien"), (10, "Passable")):
        if sur20 >= seuil:
            return libelle
    return "Insuffisant"


def _moyenne(valeurs):
    return sum(valeurs) / len(valeurs) if valeurs else None


def _rangs(moyennes):
    """Classement « olympique » : 1, 2, 2, 4… (ex aequo au même rang)."""
    arrondies = {i: _arrondi(m) for i, m in moyennes.items()}  # comparer au centième près
    tries = sorted((m for m in arrondies.values() if m is not None), reverse=True)
    return {i: (tries.index(m) + 1 if m is not None else None) for i, m in arrondies.items()}


def resultats_classe(classe, periode):
    """Moyennes par matière et générales, rangs et mentions de tous les élèves actifs de la classe."""
    params = Parametres.actuels()
    bareme = classe.bareme
    inscriptions = list(Inscription.objects.filter(classe=classe, statut=Inscription.Statut.ACTIVE).select_related("eleve"))
    cours = list(Cours.objects.filter(classe=classe).select_related("matiere", "enseignant"))

    # notes[cours][inscription] = {"devoir": [...], "composition": [...]} ramenées au barème de la classe
    notes = defaultdict(lambda: defaultdict(lambda: {"devoir": [], "composition": []}))
    for n in Note.objects.filter(evaluation__cours__classe=classe, evaluation__periode=periode,
                                 statut=Note.Statut.VALIDEE, absent=False, valeur__isnull=False).select_related("evaluation"):
        e = n.evaluation
        notes[e.cours_id][n.inscription_id][e.type].append(float(n.valeur) / e.sur * bareme)

    absences = {r["inscription"]: r for r in Absence.objects.filter(
        inscription__classe=classe, date__gte=periode.debut, date__lte=periode.fin).values("inscription").annotate(
        absences=Count("id", filter=Q(type=Absence.Type.ABSENCE)),
        justifiees=Count("id", filter=Q(type=Absence.Type.ABSENCE, justifiee=True)),
        retards=Count("id", filter=Q(type=Absence.Type.RETARD)))}

    par_eleve, generales, par_cours = {}, {}, defaultdict(dict)
    for insc in inscriptions:
        lignes, total, coefs = [], 0.0, 0.0
        for c in cours:
            d = notes[c.pk][insc.pk]
            md, mc = _moyenne(d["devoir"]), _moyenne(d["composition"])
            if md is not None and mc is not None:
                moy = (md * params.poids_devoirs + mc * params.poids_composition) / (params.poids_devoirs + params.poids_composition)
            else:
                moy = md if md is not None else mc
            par_cours[c.pk][insc.pk] = moy
            coef = float(c.coefficient)
            if moy is not None:
                total += moy * coef
                coefs += coef
            lignes.append({"cours": c.pk, "matiere": c.matiere.nom, "coefficient": coef,
                           "enseignant": c.enseignant.nom_complet if c.enseignant else "",
                           "devoirs": _arrondi(md), "composition": _arrondi(mc), "moyenne": _arrondi(moy),
                           "points": _arrondi(moy * coef) if moy is not None else None})
        generales[insc.pk] = total / coefs if coefs else None
        a = absences.get(insc.pk, {})
        par_eleve[insc.pk] = {"inscription": insc.pk, "eleve": str(insc.eleve), "matricule": insc.eleve.matricule,
                              "prenom": insc.eleve.prenom, "nom": insc.eleve.nom, "matieres": lignes,
                              "absences": a.get("absences", 0), "absences_justifiees": a.get("justifiees", 0),
                              "retards": a.get("retards", 0)}

    rangs = _rangs(generales)
    rangs_cours = {c: _rangs(m) for c, m in par_cours.items()}
    for i, r in par_eleve.items():
        r["moyenne"] = _arrondi(generales[i])
        r["rang"] = rangs[i]
        r["mention"] = mention(generales[i], bareme)
        for ligne in r["matieres"]:
            ligne["rang"] = rangs_cours[ligne["cours"]].get(i)
    valides = [m for m in generales.values() if m is not None]
    return {
        "classe": classe.nom, "periode": periode.nom, "annee": str(periode.annee), "bareme": bareme,
        "effectif": len(inscriptions), "verrouille": est_verrouille(classe, periode),
        "statistiques": {"moyenne_classe": _arrondi(_moyenne(valides)), "plus_forte": _arrondi(max(valides, default=None)),
                         "plus_faible": _arrondi(min(valides, default=None)),
                         "admis": sum(1 for m in valides if m >= bareme / 2)},
        "eleves": sorted(par_eleve.values(), key=lambda r: (r["rang"] is None, r["rang"] or 0, r["nom"])),
    }


def _arrondi(x):
    return None if x is None else round(x + 1e-9, 2)


# --------------------------------------------------------------------------- #
# Signature des bulletins (Ed25519, une clé par école dérivée du secret serveur)
# --------------------------------------------------------------------------- #
def _cle_privee():
    secret = getattr(settings, "BULLETIN_SIGNING_SECRET", settings.SECRET_KEY).encode()
    graine = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"nexusecole-bulletins-v1",
                  info=connection.schema_name.encode()).derive(secret)
    return Ed25519PrivateKey.from_private_bytes(graine)


def cle_publique_b64():
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

    brute = _cle_privee().public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return base64.b64encode(brute).decode()


def canonique(contenu):
    return json.dumps(contenu, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def signature_valide(bulletin):
    if hashlib.sha256(canonique(bulletin.contenu)).hexdigest() != bulletin.empreinte:
        return False
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(cle_publique_b64())).verify(
            base64.b64decode(bulletin.signature), canonique(bulletin.contenu))
        return True
    except Exception:
        return False


@transaction.atomic
def tenir_conseil(classe, periode, par, ecole_nom):
    """Verrouille la période pour la classe et émet les bulletins signés de tous les élèves actifs."""
    if est_verrouille(classe, periode):
        raise ValidationError("Le conseil de classe de cette période a déjà eu lieu.")
    if Note.objects.filter(evaluation__cours__classe=classe, evaluation__periode=periode,
                           statut=Note.Statut.A_VALIDER).exists():
        raise ValidationError("Des notes saisies par un surveillant attendent encore la validation de l'enseignant.")
    resultats = resultats_classe(classe, periode)
    Conseil.objects.create(classe=classe, periode=periode, verrouille_par=par)
    cle = _cle_privee()
    emis = []
    for r in resultats["eleves"]:
        contenu = {
            "ecole": ecole_nom, "annee": resultats["annee"], "periode": resultats["periode"], "classe": resultats["classe"],
            "effectif": resultats["effectif"], "bareme": resultats["bareme"], "statistiques": resultats["statistiques"],
            **{k: r[k] for k in ("eleve", "matricule", "matieres", "moyenne", "rang", "mention",
                                 "absences", "absences_justifiees", "retards")},
        }
        octets = canonique(contenu)
        emis.append(Bulletin(
            inscription_id=r["inscription"], periode=periode, contenu=contenu,
            empreinte=hashlib.sha256(octets).hexdigest(),
            signature=base64.b64encode(cle.sign(octets)).decode(),
            code=secrets.token_urlsafe(9)[:12],
        ))
    Bulletin.objects.bulk_create(emis)
    return len(emis)
