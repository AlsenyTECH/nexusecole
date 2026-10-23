"""Données de démonstration réalistes pour l'école de démo (développement uniquement)."""
from datetime import date

from django.utils import timezone
from django_tenants.utils import schema_context

from comptes.models import Role, Utilisateur
from finances.models import Frais
from finances.services import encaisser, generer_echeances
from scolarite.models import AnneeScolaire, Classe, Eleve, Inscription

ELEVES = [
    ("Aminata", "Ndiaye", "F", "6e A"), ("Cheikh", "Mbaye", "M", "6e A"), ("Fatou", "Sow", "F", "6e A"),
    ("Moussa", "Diop", "M", "6e A"), ("Awa", "Fall", "F", "5e A"), ("Ibrahima", "Sarr", "M", "5e A"),
    ("Khady", "Ba", "F", "5e A"), ("Ousmane", "Diallo", "M", "4e A"), ("Mariama", "Cissé", "F", "4e A"),
    ("Pape", "Gueye", "M", "4e A"), ("Ndeye", "Faye", "F", "3e A"), ("Mamadou", "Kane", "M", "3e A"),
    ("Coumba", "Thiam", "F", "3e A"), ("Abdou", "Seck", "M", "CM2 A"), ("Seynabou", "Diouf", "F", "CM2 A"),
    ("Babacar", "Ndour", "M", "CM2 A"),
]
# Ce que chaque famille a déjà payé (en FCFA), dans l'ordre de la liste ci-dessus
PAYE = [50_000, 30_000, 50_000, 0, 30_000, 50_000, 70_000, 30_000, 0, 50_000, 30_000, 50_000, 15_000, 45_000, 30_000, 0]


def remplir(ecole):
    with schema_context(ecole.schema_name):
        if AnneeScolaire.objects.exists():
            return False
        an = timezone.localdate().year if timezone.localdate().month >= 8 else timezone.localdate().year - 1
        annee = AnneeScolaire.objects.create(libelle=f"{an}-{an + 1}", debut=date(an, 10, 1), fin=date(an + 1, 7, 31), active=True)
        classes = {}
        for nom, niveau in (("CM2 A", "CM2"), ("6e A", "6e"), ("5e A", "5e"), ("4e A", "4e"), ("3e A", "3e")):
            classes[nom] = Classe.objects.create(annee=annee, nom=nom, niveau=niveau)

        debut = date(an, 10, 5)
        Frais.objects.create(annee=annee, libelle="Frais d'inscription", categorie="inscription", montant=30_000, premiere_echeance=debut)
        Frais.objects.create(annee=annee, libelle="Mensualité collège", categorie="scolarite", montant=20_000,
                             periodicite="mensuel", nombre_echeances=10, premiere_echeance=debut, niveaux=["6e", "5e", "4e", "3e"])
        Frais.objects.create(annee=annee, libelle="Mensualité élémentaire", categorie="scolarite", montant=15_000,
                             periodicite="mensuel", nombre_echeances=10, premiere_echeance=debut, niveaux=["CM2"])
        Frais.objects.create(annee=annee, libelle="Tenue scolaire", categorie="tenue", montant=12_000, premiere_echeance=date(an, 11, 15))

        caissier = Utilisateur.objects.filter(email="caisse@lycee-demo.sn").first() or Utilisateur.objects.create_user(
            "caisse@lycee-demo.sn", "Demo-Nexus-2026", prenom="Moustapha", nom="Sy", role=Role.COMPTABLE)
        if not Utilisateur.objects.filter(email="prof@lycee-demo.sn").exists():
            Utilisateur.objects.create_user("prof@lycee-demo.sn", "Demo-Nexus-2026", prenom="Rokhaya", nom="Ndiaye",
                                            role=Role.ENSEIGNANT)

        for i, ((prenom, nom, sexe, classe), paye) in enumerate(zip(ELEVES, PAYE), start=1):
            eleve = Eleve.objects.create(matricule=f"{an}-{i:03d}", prenom=prenom, nom=nom, sexe=sexe,
                                         telephone_parent=f"77 {100 + i * 7} {10 + i:02d} {20 + i:02d}", classe=classes[classe])
            insc = Inscription.objects.create(eleve=eleve, classe=classes[classe],
                                              reduction_pct=50 if i == 7 else 0, motif_reduction="Fratrie" if i == 7 else "")
            generer_echeances(insc)
            if paye:
                moyen = ["especes", "wave", "orange_money"][i % 3]
                encaisser(insc, montant=paye, moyen=moyen, reference="" if moyen == "especes" else f"TX{i:05d}", encaisse_par=caissier)
        return True
