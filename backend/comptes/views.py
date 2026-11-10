from django.contrib.auth.password_validation import validate_password
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .authentication import ConnexionSerializer, RafraichissementSerializer
from .droits import CATALOGUE, PERMISSIONS, ROLES_TOUS_DROITS
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


class MonCompteSerializer(serializers.Serializer):
    """Modifier son propre compte : identifiant, nom, téléphone, mot de passe (le mot de passe actuel est exigé)."""

    email = serializers.CharField(required=False, max_length=254)
    prenom = serializers.CharField(required=False, allow_blank=True, max_length=80)
    nom = serializers.CharField(required=False, allow_blank=True, max_length=80)
    telephone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    mot_de_passe_actuel = serializers.CharField(write_only=True)
    nouveau_mot_de_passe = serializers.CharField(write_only=True, required=False, allow_blank=True)

    def validate(self, attrs):
        import re

        user = self.context["request"].user
        if not user.check_password(attrs["mot_de_passe_actuel"]):
            raise ValidationError({"mot_de_passe_actuel": "Mot de passe actuel incorrect."})
        if "email" in attrs:
            email = attrs["email"].strip().lower()
            # Identifiant de connexion : une forme nom@domaine suffit (pas forcément une adresse qui reçoit du courrier)
            if not re.fullmatch(r"[^@\s]+@[^@\s]+", email):
                raise ValidationError({"email": "Identifiant invalide : il doit avoir la forme nom@domaine."})
            if Utilisateur.objects.filter(email=email).exclude(pk=user.pk).exists():
                raise ValidationError({"email": "Cet identifiant est déjà utilisé par un autre compte."})
            attrs["email"] = email
        if attrs.get("nouveau_mot_de_passe"):
            validate_password(attrs["nouveau_mot_de_passe"], user)
        return attrs


class MoiView(APIView):
    def patch(self, request):
        s = MonCompteSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        user, d = request.user, s.validated_data
        for champ in ("email", "prenom", "nom", "telephone"):
            if champ in d:
                setattr(user, champ, d[champ])
        if d.get("nouveau_mot_de_passe"):
            user.set_password(d["nouveau_mot_de_passe"])
        user.save()
        if user.role == Role.PARENT and "email" in d:  # parent : garder sa fiche de responsable à jour
            from scolarite.models import Responsable

            Responsable.objects.filter(utilisateur=user).update(email=user.email)
        return self.get(request)

    def get(self, request):
        data = UtilisateurSerializer(request.user).data
        data["role_nom"] = request.user.role_ecole.nom if request.user.role_ecole_id else request.user.get_role_display()
        if getattr(request, "tenant", None) and not request.tenant.est_public:
            data["permissions"] = sorted(request.user.permissions_ecole())
        return Response(data)


# --------------------------------------------------------------------------- #
# Rôles et droits (configurés par l'administrateur de l'école)
# --------------------------------------------------------------------------- #
def _peut_donner(demandeur, permissions):
    """On ne donne (à un rôle ou à une personne) que des droits qu'on a soi-même : pas d'élévation."""
    return set(permissions) <= demandeur.permissions_ecole()


class RoleSerializer(serializers.ModelSerializer):
    systeme = serializers.BooleanField(read_only=True)
    tous_droits = serializers.SerializerMethodField()
    nb_comptes = serializers.SerializerMethodField()

    class Meta:
        model = RoleEcole
        fields = ["id", "code", "nom", "description", "permissions", "systeme", "tous_droits", "nb_comptes"]
        read_only_fields = ["code"]

    def get_tous_droits(self, r):
        return r.code in ROLES_TOUS_DROITS

    def get_nb_comptes(self, r):
        return r.comptes.filter(is_active=True).count()

    def validate_nom(self, nom):
        nom = nom.strip()
        if RoleEcole.objects.filter(nom__iexact=nom).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise ValidationError("Un rôle porte déjà ce nom.")
        return nom

    def validate_permissions(self, demandees):
        if not isinstance(demandees, list) or not set(demandees) <= set(PERMISSIONS):
            raise ValidationError("Liste de droits invalide.")
        avant = set(self.instance.permissions) if self.instance else set()
        if not _peut_donner(self.context["request"].user, set(demandees) - avant):
            raise PermissionDenied("Vous ne pouvez donner que des droits que vous avez vous-même.")
        return sorted(set(demandees))

    def validate(self, attrs):
        if self.instance and self.instance.code in ROLES_TOUS_DROITS:
            raise ValidationError({"detail": "Le directeur a toujours tous les droits."})
        if self.instance and self.instance.systeme and "nom" in attrs and attrs["nom"] != self.instance.nom:
            raise ValidationError({"nom": "Le nom d'un rôle d'origine ne change pas."})
        return attrs

    def to_representation(self, r):
        data = super().to_representation(r)
        if r.code in ROLES_TOUS_DROITS:
            data["permissions"] = sorted(PERMISSIONS)
        return data


