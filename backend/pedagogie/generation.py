"""
Génération automatique des emplois du temps (voir docs/etude-emploi-du-temps.md).

Modèle CP-SAT (OR-Tools) : y[séance, jour, heure] = 1 si la séance commence à ce créneau.
- Contraintes dures : chaque séance placée une fois, dans une demi-journée ouverte, prof disponible ;
  au plus une séance par classe et par prof à chaque heure ; salles spécialisées dans leur capacité.
- Objectif (pénalités) : matière lourde l'après-midi (3), trou d'un professeur (2), même matière deux fois
  le même jour (5), heure hors des préférences d'un professeur qui en a (1).
- Plusieurs propositions : chacune diffère d'au moins 25 % des placements de la précédente.

Le diagnostic, fait avant tout calcul, explique les cas impossibles (heures de cours > créneaux, etc.).
"""
from collections import defaultdict
from dataclasses import dataclass, field

MIDI = "13:00"
P_LOURDE, P_TROU, P_MEME_JOUR, P_HORS_PREFERENCE = 3, 2, 5, 1
JOURS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]


@dataclass
class Seance:
    cours: int
    classe: str
    matiere: str
    prof: int | None
    duree: int
    lourde: bool
    salle: int | None


@dataclass
class Donnees:
    heures: list            # ["08:00", …] : début des créneaux d'une heure
    ouverts: set            # {(jour, indice)}
    seances: list           # [Seance]
    profs: dict             # id → nom
    indispo: dict = field(default_factory=dict)   # prof → {(jour, indice)}
    prefere: dict = field(default_factory=dict)   # prof → {(jour, indice)}
    salles: dict = field(default_factory=dict)    # id → (nom, nombre)
    alertes: list = field(default_factory=list)   # avertissements non bloquants

    def demi(self, i):
        return 0 if self.heures[i] < MIDI else 1

    def debuts_possibles(self, s):
        """Créneaux où la séance peut commencer : heures consécutives ouvertes, même demi-journée, prof disponible."""
        bloque = self.indispo.get(s.prof, set())
        for j, i in sorted(self.ouverts):
            bloc = list(range(i, i + s.duree))
            if bloc[-1] >= len(self.heures) or any((j, x) not in self.ouverts or (j, x) in bloque or self.demi(x) != self.demi(i)
                                                    for x in bloc):
                continue
            yield j, i


def lieu(d, j, i):
    return f"{JOURS[j]} {d.heures[i]}"


# --------------------------------------------------------------------------- #
# Diagnostic
# --------------------------------------------------------------------------- #
def diagnostiquer(d):
    """{erreurs: [...], alertes: [...], charge: {...}} ; s'il y a des erreurs, aucun calcul ne peut réussir."""
    erreurs, ouverts = [], len(d.ouverts)
    par_classe, par_prof, par_salle = defaultdict(int), defaultdict(int), defaultdict(int)
    for s in d.seances:
        par_classe[s.classe] += s.duree
        if s.prof is not None:
            par_prof[s.prof] += s.duree
        if s.salle is not None:
            par_salle[s.salle] += s.duree
    for classe, h in sorted(par_classe.items()):
        if h > ouverts:
            erreurs.append(f"La {classe} a {h} h de cours pour {ouverts} créneaux ouverts dans la semaine.")
    for p, h in par_prof.items():
        dispo = len(d.ouverts - d.indispo.get(p, set()))
        if h > dispo:
            erreurs.append(f"{d.profs[p]} a {h} h de cours mais n'est disponible que {dispo} h par semaine.")
    for sid, h in par_salle.items():
        nom, nombre = d.salles[sid]
        if h > nombre * ouverts:
            erreurs.append(f"{nom} : {h} h demandées pour {nombre * ouverts} h disponibles ({nombre} salle(s)) : "
                           f"ajoutez une salle ou réduisez les heures.")
    vues = set()
    for s in d.seances:
        if (s.cours, s.duree) not in vues and not any(True for _ in d.debuts_possibles(s)):
            qui = f" avec {d.profs[s.prof]}" if s.prof is not None else ""
            erreurs.append(f"{s.matiere} en {s.classe}{qui} : aucune demi-journée ne permet une séance de {s.duree} h.")
        vues.add((s.cours, s.duree))
    return {"erreurs": erreurs, "alertes": d.alertes,
            "charge": {"seances": len(d.seances), "heures": sum(s.duree for s in d.seances), "creneaux_ouverts": ouverts,
                       "classes": len(par_classe), "professeurs": len(par_prof)}}


