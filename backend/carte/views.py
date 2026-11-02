import base64
import binascii

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from clients.models import Module
from comptes.permissions import AbonnementValide, ModuleActif, permission
from scolarite.models import Eleve
from scolarite.perimetre import filtrer

from . import paiement_mobile, services
from .models import Article, DemandeRecharge, Mouvement, ParametresCarte, Passage, PhotoEleve, PointDeVente, Vente


def _metier(fn):
    try:
        return fn()
    except DjangoValidationError as e:
        raise ValidationError({"detail": e.messages[0] if e.messages else str(e)})


def un_des(*codes):
    """Permission accordée si l'utilisateur a l'un de ces droits."""

    class _UnDes(BasePermission):
        message = "Vous n'avez pas le droit d'effectuer cette action."

        def has_permission(self, request, view):
            u = request.user
            return bool(u and u.is_authenticated and any(u.a_permission(c) for c in codes))

    return _UnDes


class BaseCarte:
    module_requis = Module.CARTE


def eleve_visible(request, pk):
    return get_object_or_404(filtrer(Eleve.objects.all(), request.user), pk=pk)


def photo_data_url(eleve):
    p = PhotoEleve.objects.filter(eleve=eleve).first()
    return f"data:{p.type_mime};base64,{base64.b64encode(bytes(p.image)).decode()}" if p else None


def resume_eleve(eleve, inscription=None):
    inscription = inscription or services.inscription_courante(eleve)
    return {"id": eleve.pk, "prenom": eleve.prenom, "nom": eleve.nom, "matricule": eleve.matricule,
            "classe": inscription.classe.nom if inscription else None, "photo": photo_data_url(eleve)}


# --------------------------------------------------------------------------- #
# Photo d'identité
# --------------------------------------------------------------------------- #
SIGNATURES_IMAGES = {b"\xff\xd8\xff": "image/jpeg", b"\x89PNG": "image/png", b"RIFF": "image/webp"}


class PhotoView(BaseCarte, APIView):
    """GET : l'image ; PUT {image: "data:image/jpeg;base64,…"} (réduite par le navigateur) ; DELETE."""

    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "cartes.gerer")]

    def get(self, request, pk):
        p = get_object_or_404(PhotoEleve, eleve=eleve_visible(request, pk))
        reponse = HttpResponse(bytes(p.image), content_type=p.type_mime)
        reponse["Cache-Control"] = "private, max-age=300"
        return reponse

    def put(self, request, pk):
        eleve = eleve_visible(request, pk)
        donnees = str(request.data.get("image", ""))
        try:
            octets = base64.b64decode(donnees.split(",", 1)[-1], validate=True)
        except (binascii.Error, ValueError):
            raise ValidationError({"image": "Image illisible."})
        if len(octets) > 300_000:
            raise ValidationError({"image": "Image trop lourde (300 Ko maximum)."})
        type_mime = next((t for sig, t in SIGNATURES_IMAGES.items() if octets.startswith(sig)), None)
        if type_mime is None:
            raise ValidationError({"image": "Format accepté : JPEG, PNG ou WebP."})
        PhotoEleve.objects.update_or_create(eleve=eleve, defaults={"image": octets, "type_mime": type_mime})
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, pk):
        PhotoEleve.objects.filter(eleve=eleve_visible(request, pk)).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Cartes
# --------------------------------------------------------------------------- #
def donnees_carte(carte, avec_qr=True):
    d = {"numero": carte.numero, "version": carte.version, "active": carte.active, "emise_le": carte.emise_le,
         "reemise_le": carte.reemise_le, "motif": carte.motif}
    if avec_qr:
        d["qr"] = services.qr_carte(carte)
    return d


