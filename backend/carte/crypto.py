"""
Signature des QR codes (cartes, tickets) : Ed25519, une clé par école dérivée par HKDF du secret
serveur — même principe que les bulletins, avec un autre sel pour que les clés soient distinctes.

Format : NXC1.<école>.<numéro>.<version>.<signature>   (carte)
         NXT1.<école>.<code>.<signature>               (ticket d'un visiteur sans carte)
La signature (base64url) couvre tout ce qui la précède : impossible de fabriquer un QR valide
sans la clé, même en connaissant des numéros de cartes.
"""
import base64

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings
from django.db import connection


def _cle():
    secret = getattr(settings, "BULLETIN_SIGNING_SECRET", settings.SECRET_KEY).encode()
    graine = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"nexusecole-cartes-v1",
                  info=connection.schema_name.encode()).derive(secret)
    return Ed25519PrivateKey.from_private_bytes(graine)


def _b64(octets):
    return base64.urlsafe_b64encode(octets).rstrip(b"=").decode()


def _deb64(texte):
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


def signer(*champs):
    corps = ".".join(str(c) for c in champs)
    return f"{corps}.{_b64(_cle().sign(corps.encode()))}"


def lire(texte):
    """Renvoie les champs d'un QR signé de cette école, ou None (mal formé, autre école, signature fausse)."""
    morceaux = (texte or "").strip().split(".")
    if len(morceaux) < 3 or morceaux[1] != connection.schema_name:
        return None
    corps, signature = ".".join(morceaux[:-1]), morceaux[-1]
    try:
        _cle().public_key().verify(_deb64(signature), corps.encode())
    except (InvalidSignature, ValueError):
        return None
    return morceaux[:-1]
