"""
Périmètre de chacun : sans le droit « classes.toutes », un compte ne voit que les classes
où il enseigne (cours) ou qu'il surveille, et les élèves, notes, absences de ces classes.
"""
from django.db.models import Q

from .models import Classe


def classes_visibles(user):
    """None = toutes les classes ; sinon une sous-requête des identifiants de classes visibles."""
    if user.a_permission("classes.toutes") or user.a_permission("notes.saisir_toutes"):
        return None
    return Classe.objects.filter(Q(cours__enseignant=user) | Q(surveillances__surveillant=user)).values("id")


def filtrer(qs, user, champ="classe"):
    visibles = classes_visibles(user)
    return qs if visibles is None else qs.filter(**{f"{champ}__in": visibles})


def classe_visible(user, classe):
    visibles = classes_visibles(user)
    return visibles is None or Classe.objects.filter(pk=classe.pk, id__in=visibles).exists()