class CartesView(BaseCarte, APIView):
    """Planche de cartes d'une classe (ou de toute l'école) pour l'impression ; crée les cartes manquantes."""

    permission_classes = [AbonnementValide, ModuleActif, permission("cartes.gerer")]

    def get(self, request):
        from scolarite.models import AnneeScolaire, Inscription

        annee = AnneeScolaire.objects.filter(active=True).first()
        inscriptions = (filtrer(Inscription.objects.filter(annee=annee, statut="active"), request.user)
                        .select_related("eleve", "classe").order_by("classe__nom", "eleve__nom", "eleve__prenom"))
        if classe := request.query_params.get("classe"):
            inscriptions = inscriptions.filter(classe=classe)
        if eleve := request.query_params.get("eleve"):
            inscriptions = inscriptions.filter(eleve=eleve)
        photos = set(PhotoEleve.objects.values_list("eleve_id", flat=True))
        resultat = []
        for i in inscriptions:
            carte = services.carte_de(i.eleve)
            resultat.append({"eleve": {"id": i.eleve.pk, "prenom": i.eleve.prenom, "nom": i.eleve.nom, "matricule": i.eleve.matricule,
                                       "sexe": i.eleve.sexe, "date_naissance": i.eleve.date_naissance, "classe": i.classe.nom,
                                       "a_photo": i.eleve.pk in photos},
                             "carte": donnees_carte(carte)})
        return Response({"annee": annee.libelle if annee else None, "cartes": resultat})


class CarteEleveView(BaseCarte, APIView):
    """Carte et porte-monnaie d'un élève (fiche élève). Le solde n'est montré qu'à qui a le droit de le voir."""

    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir")]

    def get(self, request, pk):
        eleve = eleve_visible(request, pk)
        carte, p = services.carte_de(eleve), services.portefeuille_de(eleve)
        d = {"carte": donnees_carte(carte, avec_qr=request.user.a_permission("cartes.gerer")),
             "a_photo": PhotoEleve.objects.filter(eleve=eleve).exists()}
        if request.user.a_permission("portefeuille.voir"):
            d["portefeuille"] = {"solde": p.solde, "bloque": p.bloque, "plafond_journalier": p.plafond_journalier,
                                 "plafond_effectif": services.plafond(p), "depense_aujourdhui": services.depenses_du_jour(p)}
        return Response(d)

    def post(self, request, pk):
        """Réémettre la carte (perte, vol) : {motif}. L'ancienne est refusée partout."""
        if not request.user.a_permission("cartes.gerer"):
            raise PermissionDenied("Vous n'avez pas le droit de gérer les cartes.")
        carte = _metier(lambda: services.reemettre(services.carte_de(eleve_visible(request, pk)), request.data.get("motif")))
        return Response(donnees_carte(carte))

    def patch(self, request, pk):
        """{active} : désactiver ou réactiver la carte."""
        if not request.user.a_permission("cartes.gerer"):
            raise PermissionDenied("Vous n'avez pas le droit de gérer les cartes.")
        carte = services.carte_de(eleve_visible(request, pk))
        carte.active = bool(request.data.get("active"))
        carte.motif = str(request.data.get("motif", ""))[:120]
        carte.save(update_fields=["active", "motif"])
        return Response(donnees_carte(carte, avec_qr=False))


class LectureCarteView(BaseCarte, APIView):
    """Identifier une carte scannée (guichet, point de vente) : élève, photo, solde disponible."""

    permission_classes = [AbonnementValide, ModuleActif,
                          un_des("ventes.encaisser", "portefeuille.recharger", "acces.controler", "activites.gerer")]

    def post(self, request):
        carte, erreur = services.lire_carte(request.data.get("qr"))
        if erreur:
            raise ValidationError({"detail": erreur})
        p = services.portefeuille_de(carte.eleve)
        limite = services.plafond(p)
        depense = services.depenses_du_jour(p)
        return Response({"eleve": resume_eleve(carte.eleve), "carte": donnees_carte(carte, avec_qr=False),
                         "solde": p.solde, "bloque": p.bloque, "plafond_restant": None if limite is None else max(0, limite - depense)})


# --------------------------------------------------------------------------- #
# Porte-monnaie (côté école)
# --------------------------------------------------------------------------- #
class MouvementSerializer(serializers.ModelSerializer):
    type_libelle = serializers.CharField(source="get_type_display", read_only=True)
    caisse_nom = serializers.CharField(source="caisse.nom", read_only=True, default=None)
    par_nom = serializers.CharField(source="par.nom_complet", read_only=True, default=None)

    class Meta:
        model = Mouvement
        fields = ["id", "type", "type_libelle", "montant", "solde_apres", "libelle", "reference", "moyen", "caisse_nom", "par_nom", "le"]


