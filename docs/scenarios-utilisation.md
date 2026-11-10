# NexusEcole — Scénarios d'utilisation

> Une année scolaire racontée rôle par rôle, au **Lycée Démo**. Chaque scénario indique **qui**, **où cliquer**
> et **ce que fait l'application**. Tous les comptes de démonstration ont le mot de passe `Demo-Nexus-2026`.
>
> En ligne : `https://<votre-adresse>.onrender.com/e/lycee-demo` (la console : `…/console`).

| Personnage | Rôle | Compte de démo |
|---|---|---|
| Vous | Éditeur NexusEcole (console) | votre `SUPERADMIN_EMAIL` |
| Awa Diop | Directrice | `directeur@lycee-demo.sn` |
| Moustapha Sy | Comptable / caissier | `caisse@lycee-demo.sn` |
| Rokhaya Ndiaye | Professeure de mathématiques | `prof@lycee-demo.sn` |
| Lamine Sène | Surveillant (6e A, 5e A) | `surveillant@lycee-demo.sn` |
| Mame Diarra Ndiaye | Mère d'Aminata (6e A), tutrice de Babacar (CM2 A) | `parent@lycee-demo.sn` |

---

## Scénario 0 — Vous vendez NexusEcole à une nouvelle école
*Console éditeur → Écoles → Nouvelle école*

1. Vous saisissez le nom (« Institution Sainte-Marie »), le **code** (`sainte-marie`), la ville, le **pays**
   (Sénégal, Mali, Guinée…), le **forfait** (Starter, Standard, Premium) et les deux couleurs de l'école.
2. Vous créez le compte de la directrice (e-mail, mot de passe provisoire).
3. **Résultat** : l'école a son espace isolé, son adresse (`…/e/sainte-marie`), ses couleurs, 30 jours d'essai.
   Le pays fixe la monnaie (FCFA, GNF…) et l'indicatif des numéros.
4. Plus tard : *Factures* pour émettre et encaisser l'abonnement ; une école impayée passe en **lecture seule**.

---

## Partie 1 — Préparer la rentrée (la directrice)

### Scénario 1 — Ouvrir l'année, les classes et la grille des frais
*Classes et années · Frais et services* — compte **directeur**

1. *Classes et années* : l'année **2026-2027** est **Active**. Awa ajoute les classes (6e A, 5e A, CM2 A…) avec
   leur niveau ; le barème est /10 en élémentaire, /20 ensuite.
