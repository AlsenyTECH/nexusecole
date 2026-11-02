from django.apps import AppConfig


class CarteConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "carte"
    verbose_name = "Carte scolaire et porte-monnaie"

    def ready(self):
        from . import signals  # noqa: F401