# --------------------------------------------------------------------------- #
# Résolution
# --------------------------------------------------------------------------- #
def resoudre(d, propositions=3, limite=30.0, progression=None):
    """Liste de propositions [{score, faiblesses, placements}] ; vide si aucune solution n'existe."""
    from ortools.sat.python import cp_model

    m = cp_model.CpModel()
    y = {}
    for k, s in enumerate(d.seances):
        possibles = []
        for j, i in d.debuts_possibles(s):
            y[k, j, i] = v = m.NewBoolVar(f"y{k}_{j}_{i}")
            possibles.append(v)
        m.AddExactlyOne(possibles)

    def couvre(k, j, x):
        return [y[k, j, i] for i in range(x - d.seances[k].duree + 1, x + 1) if (k, j, i) in y]

    groupes = defaultdict(list)
    for k, s in enumerate(d.seances):
        groupes["c", s.classe].append(k)
        if s.prof is not None:
            groupes["p", s.prof].append(k)
        if s.salle is not None:
            groupes["s", s.salle].append(k)
    occupe = {}
    for (genre, cle), liste in groupes.items():
        for j, x in d.ouverts:
            termes = [v for k in liste for v in couvre(k, j, x)]
            if not termes:
                continue
            if genre == "s":
                m.Add(sum(termes) <= d.salles[cle][1])
            else:
                m.AddAtMostOne(termes)
            if genre == "p":
                o = m.NewBoolVar("")
                m.Add(sum(termes) == o)
                occupe[cle, j, x] = o

    penalites = []
    # Matière lourde l'après-midi
    for (k, j, i), v in y.items():
        if d.seances[k].lourde and d.demi(i) == 1:
            penalites.append(P_LOURDE * v)
    # Même matière plusieurs fois le même jour dans une classe
    par_cours = defaultdict(list)
    for k, s in enumerate(d.seances):
        par_cours[s.cours].append(k)
    jours = sorted({j for j, _ in d.ouverts})
    for ks in par_cours.values():
        if len(ks) < 2:
            continue
        for j in jours:
            termes = [v for (k, jj, i), v in y.items() if jj == j and k in ks]
            if len(termes) > 1:
                exces = m.NewIntVar(0, len(termes), "")
                m.Add(exces >= sum(termes) - 1)
                penalites.append(P_MEME_JOUR * exces)
    # Heures hors des préférences d'un professeur qui en a exprimé
    for (k, j, i), v in y.items():
        p = d.seances[k].prof
        if p is not None and d.prefere.get(p) and any((j, x) not in d.prefere[p] for x in range(i, i + d.seances[k].duree)):
            penalites.append(P_HORS_PREFERENCE * v)
    # Trous des professeurs : chaque bloc d'heures au-delà du premier dans une demi-journée
    profs = {cle for (genre, cle) in groupes if genre == "p"}
    for p in profs:
        for j in jours:
            for demi in (0, 1):
                heures = [x for x in range(len(d.heures)) if d.demi(x) == demi and (p, j, x) in occupe]
                if len(heures) < 2:
                    continue
                debuts = []
                for n, x in enumerate(heures):
                    b = m.NewBoolVar("")
                    avant = occupe[p, j, heures[n - 1]] if n and heures[n - 1] == x - 1 else 0
                    m.Add(b >= occupe[p, j, x] - avant)
                    debuts.append(b)
                trous = m.NewIntVar(0, len(debuts), "")
                m.Add(trous >= sum(debuts) - 1)
                penalites.append(P_TROU * trous)
    m.Minimize(sum(penalites) if penalites else 0)

    resultats = []
    for n in range(propositions):
        solveur = cp_model.CpSolver()
        solveur.parameters.max_time_in_seconds = limite
        solveur.parameters.num_workers = 2
        solveur.parameters.random_seed = 11 + n
        statut = solveur.Solve(m)
        if statut not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break
        choisis = [cle for cle, v in y.items() if solveur.Value(v)]
        placements = attribuer_salles(d, [(k, j, i) for k, j, i in choisis])
        resultats.append({"numero": n + 1, "score": int(solveur.ObjectiveValue()), "optimal": statut == cp_model.OPTIMAL,
                          "faiblesses": faiblesses(d, choisis), "placements": placements})
        if progression:
            progression(n + 1)
        m.Add(sum(y[c] for c in choisis) <= int(len(choisis) * 0.75))  # la suivante doit être différente
    return resultats


