from django.contrib.auth.password_validation import validate_password
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .authentication import ConnexionSerializer, RafraichissementSerializer
from .droits import PERMISSIONS, ROLES_TOUS_DROITS
from .models import Role, RoleEcole, Utilisateur
from .permissions import AbonnementValide, permission


class ConnexionView(TokenObtainPairView):
    serializer_class = ConnexionSerializer
    throttle_scope = "connexion"


class RafraichissementView(TokenRefreshView):
    serializer_class = RafraichissementSerializer
    throttle_scope = "connexion"


class UtilisateurSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ["id", "email", "prenom", "nom", "telephone", "role"]


class MoiView(APIView):
    def get(self, request):
        data = UtilisateurSerializer(request.user).data
        if getattr(request, "tenant", None) and not request.tenant.est_public:
            data["permissions"] = sorted(request.user.permissions_ecole())
        return Response(data)


# --------------------------------------------------------------------------- #
# Rôles et droits (configurés par l'administrateur de l'école)
# --------------------------------------------------------------------------- #
ROLES_ECOLE = [r for r in Role if r != Role.SUPERADMIN]


def _role_data(code, permissions):
    return {
        "code": code,
        "nom": Role(code).label,
        "permissions": sorted(permissions),
        "modifiable": code not in ROLES_TOUS_DROITS,
    }


class RolesView(APIView):
    permission_classes = [AbonnementValide, permission("roles.gerer")]

    def get(self, request):
        existants = {r.code: r.permissions for r in RoleEcole.objects.all()}
        roles = [
            _role_data(r, PERMISSIONS if r in ROLES_TOUS_DROITS else existants.get(r, []))
            for r in ROLES_ECOLE
        ]
        return Response({"permissions": PERMISSIONS, "roles": roles})


class RoleDetailView(APIView):
    permission_classes = [AbonnementValide, permission("roles.gerer")]

    def patch(self, request, code):
        if code not in Role.values or code == Role.SUPERADMIN:
            return Response({"detail": "Rôle inconnu."}, status=status.HTTP_404_NOT_FOUND)
        if code in ROLES_TOUS_DROITS:
            raise ValidationError({"detail": "Le directeur a toujours tous les droits."})
        demandees = request.data.get("permissions")
        if not isinstance(demandees, list) or not set(demandees) <= set(PERMISSIONS):
            raise ValidationError({"permissions": "Liste de permissions invalide."})
        role, _ = RoleEcole.objects.update_or_create(code=code, defaults={"permissions": sorted(set(demandees))})
        return Response(_role_data(role.code, role.permissions))


# --------------------------------------------------------------------------- #
# Comptes du personnel
# --------------------------------------------------------------------------- #
class PersonnelSerializer(serializers.ModelSerializer):
    mot_de_passe = serializers.CharField(write_only=True, required=False)
    role = serializers.ChoiceField(choices=[(r.value, r.label) for r in ROLES_ECOLE])

    class Meta:
        model = Utilisateur
        fields = ["id", "email", "prenom", "nom", "telephone", "role", "is_active", "mot_de_passe", "last_login"]
        read_only_fields = ["last_login"]

    def validate_email(self, value):
        return value.lower()

    def validate(self, attrs):
        demandeur = self.context["request"].user
        # Seul un directeur peut nommer (ou retirer) un directeur : pas d'élévation de privilèges.
        touche_directeur = attrs.get("role") == Role.DIRECTEUR or (
            self.instance is not None and self.instance.role == Role.DIRECTEUR
        )
        if touche_directeur and demandeur.role != Role.DIRECTEUR:
            raise PermissionDenied("Seul un directeur peut attribuer ou modifier le rôle de directeur.")
        if self.instance is not None and self.instance.pk == demandeur.pk:
            if "role" in attrs and attrs["role"] != demandeur.role:
                raise ValidationError({"role": "Vous ne pouvez pas changer votre propre rôle."})
            if attrs.get("is_active") is False:
                raise ValidationError({"is_active": "Vous ne pouvez pas désactiver votre propre compte."})
        if self.instance is None and not attrs.get("mot_de_passe"):
            raise ValidationError({"mot_de_passe": "Obligatoire à la création."})
        if attrs.get("mot_de_passe"):
            validate_password(attrs["mot_de_passe"])
        return attrs

    def create(self, data):
        mdp = data.pop("mot_de_passe")
        return Utilisateur.objects.create_user(password=mdp, **data)

    def update(self, instance, data):
        mdp = data.pop("mot_de_passe", None)
        for champ, valeur in data.items():
            setattr(instance, champ, valeur)
        if mdp:
            instance.set_password(mdp)
        instance.save()
        return instance


class PersonnelViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.RetrieveModelMixin,
                       mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Pas de suppression : on désactive un compte (is_active=false) pour garder l'historique."""

    queryset = Utilisateur.objects.all()
    serializer_class = PersonnelSerializer
    permission_classes = [AbonnementValide, permission("utilisateurs.gerer")]

    def get_queryset(self):
        qs = super().get_queryset()
        if role := self.request.query_params.get("role"):
            qs = qs.filter(role=role)
        return qs
