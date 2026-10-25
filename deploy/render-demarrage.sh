#!/bin/sh
# Démarrage du service sur Render : migrations (toutes les écoles), compte super-admin,
# école de démonstration si demandée, puis l'API (qui sert aussi l'interface).
set -e
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL manquant : collez l'adresse de connexion Neon dans Environment" >&2; exit 1
fi
if [ "${DONNEES_DEMO:-false}" = "true" ] && { [ -z "${SUPERADMIN_EMAIL:-}" ] || [ -z "${SUPERADMIN_PASSWORD:-}" ]; }; then
  echo "SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD sont requis (Environment)" >&2; exit 1
fi
python manage.py migrate_schemas --noinput
if [ -n "${SUPERADMIN_EMAIL:-}" ] && [ -n "${SUPERADMIN_PASSWORD:-}" ]; then
  python manage.py init_plateforme --email "$SUPERADMIN_EMAIL"
fi
if [ "${DONNEES_DEMO:-false}" = "true" ]; then
  python manage.py demarrage_dev
fi
exec gunicorn config.wsgi --bind "0.0.0.0:${PORT:-8000}" --workers "${GUNICORN_WORKERS:-2}" --timeout 120 --access-logfile -