def attribuer_salles(d, choisis):
    """Numérote les salles spécialisées (Labo 1, Labo 2…) : glouton par heure de début, valide car la capacité est respectée."""
    occupees = defaultdict(set)   # (salle, jour, heure) → numéros pris
    placements = []
    for k, j, i in sorted(choisis, key=lambda c: (c[1], c[2])):
        s = d.seances[k]
        salle = ""
        if s.salle is not None:
            nom, nombre = d.salles[s.salle]
            libre = next(n for n in range(1, nombre + 1) if all(n not in occupees[s.salle, j, x] for x in range(i, i + s.duree)))
            for x in range(i, i + s.duree):
                occupees[s.salle, j, x].add(libre)
            salle = nom if nombre == 1 else f"{nom} {libre}"
        placements.append({"cours": s.cours, "classe": s.classe, "matiere": s.matiere, "prof": s.prof,
                           "prof_nom": d.profs.get(s.prof, ""), "jour": j, "heure": i, "duree": s.duree, "salle": salle})
    return placements


def faiblesses(d, choisis):
    """Points faibles lisibles d'une proposition (ce qui coûte des points)."""
    lignes = []
    lourdes = [(k, j, i) for k, j, i in choisis if d.seances[k].lourde and d.demi(i) == 1]
    for k, j, i in lourdes[:4]:
        lignes.append(f"{d.seances[k].matiere} l'après-midi en {d.seances[k].classe} ({lieu(d, j, i)})")
    if len(lourdes) > 4:
        lignes.append(f"… et {len(lourdes) - 4} autre(s) matière(s) lourde(s) l'après-midi")
    par_cours_jour = defaultdict(int)
    for k, j, _ in choisis:
        par_cours_jour[d.seances[k].cours, j] += 1
    for (cours, j), n in par_cours_jour.items():
        if n > 1:
            s = next(x for x in d.seances if x.cours == cours)
            lignes.append(f"{s.matiere} {n} fois le {JOURS[j].lower()} en {s.classe}")
    heures_prof = defaultdict(set)
    for k, j, i in choisis:
        if d.seances[k].prof is not None:
            heures_prof[d.seances[k].prof, j] |= set(range(i, i + d.seances[k].duree))
    for (p, j), heures in sorted(heures_prof.items(), key=lambda e: (d.profs[e[0][0]], e[0][1])):
        for demi in (0, 1):
            h = sorted(x for x in heures if d.demi(x) == demi)
            if h and h[-1] - h[0] + 1 > len(h):
                lignes.append(f"{d.profs[p]} : {h[-1] - h[0] + 1 - len(h)} h de trou le {JOURS[j].lower()}")
    return lignes


# --------------------------------------------------------------------------- #
# Lien avec la base de l'école
# --------------------------------------------------------------------------- #
def charger(annee):
    from .models import Cours, Disponibilite, GrilleHoraire, SalleSpecialisee

    g = GrilleHoraire.actuelle()
    d = Donnees(heures=list(g.heures), ouverts={tuple(x) for x in g.ouverts}, seances=[], profs={})
    d.salles = {s.pk: (s.nom, s.nombre) for s in SalleSpecialisee.objects.all()}
    sans_volume, sans_prof = [], []
    for c in Cours.objects.filter(classe__annee=annee).select_related("classe", "matiere", "enseignant"):
        if not c.volume_horaire:
            sans_volume.append(f"{c.matiere.nom} en {c.classe.nom}")
            continue
        if c.enseignant_id is None:
            sans_prof.append(f"{c.matiere.nom} en {c.classe.nom}")
        else:
            d.profs[c.enseignant_id] = c.enseignant.nom_complet
        for duree in c.seances():
            d.seances.append(Seance(cours=c.pk, classe=c.classe.nom, matiere=c.matiere.nom, prof=c.enseignant_id, duree=duree,
                                    lourde=c.matiere.lourde, salle=c.matiere.salle_id))
    def resume(liste):
        return ", ".join(liste[:6]) + (f" et {len(liste) - 6} autre(s)" if len(liste) > 6 else "")

    if sans_prof:
        d.alertes.append(f"{len(sans_prof)} cours sans enseignant, placés sans contrainte de professeur : {resume(sans_prof)}.")
    if sans_volume:
        d.alertes.append(f"{len(sans_volume)} cours sans volume horaire, donc non placés : {resume(sans_volume)}.")
    for disp in Disponibilite.objects.filter(enseignant_id__in=d.profs):
        d.indispo[disp.enseignant_id] = {tuple(x) for x in disp.indispo}
        d.prefere[disp.enseignant_id] = {tuple(x) for x in disp.prefere}
    return d


