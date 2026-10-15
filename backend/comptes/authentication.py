"""
Authentification JWT liée à l'école.

Risque traité : chaque schéma a sa propre table d'utilisateurs, donc l'utilisateur
id=1 existe dans TOUTES les écoles. Un JWT standard (qui ne contient que user_id)
émis par l'école A serait accepté par l'école B et y authentifierait… l'utilisateur
id=1 de B. On ajoute donc la claim `schema` à chaque jeton et on la vérifie
à chaque requête et à chaque rafraîchissement.
"""
from django.db import connection
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer, TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

SCHEMA_CLAIM = "schema"


def verifier_schema(token):
    if token.get(SCHEMA_CLAIM) != connection.schema_name:
        raise InvalidToken("Jeton émis pour un autre établissement")


class TenantJWTAuthentication(JWTAuthentication):
    def get_validated_token(self, raw_token):
        token = super().get_validated_token(raw_token)
        verifier_schema(token)
        return token


class ConnexionSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token[SCHEMA_CLAIM] = connection.schema_name
        token["role"] = user.role
        return token


class RafraichissementSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        verifier_schema(RefreshToken(attrs["refresh"]))
        return super().validate(attrs)