class LectureRoles(BasePermission):
    """Lire les rôles : pour les gérer, ou pour les attribuer (Personnel, Enseignants). Les modifier : roles.gerer."""

    message = "Vous n'avez pas le droit d'effectuer cette action."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return u.a_permission("roles.gerer") or u.a_permission("utilisateurs.gerer")
        return u.a_permission("roles.gerer")


class RoleViewSet(viewsets.ModelViewSet):
    """Rôles de l'école : ceux d'origine (modifiables, non supprimables) et ceux créés par l'école."""

    queryset = RoleEcole.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [AbonnementValide, LectureRoles]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    pagination_class = None

    def list(self, request, *args, **kwargs):
        catalogue = [{"code": c, "groupe": g, "libelle": l} for c, (g, l) in CATALOGUE.items()]
        return Response({"permissions": catalogue, "roles": self.get_serializer(self.get_queryset(), many=True).data})

    def perform_destroy(self, role):
        if role.systeme:
            raise ValidationError({"detail": "Un rôle d'origine ne se supprime pas."})
        if role.comptes.exists():
            raise ValidationError({"detail": "Ce rôle est attribué à des comptes : donnez-leur d'abord un autre rôle."})
        role.delete()


# --------------------------------------------------------------------------- #
# Comptes du personnel
# --------------------------------------------------------------------------- #
# Type de compte déduit du rôle : un rôle d'origine donne son type, un rôle créé par l'école
# donne « personnel » (ou « enseignant » quand le compte est créé depuis la page Enseignants).
TYPES_PERSONNEL = [Role.DIRECTEUR, Role.SECRETAIRE, Role.COMPTABLE, Role.SURVEILLANT, Role.PERSONNEL]


def role_origine(code):
    return RoleEcole.objects.filter(code=code).first()


