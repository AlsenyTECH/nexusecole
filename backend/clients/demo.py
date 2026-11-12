"""Données de démonstration réalistes pour l'école de démo (développement uniquement)."""
from datetime import date, timedelta

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


MATIERES_COLLEGE = [("Mathématiques", 4), ("Français", 4), ("Anglais", 2), ("Sciences de la vie et de la Terre", 2),
                    ("Histoire-Géographie", 2), ("Éducation physique", 1)]
MATIERES_CM2 = [("Calcul", 3), ("Français", 3), ("Éveil scientifique", 2)]
ENSEIGNANTS = [("prof@lycee-demo.sn", "Rokhaya", "Ndiaye"), ("prof.francais@lycee-demo.sn", "Alioune", "Badiane"),
               ("prof.anglais@lycee-demo.sn", "Fatou", "Camara")]


def remplir_pedagogie(ecole):
    """Matières, cours, enseignants, surveillant, trimestres, notes et absences de démo (idempotent)."""
    import random

    from pedagogie import services
    from pedagogie.models import Cours, Evaluation, Matiere, Periode, Surveillance

    with schema_context(ecole.schema_name):
        annee = AnneeScolaire.objects.filter(active=True).first()
        if not annee or Matiere.objects.exists():
            return False
        profs = []
        for email, prenom, nom in ENSEIGNANTS:
            u = Utilisateur.objects.filter(email=email).first() or Utilisateur.objects.create_user(
                email, "Demo-Nexus-2026", prenom=prenom, nom=nom, role=Role.ENSEIGNANT)
            profs.append(u)
        surv = Utilisateur.objects.filter(email="surveillant@lycee-demo.sn").first() or Utilisateur.objects.create_user(
            "surveillant@lycee-demo.sn", "Demo-Nexus-2026", prenom="Lamine", nom="Sène", role=Role.SURVEILLANT)

        for classe in Classe.objects.filter(annee=annee):
            primaire = classe.niveau in ("CI", "CP", "CE1", "CE2", "CM1", "CM2")
            if primaire and classe.bareme != 10:
                classe.bareme = 10
                classe.save(update_fields=["bareme"])
            for k, (nom, coef) in enumerate(MATIERES_CM2 if primaire else MATIERES_COLLEGE):
                Cours.objects.create(classe=classe, matiere=Matiere.objects.get_or_create(nom=nom)[0], coefficient=coef,
                                     enseignant=profs[0] if k == 0 else profs[1] if "Français" in nom else profs[2] if k == 2 else None)
            if classe.niveau in ("6e", "5e"):
                Surveillance.objects.create(classe=classe, surveillant=surv)

        n = 3
        duree = (annee.fin - annee.debut).days + 1
        for i in range(n):
            debut = annee.debut + timedelta(days=duree * i // n)
            fin = annee.fin if i == n - 1 else annee.debut + timedelta(days=duree * (i + 1) // n - 1)
            Periode.objects.create(annee=annee, ordre=i + 1, debut=debut, fin=fin, nom=f"{'1er' if i == 0 else f'{i + 1}e'} trimestre")
        t1 = Periode.objects.get(annee=annee, ordre=1)

        # Notes du 1er trimestre pour la 6e A (tirage reproductible)
        hasard = random.Random(2026)
        directeur = Utilisateur.objects.filter(role=Role.DIRECTEUR).first()
        jour = min(timezone.localdate(), t1.fin)
        for cours in Cours.objects.filter(classe__nom="6e A").select_related("classe"):
            for titre, type_ in (("Devoir n°1", "devoir"), ("Devoir n°2", "devoir")):
                ev = Evaluation.objects.create(cours=cours, periode=t1, type=type_, titre=titre, date=jour, sur=20,
                                               creee_par=cours.enseignant or directeur)
                saisies = [{"inscription": i.pk, "valeur": round(min(20, max(3, hasard.gauss(12, 3.5))) * 4) / 4}
                           for i in Inscription.objects.filter(classe=cours.classe)]
                services.enregistrer_notes(ev, saisies, directeur)

        from pedagogie.models import Absence
        for k, insc in enumerate(Inscription.objects.filter(classe__nom__in=["6e A", "5e A"])[:4]):
            Absence.objects.create(inscription=insc, date=jour, creneau="matin", type="absence" if k % 2 == 0 else "retard",
                                   saisie_par=surv)
        return True


def remplir_familles(ecole):
    """Parents, tuteur avec accès à l'application, fiches des enseignants, emploi du temps (idempotent)."""
    from datetime import time

    from pedagogie.models import Cours, Creneau, Evaluation, Matiere, Periode, ProfilEnseignant
    from scolarite.models import LienResponsable, Responsable
    from scolarite.services import creer_acces

    with schema_context(ecole.schema_name):
        annee = AnneeScolaire.objects.filter(active=True).first()
        if not annee or Responsable.objects.exists() or not Matiere.objects.exists():
            return False

        # Un parent par élève (le père, avec le numéro déjà connu), la mère pour quelques-uns
        for i, eleve in enumerate(Eleve.objects.order_by("matricule")):
            pere = Responsable.objects.create(prenom=["Mamadou", "Ibrahima", "Cheikh", "Abdoulaye"][i % 4], nom=eleve.nom,
                                              telephone=eleve.telephone_parent or f"77 000 00 {i:02d}", profession="Commerçant")
            LienResponsable.objects.create(eleve=eleve, responsable=pere, lien="pere", contact_principal=True)
            if i % 3 == 0:
                mere = Responsable.objects.create(prenom=["Mame Diarra", "Astou", "Bineta"][i % 3], nom=eleve.nom,
                                                  telephone=f"76 {200 + i} 45 {10 + i:02d}", profession="Enseignante")
                LienResponsable.objects.create(eleve=eleve, responsable=mere, lien="mere")

        # Compte de démo « parent » : la mère d'Aminata Ndiaye (6e A), aussi tutrice légale de Babacar Ndour (CM2 A)
        aminata = Eleve.objects.filter(prenom="Aminata", nom="Ndiaye").first()
        babacar = Eleve.objects.filter(prenom="Babacar", nom="Ndour").first()
        if aminata:
            maman = LienResponsable.objects.filter(eleve=aminata, lien="mere").first()
            maman = maman.responsable if maman else Responsable.objects.create(prenom="Mame Diarra", nom="Ndiaye", telephone="76 200 45 10")
            if not LienResponsable.objects.filter(eleve=aminata, responsable=maman).exists():
                LienResponsable.objects.create(eleve=aminata, responsable=maman, lien="mere")
            if babacar:
                LienResponsable.objects.create(eleve=babacar, responsable=maman, lien="tuteur")
            creer_acces(maman, "parent@lycee-demo.sn", "Demo-Nexus-2026")

        # Fiches des enseignants
        maths, francais = Matiere.objects.filter(nom="Mathématiques").first(), Matiere.objects.filter(nom="Français").first()
        anglais = Matiere.objects.filter(nom="Anglais").first()
        for email, statut, matiere, diplome in (("prof@lycee-demo.sn", "permanent", maths, "CAES de mathématiques"),
                                                ("prof.francais@lycee-demo.sn", "permanent", francais, "CAES de lettres"),
                                                ("prof.anglais@lycee-demo.sn", "vacataire", anglais, "Licence d'anglais")):
            u = Utilisateur.objects.filter(email=email).first()
            if u:
                profil, _ = ProfilEnseignant.objects.get_or_create(utilisateur=u, defaults={"statut": statut, "diplome": diplome})
                if matiere:
                    profil.matieres.add(matiere)

        # Emploi du temps : chaque cours, deux heures par semaine, sans chevauchement de classe ni d'enseignant
        plages = [(time(8), time(10)), (time(10, 15), time(12, 15)), (time(15), time(17))]
        occupe = set()
        for classe in Classe.objects.filter(annee=annee).order_by("niveau", "nom"):
            for k, cours in enumerate(Cours.objects.filter(classe=classe).order_by("-coefficient", "matiere__nom")):
                for n in range(15):
                    jour, (debut, fin) = (n + k * 2) % 5 + 1, plages[(n + k) % 3]
                    cles = {("classe", classe.pk, jour, debut)} | ({("prof", cours.enseignant_id, jour, debut)} if cours.enseignant_id else set())
                    if not cles & occupe:
                        occupe |= cles
                        Creneau.objects.create(cours=cours, jour=jour, debut=debut, fin=fin, salle=f"S{classe.pk}")
                        break

        # Une composition à venir en 6e A (visible dans l'espace famille)
        cours = Cours.objects.filter(classe__nom="6e A", matiere=maths).first()
        t1 = Periode.objects.filter(annee=annee, ordre=1).first()
        if cours and t1:
            Evaluation.objects.create(cours=cours, periode=t1, type="composition", titre="Composition du 1er trimestre",
                                      date=timezone.localdate() + timedelta(days=10), sur=20, creee_par=cours.enseignant)
        return True


# Heures par semaine, découpage en séances, matière lourde, salle spécialisée
VOLUMES = {"Mathématiques": (5, "2+2+1", True, None), "Français": (5, "2+2+1", True, None), "Anglais": (3, "", False, None),
           "Sciences de la vie et de la Terre": (2, "2", True, "Laboratoire"), "Histoire-Géographie": (3, "2+1", False, None),
           "Éducation physique": (2, "2", False, "Terrain de sport"), "Calcul": (5, "2+2+1", True, None),
           "Éveil scientifique": (2, "1+1", False, None)}


def remplir_edt(ecole):
    """Données du générateur d'emplois du temps : volumes, salles spécialisées, disponibilités (idempotent)."""
    from pedagogie.models import Cours, Disponibilite, GrilleHoraire, Matiere, SalleSpecialisee

    with schema_context(ecole.schema_name):
        if SalleSpecialisee.objects.exists() or not Matiere.objects.exists():
            return False
        GrilleHoraire.actuelle()
        salles = {nom: SalleSpecialisee.objects.create(nom=nom, nombre=1) for nom in ("Laboratoire", "Terrain de sport")}
        for matiere in Matiere.objects.all():
            volume, decoupage, lourde, salle = VOLUMES.get(matiere.nom, (2, "", False, None))
            matiere.lourde, matiere.salle = lourde, salles.get(salle)
            matiere.save(update_fields=["lourde", "salle"])
            Cours.objects.filter(matiere=matiere, volume_horaire__isnull=True).update(volume_horaire=volume, decoupage=decoupage)
        # La professeure d'anglais est vacataire : elle enseigne ailleurs le lundi et le mardi
        vacataire = Utilisateur.objects.filter(email="prof.anglais@lycee-demo.sn").first()
        if vacataire:
            Disponibilite.objects.create(enseignant=vacataire, indispo=[[j, i] for j in (1, 2) for i in range(7)],
                                         valide_le=timezone.now())
        # Le professeur de maths propose de garder le mercredi matin libre (à valider par la direction)
        maths = Utilisateur.objects.filter(email="prof@lycee-demo.sn").first()
        if maths:
            Disponibilite.objects.create(enseignant=maths, indispo_propose=[[3, i] for i in range(5)], prefere_propose=[],
                                         propose_le=timezone.now())
        return True


def remplir_carte(ecole):
    """Services à la carte, points de vente, recharges, ventes et activités de démonstration (idempotent)."""
    from activites import services as billetterie
    from activites.models import Activite
    from carte import services as cartes
    from carte.models import Article, Mouvement, PointDeVente, Vente
    from finances.models import Caisse
    from finances.services import souscrire

    with schema_context(ecole.schema_name):
        annee = AnneeScolaire.objects.filter(active=True).first()
        if not annee or PointDeVente.objects.exists():
            return False
        debut = date(annee.debut.year, 10, 5)
        transport = Frais.objects.create(annee=annee, libelle="Transport – zone 1", categorie="transport", montant=10_000,
                                         periodicite="mensuel", nombre_echeances=10, premiere_echeance=debut, obligatoire=False)
        Frais.objects.create(annee=annee, libelle="Transport – zone 2", categorie="transport", montant=15_000,
                             periodicite="mensuel", nombre_echeances=10, premiere_echeance=debut, obligatoire=False)
        cantine = Frais.objects.create(annee=annee, libelle="Cantine (forfait mensuel)", categorie="cantine", montant=12_500,
                                       periodicite="mensuel", nombre_echeances=10, premiere_echeance=debut, obligatoire=False)
        Frais.objects.create(annee=annee, libelle="Études surveillées", categorie="etudes", montant=7_500,
                             periodicite="mensuel", nombre_echeances=9, premiere_echeance=debut, obligatoire=False,
                             niveaux=["3e"])
        directeur = Utilisateur.objects.filter(role=Role.DIRECTEUR).first()
        caissier = Utilisateur.objects.filter(email="caisse@lycee-demo.sn").first() or directeur
        inscriptions = list(Inscription.objects.filter(annee=annee).select_related("eleve", "classe").order_by("eleve__matricule"))
        for i, insc in enumerate(inscriptions):
            if i % 3 == 0:
                souscrire(insc, transport, par=directeur)
            if i % 2 == 0:
                souscrire(insc, cantine, par=directeur)

        ecole_caisse = Caisse.de_l_ecole()
        pdv = PointDeVente.objects.create(nom="Cantine", caisse=ecole_caisse)
        repas = Article.objects.create(point_de_vente=pdv, nom="Repas du midi", prix=500)
        Article.objects.create(point_de_vente=pdv, nom="Petit-déjeuner", prix=300)
        jus = Article.objects.create(point_de_vente=pdv, nom="Jus de bissap", prix=200)
        boutique = PointDeVente.objects.create(nom="Boutique (uniformes)", caisse=ecole_caisse)
        for nom, prix in (("Chemise de l'école", 4_000), ("Pantalon / jupe", 5_000), ("Tenue de sport", 6_000), ("Cravate", 1_500)):
            Article.objects.create(point_de_vente=boutique, nom=nom, prix=prix)

        # Recharges et quelques achats à la cantine
        for i, insc in enumerate(inscriptions[:10]):
            cartes.crediter(insc.eleve, [5_000, 2_500, 10_000][i % 3], libelle="Recharge au guichet", par=caissier,
                            moyen=["especes", "wave", "orange_money"][i % 3], reference="" if i % 3 == 0 else f"TX-DEMO-{i:03d}")
            if i % 2 == 0:
                m = cartes.debiter(insc.eleve, repas.prix + jus.prix, type_=Mouvement.Type.ACHAT,
                                   libelle="Cantine : Repas du midi, Jus de bissap", reference=f"pdv-{pdv.pk}", par=caissier, caisse=ecole_caisse)
                Vente.objects.create(point_de_vente=pdv, eleve=insc.eleve, montant=m.montant * -1, mouvement=m, par=caissier,
                                     lignes=[{"article": repas.pk, "nom": repas.nom, "prix": repas.prix, "quantite": 1},
                                             {"article": jus.pk, "nom": jus.nom, "prix": jus.prix, "quantite": 1}])

        # Activités : recettes au foyer des élèves (hors comptabilité de l'école)
        foyer = Caisse.objects.filter(code="foyer").first() or Caisse.objects.create(nom="Foyer des élèves", comptabilisee=False, code="foyer")
        soiree = Activite.objects.create(titre="Soirée culturelle de fin de trimestre", date=timezone.localdate() + timedelta(days=12),
                                         lieu="Cour de l'école", prix=1_000, places=200, caisse=foyer, cree_par=directeur,
                                         description="Théâtre, danse et chants préparés par les élèves.")
        Activite.objects.create(titre="Tournoi de football inter-classes", date=timezone.localdate() + timedelta(days=5),
                                lieu="Terrain municipal", prix=500, caisse=foyer, cree_par=directeur, niveaux=["4e", "3e"])
        for insc in inscriptions[:4]:
            billetterie.vendre(soiree, par=caissier, eleve=insc.eleve, moyen="portefeuille")
        return True
