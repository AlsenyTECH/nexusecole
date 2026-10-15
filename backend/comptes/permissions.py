from django.db import connection
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Role

PERSONNEL = (Role.DIRECTEUR, Role.SECRETAIRE, Role.COMPTABLE, Role.ENSEIGNANT, Role.SURVEILLANT)


class EstSuperAdmin(BasePermission):
    """Console NexusEcole : uniquement sur le schéma public, uniquement les super-admins."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated
            and user.role == Role.SUPERADMIN
            and connection.schema_name == "public"
        )


class AbonnementValide(BasePermission):
    """
    Applique l'état de l'abonnement de l'école :
    - résiliée / essai expiré → aucun accès ;
    - suspendue (impayé) → lecture seule : l'école consulte toujours ses données
      (bulletins, listes) mais ne peut plus rien modifier.
    """

    def has_permission(self, request, view):
        ecole = getattr(request, "tenant", None)
        if ecole is None or ecole.est_public:
            return False
        if ecole.acces_bloque:
            self.message = "Abonnement inactif : contactez NexusEcole."
            return False
        if ecole.lecture_seule and request.method not in SAFE_METHODS:
            self.message = "Abonnement suspendu : l'école est en lecture seule jusqu'au règlement."
            return False
        return True


def roles(lecture, ecriture=()):
    """Fabrique une permission par rôle : roles(lecture=PERSONNEL, ecriture=(Role.DIRECTEUR,))."""

    class _Roles(BasePermission):
        def has_permission(self, request, view):
            user = request.user
            if not (user and user.is_authenticated):
                return False
            autorises = lecture if request.method in SAFE_METHODS else ecriture
            return user.role in autorises

    return _Roles


class ModuleActif(BasePermission):
    """La vue déclare `module_requis` ; refusé si le forfait de l'école ne l'inclut pas."""

    message = "Ce module n'est pas inclus dans votre forfait."

    def has_permission(self, request, view):
        module = getattr(view, "module_requis", None)
        return module is None or request.tenant.a_module(module)
