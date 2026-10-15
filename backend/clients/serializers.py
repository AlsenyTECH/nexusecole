from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from . import services
from .models import Ecole, Facture, Forfait, Module


class ForfaitSerializer(serializers.ModelSerializer):
    modules = serializers.ListField(child=serializers.ChoiceField(choices=Module.choices))

    class Meta:
        model = Forfait
        fields = ["id", "code", "nom", "prix_mensuel", "max_eleves", "quota_sms_mensuel", "modules", "actif"]


class EcoleSerializer(serializers.ModelSerializer):
    forfait = serializers.SlugRelatedField(slug_field="code", queryset=Forfait.objects.all(), allow_null=True)
    domaine = serializers.SerializerMethodField()
    modules_actifs = serializers.SerializerMethodField()
    modules_supplementaires = serializers.ListField(
        child=serializers.ChoiceField(choices=Module.choices), required=False
    )

    class Meta:
        model = Ecole
        fields = [
            "id", "nom", "schema_name", "domaine", "type_etablissement", "ville", "telephone", "email",
            "logo_url", "couleur_primaire", "couleur_secondaire", "statut", "forfait",
            "modules_supplementaires", "modules_actifs", "hebergement", "fin_essai", "cree_le",
        ]
        read_only_fields = ["schema_name", "cree_le"]

    def get_domaine(self, ecole):
        d = ecole.domains.filter(is_primary=True).first()
        return d.domain if d else None

    def get_modules_actifs(self, ecole):
        return ecole.modules_actifs()


class DirecteurSerializer(serializers.Serializer):
    email = serializers.EmailField()
    mot_de_passe = serializers.CharField(write_only=True)
    prenom = serializers.CharField(required=False, allow_blank=True)
    nom = serializers.CharField(required=False, allow_blank=True)
    telephone = serializers.CharField(required=False, allow_blank=True)

    def validate_mot_de_passe(self, value):
        validate_password(value)
        return value


class CreationEcoleSerializer(serializers.Serializer):
    nom = serializers.CharField(max_length=150)
    sous_domaine = serializers.CharField(max_length=40)
    forfait = serializers.SlugRelatedField(slug_field="code", queryset=Forfait.objects.filter(actif=True))
    type_etablissement = serializers.ChoiceField(choices=Ecole.Type.choices, default=Ecole.Type.PRIVE_LAIC)
    ville = serializers.CharField(required=False, allow_blank=True, default="")
    telephone = serializers.CharField(required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    couleur_primaire = serializers.RegexField(r"^#[0-9A-Fa-f]{6}$", required=False, default="#0F766E")
    couleur_secondaire = serializers.RegexField(r"^#[0-9A-Fa-f]{6}$", required=False, default="#F59E0B")
    jours_essai = serializers.IntegerField(min_value=0, max_value=90, default=30)
    directeur = DirecteurSerializer()

    def validate_sous_domaine(self, value):
        try:
            return services.valider_sous_domaine(value)
        except DjangoValidationError as e:
            raise serializers.ValidationError(e.messages)

    def create(self, data):
        return services.creer_ecole(**data)


class FactureSerializer(serializers.ModelSerializer):
    ecole_nom = serializers.CharField(source="ecole.nom", read_only=True)

    class Meta:
        model = Facture
        fields = [
            "id", "numero", "ecole", "ecole_nom", "libelle", "montant", "emise_le", "echeance",
            "statut", "payee_le", "moyen_paiement", "reference_paiement",
        ]
        read_only_fields = ["numero", "emise_le", "statut", "payee_le", "moyen_paiement", "reference_paiement"]


class PaiementSerializer(serializers.Serializer):
    moyen = serializers.ChoiceField(choices=Facture.Moyen.choices)
    reference = serializers.CharField(required=False, allow_blank=True, default="")


class EmissionFactureSerializer(serializers.Serializer):
    mois = serializers.IntegerField(min_value=1, max_value=12, default=1)
