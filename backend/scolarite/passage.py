"""
Passage d'une année scolaire à la suivante.

- Préparer l'année suivante en reconduisant ce qu'on veut : classes, grille des frais (dates décalées),
  matières et coefficients (SANS les enseignants : leurs affectations repartent de zéro), trimestres.
- Les élèves, les parents, le personnel et les enseignants (avec leurs accès) ne changent pas d'une année à l'autre.
- Le conseil de fin d'année décide (passe, redouble, exclu, départ) ; la réinscription propose alors
  la classe de l'année suivante, à valider.
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from .models import AnneeScolaire, Classe, DecisionFinAnnee, Eleve, Inscription

# Ordre des niveaux (Sénégal et pays voisins) ; un niveau inconnu n'a pas de « suivant » proposé
NIVEAUX = ["PS", "MS", "GS", "CI", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "Seconde", "Première", "Terminale"]


def niveau_suivant(niveau):
    if niveau in NIVEAUX and niveau != NIVEAUX[-1]:
        return NIVEAUX[NIVEAUX.index(niveau) + 1]
    return None


# --------------------------------------------------------------------------- #
# Statut des années
# --------------------------------------------------------------------------- #
@transaction.atomic
def activer(annee):
    """L'année devient l'année active ; l'ancienne active est clôturée."""
    AnneeScolaire.objects.filter(statut=AnneeScolaire.Statut.ACTIVE).exclude(pk=annee.pk).update(
        statut=AnneeScolaire.Statut.CLOTUREE, active=False)
    annee.statut, annee.active = AnneeScolaire.Statut.ACTIVE, True
    annee.save(update_fields=["statut", "active"])
    # La classe « courante » affichée de chaque élève suit l'année active
    for i in Inscription.objects.filter(annee=annee).only("eleve_id", "classe_id"):
        Eleve.objects.filter(pk=i.eleve_id).update(classe_id=i.classe_id)
    return annee


def changer_statut(annee, statut):
    if statut not in AnneeScolaire.Statut.values:
        raise ValidationError("Statut inconnu.")
    if statut == AnneeScolaire.Statut.ACTIVE:
        return activer(annee)
    annee.statut, annee.active = statut, False
    annee.save(update_fields=["statut", "active"])
    return annee


# --------------------------------------------------------------------------- #
# Préparer l'année suivante
# --------------------------------------------------------------------------- #
@transaction.atomic
def reconduire(source, *, libelle, debut, fin, classes=True, frais=True, cours=True, periodes=True):
    if AnneeScolaire.objects.filter(libelle=libelle).exists():
        raise ValidationError(f"L'année {libelle} existe déjà.")
    if fin <= debut:
        raise ValidationError("La fin doit suivre le début.")
    cible = AnneeScolaire.objects.create(libelle=libelle, debut=debut, fin=fin, statut=AnneeScolaire.Statut.PREPARATION)
    bilan = {"classes": 0, "frais": 0, "cours": 0, "periodes": 0}
    correspondance = {}
    if classes or cours:
        for c in source.classes.all():
            correspondance[c.pk] = Classe.objects.create(annee=cible, nom=c.nom, niveau=c.niveau, bareme=c.bareme)
        bilan["classes"] = len(correspondance)
    if frais:
        from finances.models import Frais
        from finances.services import ajouter_mois

        decalage = (debut.year - source.debut.year) * 12 + (debut.month - source.debut.month)
        for f in Frais.objects.filter(annee=source, actif=True):
            Frais.objects.create(annee=cible, libelle=f.libelle, categorie=f.categorie, montant=f.montant, periodicite=f.periodicite,
                                 nombre_echeances=f.nombre_echeances, premiere_echeance=ajouter_mois(f.premiere_echeance, decalage),
                                 niveaux=f.niveaux, obligatoire=f.obligatoire)
            bilan["frais"] += 1
    if cours:
        from pedagogie.models import Cours

        nouveaux = [Cours(classe=correspondance[c.classe_id], matiere_id=c.matiere_id, coefficient=c.coefficient)  # sans enseignant
                    for c in Cours.objects.filter(classe__annee=source)]
        Cours.objects.bulk_create(nouveaux)
        bilan["cours"] = len(nouveaux)
    if periodes:
        from pedagogie.services import generer_periodes

        bilan["periodes"] = len(generer_periodes(cible))
    return cible, bilan


# --------------------------------------------------------------------------- #
# Décisions de fin d'année
# --------------------------------------------------------------------------- #
def moyennes_annuelles(classe):
    """Moyenne des moyennes de période (celles qui en ont une) pour chaque inscription de la classe."""
    from pedagogie.models import Periode
    from pedagogie.services import resultats_classe

    cumuls = {}
    for p in Periode.objects.filter(annee=classe.annee):
        for r in resultats_classe(classe, p)["eleves"]:
            if r["moyenne"] is not None:
                cumuls.setdefault(r["inscription"], []).append(r["moyenne"])
    return {i: round(sum(v) / len(v), 2) for i, v in cumuls.items()}


