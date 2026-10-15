from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .authentication import ConnexionSerializer, RafraichissementSerializer
from .models import Utilisateur


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
        return Response(UtilisateurSerializer(request.user).data)