class PersonnelSerializer(serializers.ModelSerializer):
    """Comptes du personnel (hors enseignants, gérés dans leur propre page)."""

    type_par_defaut = Role.PERSONNEL
    types_permis = TYPES_PERSONNEL

    mot_de_passe = serializers.CharField(write_only=True, required=False)
    role_ecole = serializers.PrimaryKeyRelatedField(queryset=RoleEcole.objects.all(), required=False)
    role_nom = serializers.CharField(source="role_ecole.nom", read_only=True, default="")

    class Meta:
        model = Utilisateur
        fields = ["id", "email", "prenom", "nom", "telephone", "role", "role_ecole", "role_nom", "is_active",
                  "mot_de_passe", "last_login"]
        read_only_fields = ["last_login"]
        extra_kwargs = {"role": {"required": False}}

    def validate_email(self, value):
        return value.lower()

    def _type_pour(self, role):
        if role.code:
            if role.code not in self.types_permis:
                raise ValidationError({"role_ecole": "Ce rôle ne convient pas à ce type de compte."})
            return role.code
        return self.type_par_defaut

    def validate(self, attrs):
        demandeur = self.context["request"].user
        # Compatibilité : un rôle d'origine peut être donné par son code (« role »)
        if "role_ecole" not in attrs and "role" in attrs:
            role = role_origine(attrs["role"])
            if role is None:
                raise ValidationError({"role": "Rôle inconnu."})
            attrs["role_ecole"] = role
        if self.instance is None and "role_ecole" not in attrs:
            raise ValidationError({"role_ecole": "Choisissez un rôle."})
        if "role_ecole" in attrs:
            attrs["role"] = self._type_pour(attrs["role_ecole"])
        if self.instance is not None and self.instance.pk == demandeur.pk:
            if attrs.get("role_ecole", self.instance.role_ecole) != self.instance.role_ecole or attrs.get("role", demandeur.role) != demandeur.role:
                raise ValidationError({"role": "Vous ne pouvez pas changer votre propre rôle."})
            if attrs.get("is_active") is False:
                raise ValidationError({"is_active": "Vous ne pouvez pas désactiver votre propre compte."})
        if self.instance is not None and attrs.get("is_active") is False:
            verifier_geste_sur_compte(demandeur, self.instance)
        if "role_ecole" in attrs and not _peut_donner(demandeur, attrs["role_ecole"].permissions):
            raise PermissionDenied("Ce rôle a des droits que vous n'avez pas : vous ne pouvez pas l'attribuer.")

        # Seul un directeur peut nommer (ou retirer) un directeur : pas d'élévation de privilèges.
        touche_directeur = attrs.get("role") == Role.DIRECTEUR or (
            self.instance is not None and self.instance.role == Role.DIRECTEUR
        )
        if touche_directeur and demandeur.role != Role.DIRECTEUR:
            raise PermissionDenied("Seul un directeur peut attribuer ou modifier le rôle de directeur.")
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
                       mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Suppression seulement d'un compte qui n'a jamais rien fait ; sinon on le bloque (is_active=false)."""

    queryset = Utilisateur.objects.filter(role__in=TYPES_PERSONNEL).select_related("role_ecole")
    serializer_class = PersonnelSerializer
    permission_classes = [AbonnementValide, permission("utilisateurs.gerer")]

    def get_queryset(self):
        qs = super().get_queryset()
        if role := self.request.query_params.get("role"):
            qs = qs.filter(role=role)
        return qs

    def perform_destroy(self, compte):
        supprimer_compte(self.request.user, compte)


# --------------------------------------------------------------------------- #
# Tous les comptes : bloquer / débloquer ; supprimer seulement un compte sans aucune opération
# --------------------------------------------------------------------------- #
def verifier_geste_sur_compte(demandeur, compte, bloquer=True):
    """Règles communes au blocage et à la suppression d'un compte."""
    if compte.pk == demandeur.pk:
        raise ValidationError({"detail": "Vous ne pouvez pas bloquer ou supprimer votre propre compte."})
    if compte.role == Role.DIRECTEUR:
        if demandeur.role != Role.DIRECTEUR:
            raise PermissionDenied("Seul un directeur peut bloquer ou supprimer un directeur.")
        if bloquer and not Utilisateur.objects.filter(role=Role.DIRECTEUR, is_active=True).exclude(pk=compte.pk).exists():
            raise ValidationError({"detail": "C'est le dernier directeur actif : l'école ne serait plus administrée."})


def supprimer_compte(demandeur, compte):
    """
    Un compte qui a effectué des opérations (encaissement, note, appel, vente…) est protégé par la base
    (clés étrangères PROTECT) : il se bloque, il ne se supprime pas, pour garder la trace de qui a fait quoi.
    """
    from django.db import transaction
    from django.db.models import ProtectedError, RestrictedError

    verifier_geste_sur_compte(demandeur, compte)
    try:
        with transaction.atomic():
            compte.delete()
    except (ProtectedError, RestrictedError):
        raise ValidationError({"detail": "Ce compte a effectué des opérations dans l'application : il ne peut pas être supprimé "
                                         "(traçabilité). Bloquez son accès à la place."})


class CompteSerializer(serializers.ModelSerializer):
    role_nom = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = ["id", "email", "prenom", "nom", "telephone", "role", "role_nom", "is_active", "last_login", "cree_le"]
        read_only_fields = ["email", "prenom", "nom", "telephone", "role", "last_login", "cree_le"]

    def get_role_nom(self, u):
        if u.role == Role.PARENT:
            return "Parent / tuteur"
        return u.role_ecole.nom if u.role_ecole_id else u.get_role_display()


class CompteViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Tous les comptes de l'école (personnel, enseignants, parents) : recherche, blocage, déblocage."""

    queryset = Utilisateur.objects.exclude(role=Role.SUPERADMIN).select_related("role_ecole").order_by("nom", "prenom")
    serializer_class = CompteSerializer
    permission_classes = [AbonnementValide, permission("utilisateurs.gerer")]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        from django.db.models import Q

        qs = super().get_queryset()
        if q := self.request.query_params.get("q"):
            qs = qs.filter(Q(nom__icontains=q) | Q(prenom__icontains=q) | Q(email__icontains=q) | Q(telephone__icontains=q))
        if role := self.request.query_params.get("role"):
            qs = qs.filter(role=role)
        if self.request.query_params.get("bloques") == "1":
            qs = qs.filter(is_active=False)
        return qs

    def perform_update(self, serializer):
        actif = serializer.validated_data.get("is_active")
        if actif is not None:
            verifier_geste_sur_compte(self.request.user, serializer.instance, bloquer=not actif)
        serializer.save()
