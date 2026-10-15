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
]

INSTALLED_APPS = SHARED_APPS + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = "clients.Ecole"
TENANT_DOMAIN_MODEL = "clients.Domaine"
PUBLIC_SCHEMA_URLCONF = "config.urls_public"
ROOT_URLCONF = "config.urls_tenant"
SHOW_PUBLIC_IF_NO_TENANT_FOUND = False

AUTH_USER_MODEL = "comptes.Utilisateur"

MIDDLEWARE = [
    # Doit rester en premier : résout le sous-domaine → schéma de l'école
    "django_tenants.middleware.main.TenantMainMiddleware",
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
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"connexion": os.environ.get("THROTTLE_CONNEXION", "10/min")},
}

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
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
