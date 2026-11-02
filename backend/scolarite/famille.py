"""
Espace famille : un parent / tuteur suit les élèves auxquels il est rattaché (avec l'accès autorisé).

Sécurité : chaque requête repart du compte connecté → ses liens → ses élèves. Un identifiant
d'élève, de bulletin ou de paiement qui n'appartient pas à cette liste répond 404, comme s'il
n'existait pas. Aucun droit de gestion n'est jamais donné à un compte parent.
"""
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.models import Role
from comptes.permissions import AbonnementValide

from .models import AnneeScolaire, Eleve, LienResponsable


class EstFamille(BasePermission):
    message = "Espace réservé aux parents et tuteurs."

    def has_permission(self, request, view):
        u = request.user
        if not (u and u.is_authenticated and u.role == Role.PARENT):
            return False
        if not request.tenant.a_module(Module.PARENTS):
            self.message = "L'espace parents n'est pas inclus dans le forfait de l'école."
            return False
        return True


def eleves_suivis(user):
    return Eleve.objects.filter(liens__responsable__utilisateur=user, liens__acces_app=True, actif=True).distinct()


def inscription_courante(eleve):
    annee = AnneeScolaire.objects.filter(active=True).first()
    qs = eleve.inscriptions.select_related("classe", "annee")
    return (qs.filter(annee=annee).first() if annee else None) or qs.order_by("-annee__debut").first()


class BaseFamille(APIView):
    permission_classes = [AbonnementValide, EstFamille]

    def eleve(self, pk):
        return get_object_or_404(eleves_suivis(self.request.user), pk=pk)


class EnfantsView(BaseFamille):
    def get(self, request):
        liens = {l.eleve_id: l for l in LienResponsable.objects.filter(responsable__utilisateur=request.user)}
        donnees = []
        for e in eleves_suivis(request.user):
            insc = inscription_courante(e)
            donnees.append({"id": e.pk, "prenom": e.prenom, "nom": e.nom, "matricule": e.matricule, "sexe": e.sexe,
                            "date_naissance": e.date_naissance, "classe": insc.classe.nom if insc else None,
                            "annee": str(insc.annee) if insc else None, "lien": liens[e.pk].get_lien_display()})
        return Response({"modules": request.tenant.modules_actifs(), "enfants": donnees})