class PortefeuilleView(BaseCarte, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("portefeuille.voir", "cartes.gerer")]

    def get(self, request, pk):
        p = services.portefeuille_de(eleve_visible(request, pk))
        return Response(MouvementSerializer(p.mouvements.select_related("caisse", "par")[:100], many=True).data)

    def patch(self, request, pk):
        """{plafond_journalier, bloque} : réglages décidés avec la famille."""
        p = services.portefeuille_de(eleve_visible(request, pk))
        if "plafond_journalier" in request.data:
            v = request.data["plafond_journalier"]
            p.plafond_journalier = None if v in (None, "") else max(0, int(v))
        if "bloque" in request.data:
            p.bloque = bool(request.data["bloque"])
        p.save(update_fields=["plafond_journalier", "bloque"])
        return Response({"plafond_journalier": p.plafond_journalier, "bloque": p.bloque})


class RechargeGuichetView(BaseCarte, APIView):
    """Recharge au guichet : {montant, moyen (especes, wave, orange_money…), reference}."""

    permission_classes = [AbonnementValide, ModuleActif, permission("portefeuille.recharger")]

    def post(self, request, pk):
        eleve = eleve_visible(request, pk)
        moyen = request.data.get("moyen") or "especes"
        if moyen not in ("especes", "wave", "orange_money", "free_money"):
            raise ValidationError({"moyen": "Moyen inconnu."})
        reference = str(request.data.get("reference", "")).strip()[:60]
        if moyen != "especes" and not reference:
            raise ValidationError({"reference": "Indiquez la référence de la transaction."})
        try:
            montant = int(request.data.get("montant"))
        except (TypeError, ValueError):
            raise ValidationError({"montant": "Montant invalide."})
        m = _metier(lambda: services.crediter(eleve, montant, libelle="Recharge au guichet", reference=reference,
                                              par=request.user, moyen=moyen))
        return Response(MouvementSerializer(m).data, status=status.HTTP_201_CREATED)


class GrandLivreView(BaseCarte, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("frais.rapports")]

    def get(self, request):
        intact, rupture = services.verifier_grand_livre()
        return Response({"intact": intact, "premier_mouvement_altere": rupture, "mouvements": Mouvement.objects.count()})


class ParametresSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametresCarte
        fields = ["refuser_si_retard", "seuil_retard", "plafond_journalier"]