def decisions_classe(classe):
    moyennes = moyennes_annuelles(classe)
    deja = {d.inscription_id: d for d in DecisionFinAnnee.objects.filter(inscription__classe=classe)}
    lignes = []
    for i in Inscription.objects.filter(classe=classe, statut=Inscription.Statut.ACTIVE).select_related("eleve"):
        moy = moyennes.get(i.pk)
        d = deja.get(i.pk)
        lignes.append({
            "inscription": i.pk, "eleve": f"{i.eleve.prenom} {i.eleve.nom}", "matricule": i.eleve.matricule, "moyenne_annuelle": moy,
            "suggestion": None if moy is None else ("passe" if moy >= classe.bareme / 2 else "redouble"),
            "decision": d.decision if d else None, "commentaire": d.commentaire if d else "",
        })
    return {"classe": classe.nom, "bareme": classe.bareme, "eleves": sorted(lignes, key=lambda l: l["eleve"])}


@transaction.atomic
def enregistrer_decisions(classe, decisions, par):
    moyennes = moyennes_annuelles(classe)
    inscrits = set(Inscription.objects.filter(classe=classe).values_list("id", flat=True))
    n = 0
    for d in decisions:
        insc = int(d["inscription"])
        if insc not in inscrits:
            raise ValidationError("Élève hors de cette classe.")
        if not d.get("decision"):
            DecisionFinAnnee.objects.filter(inscription_id=insc).delete()
            continue
        if d["decision"] not in DecisionFinAnnee.Decision.values:
            raise ValidationError("Décision inconnue.")
        moy = moyennes.get(insc)
        DecisionFinAnnee.objects.update_or_create(inscription_id=insc, defaults={
            "decision": d["decision"], "commentaire": str(d.get("commentaire", ""))[:200], "par": par,
            "moyenne_annuelle": None if moy is None else Decimal(str(moy))})
        n += 1
    return n


# --------------------------------------------------------------------------- #
# Réinscriptions
# --------------------------------------------------------------------------- #
def annee_precedente(cible):
    return AnneeScolaire.objects.filter(debut__lt=cible.debut).order_by("-debut").first()


def classe_proposee(ancienne, decision, classes_cible):
    """6e A qui passe → 5e A (sinon une autre 5e) ; qui redouble → 6e A (sinon une autre 6e)."""
    if decision in (DecisionFinAnnee.Decision.EXCLU, DecisionFinAnnee.Decision.DEPART):
        return None
    niveau = ancienne.niveau if decision == DecisionFinAnnee.Decision.REDOUBLE else niveau_suivant(ancienne.niveau)
    if not niveau:
        return None
    candidates = [c for c in classes_cible if c.niveau == niveau]
    nom = ancienne.nom.replace(ancienne.niveau, niveau, 1) if ancienne.niveau else ancienne.nom
    return next((c for c in candidates if c.nom == nom), candidates[0] if candidates else None)


def propositions(cible):
    source = annee_precedente(cible)
    if source is None:
        return None, []
    classes_cible = list(cible.classes.all())
    deja = dict(Inscription.objects.filter(annee=cible).values_list("eleve_id", "classe__nom"))
    lignes = []
    for i in (Inscription.objects.filter(annee=source).exclude(statut=Inscription.Statut.ABANDON)
              .select_related("eleve", "classe", "decision").order_by("classe__nom", "eleve__nom", "eleve__prenom")):
        if not i.eleve.actif:
            continue
        d = getattr(i, "decision", None)
        proposee = classe_proposee(i.classe, d.decision, classes_cible) if d else None
        lignes.append({
            "eleve": i.eleve_id, "nom": f"{i.eleve.prenom} {i.eleve.nom}", "matricule": i.eleve.matricule,
            "ancienne_classe": i.classe.nom, "decision": d.decision if d else None,
            "moyenne_annuelle": float(d.moyenne_annuelle) if d and d.moyenne_annuelle is not None else None,
            "classe_proposee": proposee.pk if proposee else None, "deja_inscrit": deja.get(i.eleve_id),
        })
    return source, lignes


@transaction.atomic
def reinscrire(cible, lignes, *, frais=True):
    """lignes : [{eleve, classe}] → inscriptions dans l'année cible (échéances créées depuis sa grille)."""
    if cible.statut == AnneeScolaire.Statut.CLOTUREE:
        raise ValidationError("On ne réinscrit pas dans une année clôturée.")
    classes = {c.pk: c for c in cible.classes.all()}
    creees = []
    for l in lignes:
        classe = classes.get(int(l.get("classe") or 0))
        if classe is None:
            raise ValidationError("Choisissez une classe de l'année à préparer pour chaque élève.")
        eleve = Eleve.objects.filter(pk=l.get("eleve"), actif=True).first()
        if eleve is None:
            raise ValidationError("Élève inconnu ou sorti des effectifs.")
        if Inscription.objects.filter(eleve=eleve, annee=cible).exists():
            continue  # déjà réinscrit : sans effet
        creees.append(Inscription.objects.create(eleve=eleve, classe=classe))
        if cible.statut == AnneeScolaire.Statut.ACTIVE:
            Eleve.objects.filter(pk=eleve.pk).update(classe=classe)
    if frais:
        from finances.services import generer_echeances

        for i in creees:
            generer_echeances(i)
    return len(creees)