class EnfantRubriqueView(BaseFamille):
    """GET /api/famille/enfants/<id>/<rubrique> : notes, a-venir, bulletins, emploi-du-temps, scolarite, absences."""

    MODULES = {"notes": Module.NOTES, "a-venir": Module.NOTES, "bulletins": Module.NOTES,
               "emploi-du-temps": Module.NOTES, "scolarite": Module.FRAIS, "absences": Module.ABSENCES,
               "porte-monnaie": Module.CARTE, "activites": Module.ACTIVITES}

    def get(self, request, pk, rubrique):
        if rubrique not in self.MODULES:
            raise NotFound()
        if not request.tenant.a_module(self.MODULES[rubrique]):
            raise PermissionDenied("Ce module n'est pas inclus dans le forfait de l'école.")
        eleve = self.eleve(pk)
        if rubrique == "porte-monnaie":  # la carte ne dépend pas de l'inscription
            return Response(self.porte_monnaie(eleve))
        insc = inscription_courante(eleve)
        if insc is None:
            return Response(None)
        return Response(getattr(self, rubrique.replace("-", "_"))(insc))

    def porte_monnaie(self, eleve):
        from carte import paiement_mobile, services as cartes
        from carte.models import DemandeRecharge

        p, carte = cartes.portefeuille_de(eleve), cartes.carte_de(eleve)
        return {
            "solde": p.solde, "bloque": p.bloque, "plafond_journalier": p.plafond_journalier,
            "plafond_effectif": cartes.plafond(p), "depense_aujourdhui": cartes.depenses_du_jour(p),
            # Carte virtuelle : le même QR que la carte imprimée (utile si elle est oubliée)
            "carte": {"numero": carte.numero, "active": carte.active, "qr": cartes.qr_carte(carte) if carte.active else None},
            "recharge_en_ligne": self.request.tenant.a_module(Module.PAIEMENT_MOBILE) and paiement_mobile.simulation_active(),
            "operateurs": paiement_mobile.OPERATEURS,
            "mouvements": [{"id": m.pk, "type": m.type, "libelle": m.libelle, "montant": m.montant, "solde_apres": m.solde_apres,
                            "le": m.le} for m in p.mouvements.all()[:40]],
            "en_attente": [{"reference": d.reference, "montant": d.montant, "operateur": d.operateur, "cree_le": d.cree_le}
                           for d in p.demandes.filter(statut=DemandeRecharge.Statut.EN_ATTENTE)[:5]],
        }

    def activites(self, insc):
        from activites.models import Activite, Ticket

        tickets = {t.activite_id: t for t in Ticket.objects.filter(eleve=insc.eleve).exclude(statut=Ticket.Statut.ANNULE)}
        resultat = []
        for a in Activite.objects.filter(date__gte=timezone.localdate()).order_by("date", "heure"):
            if not a.concerne(insc.classe) and a.pk not in tickets:
                continue
            t = tickets.get(a.pk)
            pris = a.tickets.exclude(statut=Ticket.Statut.ANNULE).count()
            resultat.append({"id": a.pk, "titre": a.titre, "description": a.description, "date": a.date, "heure": a.heure,
                             "lieu": a.lieu, "prix": a.prix, "achetable": a.ouverte and a.vente_en_ligne and t is None and
                             (a.places is None or pris < a.places),
                             "complet": a.places is not None and pris >= a.places,
                             "ticket": {"code": t.code, "statut": t.statut} if t else None})
        return resultat

    def notes(self, insc):
        """Notes validées par période et matière, avec les moyennes provisoires (sans rang avant le conseil)."""
        from pedagogie import services
        from pedagogie.models import Note, Periode

        notes = {}
        for n in (Note.objects.filter(inscription=insc, statut=Note.Statut.VALIDEE)
                  .select_related("evaluation__cours__matiere", "evaluation__periode")):
            notes.setdefault(n.evaluation.periode_id, {}).setdefault(n.evaluation.cours_id, []).append({
                "titre": n.evaluation.titre, "type": n.evaluation.type, "date": n.evaluation.date, "sur": n.evaluation.sur,
                "valeur": None if n.valeur is None else float(n.valeur), "absent": n.absent})
        periodes = []
        for p in Periode.objects.filter(annee=insc.annee):
            resultats = services.resultats_classe(insc.classe, p)
            moi = next((r for r in resultats["eleves"] if r["inscription"] == insc.pk), None)
            if moi is None or not (notes.get(p.pk) or resultats["verrouille"]):
                continue  # période sans aucune note (à venir) : rien à montrer
            periodes.append({
                "periode": p.nom, "bareme": resultats["bareme"], "moyenne": moi["moyenne"], "verrouille": resultats["verrouille"],
                "matieres": [{"matiere": m["matiere"], "coefficient": m["coefficient"], "enseignant": m["enseignant"],
                              "moyenne": m["moyenne"], "notes": sorted(notes.get(p.pk, {}).get(m["cours"], []), key=lambda x: x["date"])}
                             for m in moi["matieres"]],
            })
        return {"classe": insc.classe.nom, "periodes": periodes}

    def a_venir(self, insc):
        from pedagogie.models import Evaluation

        # Prévue = pas encore passée, ou du jour mais pas encore notée
        evals = (Evaluation.objects.filter(cours__classe=insc.classe, date__gte=timezone.localdate())
                 .annotate(nb_notes=Count("notes")).filter(Q(date__gt=timezone.localdate()) | Q(nb_notes=0))
                 .select_related("cours__matiere").order_by("date"))
        return [{"date": e.date, "titre": e.titre, "type": e.type, "matiere": e.cours.matiere.nom, "sur": e.sur} for e in evals]

    def bulletins(self, insc):
        from pedagogie.models import Bulletin

        return [{"id": b.pk, "periode": b.contenu["periode"], "annee": b.contenu["annee"], "classe": b.contenu["classe"],
                 "moyenne": b.contenu["moyenne"], "bareme": b.contenu["bareme"], "rang": b.contenu["rang"],
                 "effectif": b.contenu["effectif"], "mention": b.contenu["mention"], "emis_le": b.emis_le}
                for b in Bulletin.objects.filter(inscription__eleve=insc.eleve, annule_le__isnull=True).order_by("-emis_le")]

    def emploi_du_temps(self, insc):
        from pedagogie.equipe import CreneauSerializer
        from pedagogie.models import Creneau

        qs = Creneau.objects.filter(cours__classe=insc.classe).select_related("cours__classe", "cours__matiere", "cours__enseignant")
        return CreneauSerializer(qs, many=True).data

    def scolarite(self, insc):
        from finances import services
        from finances.models import Paiement

        from finances.models import Souscription

        s = services.situation(insc)
        return {
            "services": [{"libelle": x.frais.libelle, "depuis": x.debut, "montant": x.frais.montant, "periodicite": x.frais.periodicite}
                         for x in Souscription.objects.filter(inscription=insc, fin__isnull=True).select_related("frais")],
            "payer_par_porte_monnaie": self.request.tenant.a_module(Module.CARTE),
            "total": s["total"], "paye": s["paye"], "reste": s["reste"], "en_retard": s["en_retard"],
            "echeances": [{"id": e.pk, "libelle": e.libelle, "montant": e.montant, "date_limite": e.date_limite,
                           "paye": e.paye, "reste": e.reste} for e in s["echeances"]],
            "paiements": [{"id": p.pk, "numero_recu": p.numero_recu, "montant": p.montant, "moyen": p.get_moyen_display(),
                           "encaisse_le": p.encaisse_le}
                          for p in Paiement.objects.filter(inscription=insc, annule=False).order_by("-encaisse_le")],
        }

    def absences(self, insc):
        from pedagogie.models import Absence

        return [{"date": a.date, "creneau": a.get_creneau_display(), "type": a.type, "justifiee": a.justifiee, "motif": a.motif}
                for a in Absence.objects.filter(inscription=insc)]