class ParametresCarteView(BaseCarte, APIView):
    permission_classes = [AbonnementValide, ModuleActif, permission("eleves.voir", "ventes.parametrer")]

    def get(self, request):
        return Response(ParametresSerializer(ParametresCarte.actuels()).data)

    def patch(self, request):
        s = ParametresSerializer(ParametresCarte.actuels(), data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(s.data)


# --------------------------------------------------------------------------- #
# Points de vente et ventes
# --------------------------------------------------------------------------- #
class ArticleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Article
        fields = ["id", "point_de_vente", "nom", "prix", "actif"]


class PointDeVenteSerializer(serializers.ModelSerializer):
    caisse_nom = serializers.CharField(source="caisse.nom", read_only=True)
    articles = ArticleSerializer(many=True, read_only=True)

    class Meta:
        model = PointDeVente
        fields = ["id", "nom", "caisse", "caisse_nom", "actif", "articles"]


class PointDeVenteViewSet(BaseCarte, viewsets.ModelViewSet):
    queryset = PointDeVente.objects.select_related("caisse").prefetch_related("articles")
    serializer_class = PointDeVenteSerializer
    pagination_class = None
    permission_classes = [AbonnementValide, ModuleActif, permission("ventes.encaisser", "ventes.parametrer")]

    def perform_destroy(self, pdv):
        if pdv.ventes.exists():
            raise ValidationError({"detail": "Ce point de vente a des ventes : désactivez-le plutôt."})
        pdv.delete()


class ArticleViewSet(BaseCarte, viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer
    pagination_class = None
    permission_classes = [AbonnementValide, ModuleActif, permission("ventes.encaisser", "ventes.parametrer")]


class VenteSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.CharField(source="eleve.__str__", read_only=True)
    par_nom = serializers.CharField(source="par.nom_complet", read_only=True)

    class Meta:
        model = Vente
        fields = ["id", "point_de_vente", "eleve", "eleve_nom", "montant", "lignes", "par_nom", "le", "annulee_le"]


class VenteViewSet(BaseCarte, mixins.ListModelMixin, viewsets.GenericViewSet):
    """POST {point_de_vente, qr, lignes: [{article, quantite}]} ou {point_de_vente, qr, montant, libelle}."""

    queryset = Vente.objects.select_related("eleve", "par")
    serializer_class = VenteSerializer
    permission_classes = [AbonnementValide, ModuleActif, permission("ventes.encaisser")]

    def get_queryset(self):
        qs = super().get_queryset()
        if pdv := self.request.query_params.get("point_de_vente"):
            qs = qs.filter(point_de_vente=pdv)
        if jour := self.request.query_params.get("date"):
            qs = qs.filter(le__date=jour)
        return qs

    def create(self, request):
        pdv = get_object_or_404(PointDeVente, pk=request.data.get("point_de_vente"), actif=True)
        carte, erreur = services.lire_carte(request.data.get("qr"))
        if erreur:
            raise ValidationError({"detail": erreur})
        if not carte.active:
            raise ValidationError({"detail": "Carte désactivée."})
        lignes, total = [], 0
        for l in request.data.get("lignes") or []:
            article = get_object_or_404(Article, pk=l.get("article"), point_de_vente=pdv, actif=True)
            quantite = int(l.get("quantite", 1))
            if not 1 <= quantite <= 50:
                raise ValidationError({"detail": "Quantité invalide."})
            lignes.append({"article": article.pk, "nom": article.nom, "prix": article.prix, "quantite": quantite})
            total += article.prix * quantite
        if not lignes:
            try:
                total = int(request.data.get("montant"))
            except (TypeError, ValueError):
                raise ValidationError({"detail": "Choisissez des articles ou indiquez un montant."})
            lignes = [{"article": None, "nom": str(request.data.get("libelle") or "Achat")[:80], "prix": total, "quantite": 1}]
        libelle = f"{pdv.nom} : " + ", ".join(f"{l['quantite']} × {l['nom']}" if l["quantite"] > 1 else l["nom"] for l in lignes)

        def vendre():
            from django.db import transaction

            with transaction.atomic():
                m = services.debiter(carte.eleve, total, type_=Mouvement.Type.ACHAT, libelle=libelle[:150],
                                     reference=f"pdv-{pdv.pk}", par=request.user, caisse=pdv.caisse)
                return Vente.objects.create(point_de_vente=pdv, eleve=carte.eleve, montant=total, lignes=lignes,
                                            mouvement=m, par=request.user)

        vente = _metier(vendre)
        p = services.portefeuille_de(carte.eleve)
        return Response({**VenteSerializer(vente).data, "solde": p.solde}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], permission_classes=[AbonnementValide, ModuleActif, permission("ventes.parametrer")])
    def annuler(self, request, pk=None):
        from django.db import transaction

        with transaction.atomic():
            vente = Vente.objects.select_for_update().get(pk=self.get_object().pk)
            if vente.annulee_le:
                raise ValidationError({"detail": "Vente déjà annulée."})
            vente.annulee_le, vente.annulee_par = timezone.now(), request.user
            vente.save(update_fields=["annulee_le", "annulee_par"])
            services.crediter(vente.eleve, vente.montant, type_=Mouvement.Type.REMBOURSEMENT,
                              libelle=f"Vente annulée : {vente.point_de_vente.nom}", reference=f"vente-{vente.pk}", par=request.user)
        return Response(VenteSerializer(vente).data)


# --------------------------------------------------------------------------- #
# Contrôle à l'entrée (école ou activité)
# --------------------------------------------------------------------------- #
class ControleView(BaseCarte, APIView):
    """
    POST {qr, activite?: id}
    - sans activité : entrée dans l'école (carte valide, élève inscrit, et selon les règles : à jour des paiements) ;
    - avec activité : il faut un ticket valide, qui est composté (un second passage est refusé).
    Chaque contrôle est enregistré (assiduité, traçabilité).
    """

    permission_classes = [AbonnementValide, ModuleActif, permission("acces.controler")]

    def post(self, request):
        from activites import services as billetterie
        from activites.models import Activite, Ticket

        texte = request.data.get("qr")
        activite = None
        if request.data.get("activite"):
            activite = get_object_or_404(Activite, pk=request.data["activite"])
        lieu = activite.titre if activite else "Portail"

        # Ticket d'invité (QR de ticket, pas de carte)
        from carte import crypto

        champs = crypto.lire(texte or "")
        if champs and champs[0] == "NXT1":
            if activite is None:
                raise ValidationError({"detail": "Ticket d'activité : choisissez l'activité contrôlée."})
            ticket = Ticket.objects.filter(code=champs[2], activite=activite).first()
            if ticket is None:
                return self._verdict(request, None, lieu, False, ["Ticket d'une autre activité."])
            try:
                billetterie.composter(ticket, request.user)
                return self._verdict(request, None, lieu, True, [], ticket=ticket)
            except DjangoValidationError as e:
                return self._verdict(request, None, lieu, False, e.messages, ticket=ticket)

        carte, erreur = services.lire_carte(texte)
        if erreur:
            return self._verdict(request, None, lieu, False, [erreur])
        autorise, motifs, inscription, retard = services.droit_d_acces(carte)
        ticket = None
        if activite is not None:
            # À une activité, seul le ticket compte (la règle des impayés concerne l'entrée dans l'école)
            motifs = [m for m in motifs if not m.startswith("Retard")]
            ticket = activite.tickets.filter(eleve=carte.eleve).exclude(statut=Ticket.Statut.ANNULE).first()
            if ticket is None:
                motifs.append("Pas de ticket pour cette activité.")
            elif not motifs:
                try:
                    billetterie.composter(ticket, request.user)
                except DjangoValidationError as e:
                    motifs += e.messages
            autorise = not motifs
        return self._verdict(request, carte.eleve, lieu, autorise, motifs, inscription=inscription, retard=retard, ticket=ticket)

    def _verdict(self, request, eleve, lieu, autorise, motifs, inscription=None, retard=None, ticket=None):
        Passage.objects.create(eleve=eleve, lieu=lieu[:80], autorise=autorise, motifs=motifs, par=request.user)
        return Response({
            "autorise": autorise, "motifs": motifs, "lieu": lieu,
            "eleve": resume_eleve(eleve, inscription) if eleve else None,
            "a_jour": retard == 0 if retard is not None else None, "en_retard": retard,
            "ticket": {"code": ticket.code, "beneficiaire": ticket.beneficiaire, "statut": ticket.statut} if ticket else None,
            "le": timezone.now(),
        })


class PassageSerializer(serializers.ModelSerializer):
    eleve_nom = serializers.SerializerMethodField()
    classe = serializers.CharField(source="eleve.classe.nom", read_only=True, default=None)
    par_nom = serializers.CharField(source="par.nom_complet", read_only=True)

    def get_eleve_nom(self, p):
        return str(p.eleve) if p.eleve_id else None

    class Meta:
        model = Passage
        fields = ["id", "eleve", "eleve_nom", "classe", "lieu", "autorise", "motifs", "par_nom", "le"]


class PassageViewSet(BaseCarte, mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = Passage.objects.select_related("eleve__classe", "par")
    serializer_class = PassageSerializer
    permission_classes = [AbonnementValide, ModuleActif, un_des("acces.controler", "absences.saisir")]

    def get_queryset(self):
        qs = super().get_queryset()
        if not self.request.user.a_permission("acces.controler"):  # le portail contrôle toute l'école ; sinon, ses classes
            qs = qs.filter(Q(eleve__isnull=True) | Q(eleve__in=filtrer(Eleve.objects.all(), self.request.user)))
        qs = qs.filter(le__date=self.request.query_params.get("date") or timezone.localdate())
        if lieu := self.request.query_params.get("lieu"):
            qs = qs.filter(lieu=lieu)
        if eleve := self.request.query_params.get("eleve"):
            qs = qs.filter(eleve=eleve)
        return qs


# --------------------------------------------------------------------------- #
# Simulateur de paiement mobile (démonstration uniquement)
# --------------------------------------------------------------------------- #
class SimulateurView(APIView):
    """Joue le rôle de l'opérateur. Désactivé (404) hors mode simulation : il crédite sans argent réel."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = "verification"

    def _demande(self, reference):
        if not paiement_mobile.simulation_active():
            raise NotFound()
        return get_object_or_404(DemandeRecharge.objects.select_related("portefeuille__eleve"), reference=reference)

    def get(self, request, reference):
        d = self._demande(reference)
        return Response({"montant": d.montant, "operateur": paiement_mobile.OPERATEURS[d.operateur], "statut": d.statut,
                         "ecole": request.tenant.nom, "eleve": d.portefeuille.eleve.prenom})

    def post(self, request, reference):
        self._demande(reference)
        d = _metier(lambda: paiement_mobile.traiter_resultat(reference, bool(request.data.get("succes")),
                                                           f"SIM-{reference[:8].upper()}"))
        return Response({"statut": d.statut})