def executer(generation_id, propositions=3, limite=30.0):
    """Calcul complet d'une génération (appelé dans une tâche de fond, déjà dans le schéma de l'école)."""
    from django.utils import timezone

    from .models import GenerationEDT

    gen = GenerationEDT.objects.get(pk=generation_id)
    try:
        d = charger(gen.annee)
        gen.diagnostic = {**diagnostiquer(d), "heures": d.heures}
        if not d.seances:
            gen.statut, gen.message = GenerationEDT.Statut.IMPOSSIBLE, "Aucun cours n'a de volume horaire : rien à placer."
        elif gen.diagnostic["erreurs"]:
            gen.statut, gen.message = GenerationEDT.Statut.IMPOSSIBLE, "Les données rendent tout emploi du temps impossible : voir le diagnostic."
        else:
            gen.save(update_fields=["diagnostic"])

            def avancer(n):
                GenerationEDT.objects.filter(pk=gen.pk).update(progression=round(100 * n / propositions))

            gen.propositions = resoudre(d, propositions, limite, avancer)
            if gen.propositions:
                gen.statut = GenerationEDT.Statut.TERMINEE
                gen.message = f"{len(gen.propositions)} proposition(s) trouvée(s)."
            else:
                gen.statut = GenerationEDT.Statut.IMPOSSIBLE
                gen.message = ("Aucune combinaison ne respecte toutes les règles (disponibilités trop serrées, salles…). "
                               "Assouplissez les disponibilités ou le découpage des séances.")
    except Exception as e:  # le calcul ne doit jamais laisser une génération « en cours » pour toujours
        gen.statut, gen.message = GenerationEDT.Statut.ECHEC, f"Erreur pendant le calcul : {e}"[:300]
    gen.progression, gen.termine_le = 100, timezone.now()
    gen.save()
    return gen


def lancer_en_arriere_plan(generation_id, schema):
    """Thread séparé : pas de file de tâches sur l'hébergement gratuit."""
    import threading

    from django.db import connection
    from django_tenants.utils import schema_context

    def travail():
        try:
            with schema_context(schema):
                executer(generation_id)
        finally:
            connection.close()

    threading.Thread(target=travail, daemon=True, name=f"edt-{generation_id}").start()


def publier(generation, numero):
    """La proposition retenue devient l'emploi du temps de l'année (créneaux visibles des profs et des familles)."""
    from datetime import datetime, timedelta

    from django.core.exceptions import ValidationError
    from django.db import transaction

    from .models import Creneau, GrilleHoraire

    prop = next((p for p in generation.propositions if p["numero"] == numero), None)
    if prop is None:
        raise ValidationError("Proposition inconnue.")
    heures = GrilleHoraire.actuelle().heures
    if heures != generation.diagnostic.get("heures", heures):
        raise ValidationError("La grille horaire a changé depuis le calcul : relancez la génération.")

    def heure(i, duree):
        debut = datetime.strptime(heures[i], "%H:%M")
        return debut.time(), (debut + timedelta(hours=duree)).time()

    with transaction.atomic():
        Creneau.objects.filter(cours__classe__annee=generation.annee).delete()
        for p in prop["placements"]:
            debut, fin = heure(p["heure"], p["duree"])
            Creneau.objects.create(cours_id=p["cours"], jour=p["jour"], debut=debut, fin=fin, salle=p["salle"])
        generation.publiee = numero
        generation.save(update_fields=["publiee"])
    return len(prop["placements"])