class BulletinFamilleView(BaseFamille):
    def get(self, request, pk):
        if not request.tenant.a_module(Module.NOTES):
            raise PermissionDenied("Ce module n'est pas inclus dans le forfait de l'école.")
        from pedagogie.models import Bulletin
        from pedagogie.views import BulletinSerializer

        b = get_object_or_404(Bulletin, pk=pk, inscription__eleve__in=eleves_suivis(request.user), annule_le__isnull=True)
        return Response(BulletinSerializer(b).data)


class RecuFamilleView(BaseFamille):
    def get(self, request, pk):
        if not request.tenant.a_module(Module.FRAIS):
            raise PermissionDenied("Ce module n'est pas inclus dans le forfait de l'école.")
        from finances.models import Paiement
        from finances.views import donnees_recu

        p = get_object_or_404(Paiement.objects.select_related("inscription__eleve", "inscription__classe", "encaisse_par"),
                              pk=pk, inscription__eleve__in=eleves_suivis(request.user))
        return Response(donnees_recu(p, request.tenant))



# --------------------------------------------------------------------------- #
# Actions du parent : recharger, régler le porte-monnaie, acheter un ticket, payer une échéance
# --------------------------------------------------------------------------- #
def _metier(fn):
    from django.core.exceptions import ValidationError as DjangoValidationError
    from rest_framework.exceptions import ValidationError

    try:
        return fn()
    except DjangoValidationError as e:
        raise ValidationError({"detail": e.messages[0] if e.messages else str(e)})


def _module(request, module):
    if not request.tenant.a_module(module):
        raise PermissionDenied("Ce module n'est pas inclus dans le forfait de l'école.")


class RechargeFamilleView(BaseFamille):
    """POST {montant, operateur} → {url} : page de paiement de l'opérateur (ou du simulateur)."""

    def post(self, request, pk):
        from rest_framework.exceptions import APIException

        from carte import paiement_mobile

        _module(request, Module.CARTE)
        _module(request, Module.PAIEMENT_MOBILE)
        eleve = self.eleve(pk)
        try:
            montant = int(request.data.get("montant"))
        except (TypeError, ValueError):
            montant = 0
        try:
            demande, url = _metier(lambda: paiement_mobile.demander_recharge(eleve, montant, request.data.get("operateur"), request.user))
        except paiement_mobile.PaiementMobileIndisponible as e:
            erreur = APIException(str(e))
            erreur.status_code = 503
            raise erreur
        return Response({"reference": demande.reference, "url": url}, status=201)


class ReglagesPorteMonnaieView(BaseFamille):
    """PATCH {plafond_journalier, bloque} : le parent limite les dépenses ou bloque la carte (perte)."""

    def patch(self, request, pk):
        from carte import services as cartes

        _module(request, Module.CARTE)
        p = cartes.portefeuille_de(self.eleve(pk))
        if "plafond_journalier" in request.data:
            v = request.data["plafond_journalier"]
            p.plafond_journalier = None if v in (None, "") else max(0, int(v))
        if "bloque" in request.data:
            p.bloque = bool(request.data["bloque"])
        p.save(update_fields=["plafond_journalier", "bloque"])
        return Response({"plafond_journalier": p.plafond_journalier, "bloque": p.bloque})


class TicketFamilleView(BaseFamille):
    """POST {activite} : achète le ticket avec le porte-monnaie de l'élève."""

    def post(self, request, pk):
        from activites import services as billetterie
        from activites.models import Activite
        from rest_framework.exceptions import ValidationError

        _module(request, Module.ACTIVITES)
        eleve = self.eleve(pk)
        activite = get_object_or_404(Activite, pk=request.data.get("activite"))
        if not activite.vente_en_ligne:
            raise ValidationError({"detail": "Les tickets de cette activité se vendent au guichet."})
        t = _metier(lambda: billetterie.vendre(activite, par=request.user, eleve=eleve, moyen="portefeuille"))
        return Response({"code": t.code, "statut": t.statut}, status=201)


class PayerEcheanceView(BaseFamille):
    """POST : règle le reste d'une échéance avec le porte-monnaie (le reçu est émis comme au guichet)."""

    def post(self, request, pk, echeance):
        from finances import services
        from finances.models import Echeance, Paiement

        _module(request, Module.CARTE)
        eleve = self.eleve(pk)
        e = get_object_or_404(Echeance.objects.avec_soldes(), pk=echeance, inscription__eleve=eleve)
        if e.reste <= 0:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Cette échéance est déjà réglée."})
        p = _metier(lambda: services.encaisser(e.inscription, montant=e.reste, moyen=Paiement.Moyen.PORTEFEUILLE,
                                               encaisse_par=request.user, echeances=[e.pk],
                                               observation="Payé par le parent depuis l'application"))
        return Response({"paiement": p.pk, "numero_recu": p.numero_recu}, status=201)