2. *Frais et services* → *Ajouter un frais* :
   - **Frais obligatoires** (dus par tous dès l'inscription) : « Frais d'inscription » 30 000 en une fois,
     « Mensualité collège » 20 000 × 10 mois pour les niveaux 6e à 3e ;
   - **Services à la carte** (dus seulement par les inscrits) : « Transport – zone 1 » 10 000/mois,
     « Cantine (forfait) » 12 500/mois, « Études surveillées » pour les 3e.
3. **Résultat** : chaque nouvelle inscription générera automatiquement les bonnes échéances.

### Scénario 2 — Recruter l'équipe et donner les bons droits
*Enseignants · Personnel · Rôles et droits* — compte **directeur**

1. *Enseignants* → *Nouvel enseignant* : Aliou Sall, vacataire, matière SVT, mot de passe initial.
2. *Classes et matières* sur sa fiche : **4e A · SVT** et **3e A · SVT** → les cours sont créés (ou repris à un
   collègue, qui est prévenu). Aliou ne verra **que ces deux classes**.
3. *Rôles et droits* → *Nouveau rôle* « Économe » : cocher « Voir les impayés et la caisse » et « Voir les
   échéances ». L'application refuse de donner un droit que la personne qui crée le rôle n'a pas.
4. *Personnel* → *Nouveau compte* : Ndèye, rôle **Économe**.
5. **Résultat** : chacun ne voit que ce que son rôle permet. Le tableau *Qui peut quoi* résume tout.

### Scénario 3 — Construire l'emploi du temps
*Matières et cours · Emploi du temps* — compte **directeur**

1. *Matières et cours* : coefficients par classe (Maths 4, Français 4, Anglais 2…).
2. *Emploi du temps* → *Par classe* → 6e A → *Ajouter un cours* : Maths, lundi 8 h – 10 h, salle B2.
3. Awa essaie de mettre Français à 9 h le même lundi : **refusé** (« la classe a déjà Maths de 08:00 à 10:00 »).
   Même chose si le professeur ou la salle sont déjà pris.
4. **Résultat** : chaque professeur a *Mon emploi du temps* ; les parents le voient aussi.

### Scénario 4 — Installer la cantine, la boutique et les règles de la carte
*Caisses et points de vente* — compte **directeur**

1. **Caisses** : « Caisse de l'école » (comptabilisée) existe ; « Foyer des élèves » (hors comptabilité) aussi.
   On peut en créer d'autres (coopérative, gouvernement scolaire).
2. **Points de vente** : « Cantine » → articles *Repas du midi 500*, *Petit-déjeuner 300* ;
   « Boutique (uniformes) » → *Chemise 4 000*, *Tenue de sport 6 000*.
3. **Règles de la carte** :
   - plafond de dépenses par jour (par exemple 1 000) ;
   - choix de **refuser ou non l'entrée** d'un élève en retard de paiement (désactivé par défaut).

---

## Partie 2 — La vie de l'école

### Scénario 5 — Inscrire un nouvel élève avec sa famille
*Élèves → Nouvel élève* — compte **directeur** (ou secrétariat)

1. Rama Faye, née à Kaolack ; classe **5e A** ; informations médicales (asthme).
2. **Parents et tuteurs** :
   - le père, Modou Faye, avec son téléphone ;
   - la **tutrice légale**, Seynabou Diagne, cochée « Contact principal » et « Lui créer son accès maintenant »
     (e-mail et mot de passe).
3. Pour inscrire son **petit frère** plus tard : « Déjà inscrit (fratrie) » → on retrouve Seynabou par son nom
   ou son téléphone, sans la ressaisir.
4. **Résultat** :
   - un **matricule** est attribué automatiquement, ainsi que la **carte scolaire** et le **porte-monnaie** ;
   - les échéances obligatoires sont créées ;
   - la tutrice peut se connecter tout de suite.
5. Sur la fiche, section **Services** → *Inscrire à un service* : Transport zone 1. Les échéances partent
   **du mois en cours** ; si Rama arrête en mars, les mois à venir non payés disparaissent, l'échu reste dû.

### Scénario 6 — La photo et la carte scolaire
*Cartes scolaires* — compte **directeur**

1. Choisir **6e A** ; pour chaque élève, *Photo* ouvre l'appareil du téléphone (photo réduite automatiquement).
2. *Imprimer la classe* : planche au format carte bancaire (85,6 × 54 mm) avec logo, photo, classe, matricule,
   **QR code signé** et numéro à 8 chiffres.
3. **Résultat** : impossible de fabriquer une fausse carte (le QR est signé avec la clé de l'école).

### Scénario 7 — Le matin au portail
*Contrôle des cartes* — compte **surveillant**, sur son téléphone

1. Mode « Entrée de l'école » → *Activer la caméra* → l'élève présente sa carte (ou la carte virtuelle sur le
   téléphone de son parent).
2. Écran vert **ACCÈS AUTORISÉ** avec la **photo** : Lamine vérifie que c'est bien l'élève ; l'écran indique
   « À jour des paiements » ou « Retard : 40 000 FCFA ».
3. Écran rouge **ACCÈS REFUSÉ** si : carte désactivée, élève non inscrit, **ancienne carte** (perdue puis
   remplacée), carte d'une autre école, ou retard de paiement si l'école l'a décidé.
4. **Résultat** : chaque passage est enregistré (*Passages du jour*) — base de l'assiduité.

### Scénario 8 — Encaisser les frais et suivre les impayés
*Caisse · Impayés* — compte **caisse**

1. *Caisse* → rechercher « Aminata » → *Encaisser* : 20 000 par **Wave** avec la référence de la transaction.
   Le montant va aux échéances les plus anciennes (ou à celles qu'on coche).
2. *Reçu* s'imprime, au numéro séquentiel `R-2026-000123`.
3. Erreur de saisie ? *Annuler* avec un motif : le reçu reste, marqué **ANNULÉ** (qui, quand, pourquoi).
4. *Impayés* : liste des familles en retard → bouton **WhatsApp** pour envoyer une relance au contact principal.
5. En fin de journée, la *caisse du jour* donne le total par moyen de paiement et par caissier, à rapprocher
   des reçus.

### Scénario 9 — Recharger la carte et manger à la cantine
*Fiche élève · Point de vente* — compte **caisse**

1. La maman d'Aminata donne 5 000 en espèces au guichet → fiche d'Aminata → *Carte et porte-monnaie* →
   *Recharger*.
2. À midi, *Point de vente* → **Cantine** → scanner la carte → la photo et le solde s'affichent → toucher
   *Repas du midi* + *Jus* → **Encaisser 700**.
3. Refusé si le solde est insuffisant, si le **plafond du jour** est atteint, ou si la carte est **bloquée**.
4. **Résultat** : l'argent du repas va dans la caisse de la cantine ; l'argent rechargé et non dépensé reste
   celui de la famille.

### Scénario 10 — Le professeur saisit ses notes et fait l'appel
*Notes · Appel · Emploi du temps* — compte **prof**

1. Rokhaya ne voit **que ses classes et ses élèves**.
2. *Notes* → 6e A Maths → *Nouvelle évaluation* « Devoir n°1 », sur 20 → saisie des notes (« 7,5 » accepté,
   absents notés « Abs. »).
3. Chaque note est inscrite dans un **journal chaîné** : une note modifiée en cachette dans la base serait
   détectée.
4. *Appel* → 6e A, matin → présent / absent / retard → *Enregistrer l'appel*.
5. Le surveillant peut aussi saisir pour sa classe ; si l'école le veut, l'enseignant valide ces notes.

### Scénario 11 — Une activité payante : la soirée culturelle
*Activités · Contrôle des cartes* — comptes **directeur**, **parent**, **surveillant**

1. Directrice : *Activités* → *Nouvelle activité* « Soirée culturelle », 1 000, 200 places, caisse
   **Foyer des élèves** (hors comptabilité de l'école), vente dans l'application des parents.
2. Parent : *Activités* → *Acheter* → payé avec le porte-monnaie de l'enfant.
3. Guichet : un cousin sans carte → *Tickets* → *Invité sans carte* → espèces → un **ticket à QR** à
   photographier.
4. Le soir : surveillant → *Contrôle des cartes* → mode « Activité : Soirée culturelle » → l'élève présente sa
   **carte** (elle sert de ticket) → autorisé ; un second passage est **refusé** (« déjà utilisé à 19:42 ») ;
   sans ticket → refusé.
5. **Résultat** : *Recettes par caisse* montre la recette au Foyer, séparée des recettes de l'école.

---

## Partie 3 — Les familles

### Scénario 12 — La journée d'un parent
*Espace famille* — compte **parent** (sur téléphone)

1. **Accueil** : ses deux enfants (Aminata, mère ; Babacar, **tutrice légale**) et la prochaine évaluation.
2. Aminata :
   - **Notes** : chaque devoir et la moyenne provisoire par matière ;
   - **Évaluations prévues** : « Composition du 1er trimestre, mardi 17 » ;
   - **Emploi du temps** ;
   - **Absences** : justifiées ou non ;
   - **Bulletins** : dès le conseil.
3. **Scolarité** : échéances, services (cantine, transport), reçus → *Payer* une mensualité avec le
   porte-monnaie : le reçu est émis comme au guichet.
4. **Porte-monnaie** :
   - le solde et l'historique (chaque repas, chaque ticket) ;
   - **Recharger** : Wave ou Orange Money (simulateur en démonstration) ;
   - **dépenses maximum par jour** : 1 000 ;
   - **Bloquer les achats** si la carte est perdue ;
   - **Carte sur le téléphone** si l'enfant l'a oubliée.
5. Elle ne voit jamais un enfant qui n'est pas le sien, ni aucun écran de gestion de l'école.

---

## Partie 4 — Résultats et fin d'année

### Scénario 13 — Le conseil de classe et les bulletins
*Résultats et bulletins* — compte **directeur**

1. 6e A, 1er trimestre : moyennes, rangs (ex aequo gérés), mentions, statistiques de la classe.
2. *Tenir le conseil* → la période est **verrouillée** (plus aucune note ne change) et un **bulletin signé** avec
   **QR code** est émis pour chaque élève.
3. N'importe qui scanne le QR d'un bulletin papier → page publique **« Bulletin authentique »**. Un bulletin
   modifié serait signalé **« non valide »**.
4. Une erreur découverte ? *Rouvrir le conseil* avec un **motif** (droit réservé à la direction) :
   - les bulletins émis sont **annulés, jamais effacés** : leur QR affiche « Bulletin annulé, une version
     corrigée a été émise » ;
   - on corrige la note, puis on retient le conseil, qui émet les versions corrigées ;
   - l'historique garde qui a rouvert, quand et pourquoi.

### Scénario 14 — Décider du passage en classe supérieure
*Fin d'année et réinscriptions → 1. Décisions du conseil* — compte **directeur**

1. 6e A : moyenne annuelle de chaque élève et **proposition** (moyenne ≥ 10/20 → « Passe »).
2. *Reprendre les propositions*, puis ajuster élève par élève : Passe, **Redouble**, **Exclu**, **Quitte
   l'école**.
3. *Enregistrer les décisions*.

### Scénario 15 — Préparer l'année suivante et réinscrire
*Classes et années · Fin d'année et réinscriptions → 2. Réinscriptions* — compte **directeur**

1. *Classes et années* → *Préparer l'année suivante* : **2027-2028** ; cocher ce qu'on reconduit :
   - classes ;
   - grille des frais, dates décalées d'un an ;
   - matières et coefficients, **sans les enseignants** ;
   - trimestres.
2. L'année est créée **« En préparation »** : l'école continue de travailler sur 2026-2027.
3. *Réinscriptions* : 2026-2027 → 2027-2028 ; la **classe proposée** suit la décision. Un élève de 6e A qui
   passe va en 5e A, un redoublant reste en 6e A. Les exclus et les départs ne sont pas proposés.
4. On coche, on ajuste une classe si besoin → **Valider 32 réinscriptions** → inscriptions et échéances créées.
5. *Enseignants* → *Classes et matières* : les **affectations de la nouvelle année repartent de zéro** ; on les
   refait. Les professeurs gardent leur compte et leur mot de passe.
6. À la rentrée : *Classes et années* → 2027-2028 → **Activer**. L'ancienne année passe **Clôturée** :
   consultable (notes, bulletins, paiements), mais on n'y inscrit plus personne.

---

## Partie 5 — Sécurité et contrôle

### Scénario 16 — Un employé quitte l'école
*Comptes et accès* — compte **directeur**

1. Rechercher l'employé → interrupteur **Accès** → *Bloquer*.
2. **Résultat** :
   - sa session en cours est coupée immédiatement ;
   - à la connexion, il lit « Votre accès a été bloqué par l'établissement » ;
   - son historique (reçus encaissés, notes saisies) est conservé.
3. *Supprimer* n'est possible que pour un compte qui n'a **jamais rien fait** ; sinon l'application répond
   « bloquez-le ». Le dernier directeur actif ne peut pas être bloqué.
4. Même chose pour un parent (accès suspendu) ou un enseignant.

### Scénario 17 — Une carte perdue
*Espace famille · Fiche élève* — comptes **parent** puis **directeur**

1. Le parent bloque immédiatement les achats depuis son téléphone (*Porte-monnaie* → *Bloquer*).
2. L'école : fiche de l'élève → *Réémettre* (motif « perte ») → nouvelle carte à imprimer.
3. **Résultat** : l'ancienne carte est **refusée partout** (portail, cantine, activités), le solde est conservé.

### Scénario 18 — Les comptes de fin de mois
*Recettes par caisse* — compte **directeur** ou **caisse**

1. Choisir la période : recettes de l'école (frais, cantine, boutique), recettes **hors comptabilité**
   (foyer, activités), recharges par moyen (espèces, Wave, Orange Money) et **argent des familles en dépôt**
   (soldes des cartes).
2. Bandeau vert : « **Grand livre intact** ». Si quelqu'un modifiait un mouvement directement dans la base,
   une alerte rouge l'indiquerait.

---

## Ce que ces scénarios ne couvrent pas encore

Ces fonctions sont prévues mais pas encore construites (voir le cahier des charges) :
- recharge Wave / Orange Money réelle (comptes marchands à ouvrir) ;
- comptes élèves et élections du gouvernement scolaire ;
- connexion par téléphone ;
- SMS automatiques ;
- menus de la cantine et stock de la boutique ;
- mode hors ligne ;
- application installable.
