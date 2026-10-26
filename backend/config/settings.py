"""
Configuration NexusEcole.

Architecture multi-tenant « un schéma PostgreSQL par école » (django-tenants) :
- schéma `public`  : écoles, domaines, forfaits, abonnements, factures, super-admins
- un schéma/école  : utilisateurs de l'école, élèves, classes, notes…
"""
import os
from datetime import timedelta
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me-0123456789abcdef")
DEBUG = env_bool("DEBUG", True)

# Domaine racine : chaque école est servie sur <sous-domaine>.<BASE_DOMAIN>
BASE_DOMAIN = os.environ.get("BASE_DOMAIN", "localhost")
# Domaine de la console super-admin (schéma public)
PUBLIC_DOMAIN = os.environ.get("PUBLIC_DOMAIN", f"admin.{BASE_DOMAIN}")
# Sous-domaines interdits aux écoles
# Hébergement gratuit à adresse unique : l'école est indiquée par l'en-tête X-Ecole (voir config/ecole_middleware.py)
ECOLE_PAR_EN_TETE = env_bool("ECOLE_PAR_EN_TETE", False)
# Dossier de l'interface compilée, servie par Django quand aucun serveur web n'est devant (Render)
FRONTEND_DIST = os.environ.get("FRONTEND_DIST", "")
RESERVED_SUBDOMAINS = {"admin", "www", "api", "public", "app", "static", "mail"}

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", f".{BASE_DOMAIN},{BASE_DOMAIN},testserver")

if not DEBUG and SECRET_KEY.startswith("dev-"):
    raise RuntimeError("SECRET_KEY doit être défini en production")

# --------------------------------------------------------------------------- #
# Applications
# --------------------------------------------------------------------------- #
SHARED_APPS = [
    "django_tenants",
    "clients",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "comptes",
    "rest_framework",
    "corsheaders",
]

TENANT_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "comptes",
    "scolarite",
    "finances",
    "pedagogie",
]

INSTALLED_APPS = SHARED_APPS + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = "clients.Ecole"
TENANT_DOMAIN_MODEL = "clients.Domaine"
PUBLIC_SCHEMA_URLCONF = "config.urls_public"
ROOT_URLCONF = "config.urls_tenant"
SHOW_PUBLIC_IF_NO_TENANT_FOUND = False

AUTH_USER_MODEL = "comptes.Utilisateur"

MIDDLEWARE = [
    # Interface React (seulement si FRONTEND_DIST est défini : hébergement à service unique)
    "config.spa.InterfaceMiddleware",
    # Sonde de santé de l'hébergeur (aucune école à résoudre)
    "config.sante.SantePlateformeMiddleware",
    # Avant tout : réponse interne à Caddy (certificats HTTPS), indépendante de l'école
    "config.tls.AutorisationTLSMiddleware",
    # Résout l'école (sous-domaine, ou en-tête X-Ecole en mode « chemin ») → schéma PostgreSQL
    "config.ecole_middleware.EcoleMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"

# --------------------------------------------------------------------------- #
# Base de données
# --------------------------------------------------------------------------- #
DATABASES = {
    "default": dj_database_url.parse(
        os.environ.get("DATABASE_URL", "postgres://nexus:nexus@localhost:5432/nexusecole"),
        engine="django_tenants.postgresql_backend",
        conn_max_age=60,
        # Les bases hébergées (Neon…) coupent les connexions inactives : on vérifie avant réutilisation
        conn_health_checks=True,
    )
}
DATABASE_ROUTERS = ("django_tenants.routers.TenantSyncRouter",)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["comptes.authentication.TenantJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PAGINATION_CLASS": "config.pagination.Pagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "connexion": os.environ.get("THROTTLE_CONNEXION", "10/min"),
        "verification": "30/min",
    },
}

# Secret dont dérivent les clés Ed25519 de signature des bulletins (une par école)
BULLETIN_SIGNING_SECRET = os.environ.get("BULLETIN_SIGNING_SECRET", SECRET_KEY)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "UPDATE_LAST_LOGIN": True,
    "SIGNING_KEY": os.environ.get("JWT_SIGNING_KEY", SECRET_KEY),
}

# CORS : le front est servi sur les mêmes sous-domaines ; on autorise *.BASE_DOMAIN
CORS_ALLOWED_ORIGIN_REGEXES = [
    rf"^https?://([a-z0-9-]+\.)?{BASE_DOMAIN.replace('.', r'\.')}(:\d+)?$",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr"
TIME_ZONE = "Africa/Dakar"
USE_I18N = True
USE_TZ = True

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    # La redirection HTTP → HTTPS est faite par Caddy, en façade
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": os.environ.get("LOG_LEVEL", "INFO")},
}
