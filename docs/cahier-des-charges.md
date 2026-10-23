# NexusEcole — Cahier des charges

> Document de référence du produit. Il décrit **ce que fait** l'application et **les règles métier** ;
> le README décrit comment la lancer. Version 1 — octobre 2026.

## 1. Vision

NexusEcole est une plateforme **SaaS hybride** de gestion et de services pour les établissements
scolaires du Sénégal (privé laïc, confessionnel, franco-arabe, public).

- **Un seul code** pour toutes les écoles ; chaque école a son sous-domaine, son nom, son logo et ses
  couleurs (**marque blanche**), et ses données dans un **schéma PostgreSQL isolé**.
- **Une console éditeur** (NexusEcole) pour gérer écoles, forfaits, modules et facturation.
- **Instance dédiée** possible pour un gros client, avec le même code.

## 2. Acteurs et rôles

| Rôle | Description |
|---|---|
| Super-admin NexusEcole | Gère la plateforme (console) ; n'a **aucun** accès aux données des écoles |
| Directeur / Fondateur | Administrateur de l'école : tous les droits, attribue les rôles et les permissions |
| Secrétariat | Inscriptions, dossiers élèves, documents |
| Comptable / Caissier | Encaissements, reçus, relances, caisse |
| Enseignant | Notes et absences **des cours qui lui sont attribués** |
| Surveillant / Censeur | Absences, discipline ; notes **des classes qui lui sont attribuées** |
| Parent | Suit **ses** enfants : résultats, absences, paiements, porte-monnaie |
| Élève | Son espace : notes, emploi du temps, porte-monnaie, tickets, votes |

### Droits configurables
- Chaque rôle a un **ensemble de permissions** (ex. `frais.encaisser`, `notes.saisir`) que le
  **directeur modifie** dans l'application.
- Le directeur a toujours tous les droits (il ne peut pas se retirer l'accès par erreur).
- Les droits « à portée limitée » (enseignant, surveillant) ne s'appliquent qu'aux **classes ou cours
  attribués** ; l'administrateur fait les attributions.
- Toutes les vérifications sont faites **côté serveur**.

## 3. Modules

| Module | Phase | Forfait |
|---|---|---|
| Scolarité (années, classes, élèves, inscriptions) | 1 | tous |
| Frais scolaires (grille, échéances, paiements, reçus, impayés, caisse) | 1 | tous |
| Notes & bulletins | 1 | tous |
| Absences & vie scolaire | 1 | tous |
| Espace parents & élèves | 2 | Standard+ |
| Carte scolaire & porte-monnaie | 2 | Standard+ |
| Paiement mobile (Wave, Orange Money, Free Money) | 2 | Premium / option |
| Cantine | 3 | option |
| Boutique (uniformes, fournitures) | 3 | option |
| Événements & billetterie | 3 | option |
| Élections du gouvernement scolaire | 4 | option |

## 4. Règles métier

### 4.1 Année scolaire et inscriptions
- Tout est rattaché à une **année scolaire** (ex. 2026-2027) ; une seule est « active ».
- Un élève n'est jamais modifié d'une année à l'autre : chaque année on crée une **inscription**
  (élève + classe + année). Un élève a au plus une inscription par année.
- À l'inscription, l'application **génère les échéances** de l'élève à partir de la grille de frais.

### 4.2 Frais scolaires
- **Grille de frais** par année et par niveau : inscription, mensualités, tenue, assurance, APE, autres.
- Chaque frais est **unique** (une échéance) ou **mensuel** (N échéances, ex. octobre → juillet).
- **Réduction** possible par inscription (fratrie, enfant du personnel, bourse), en pourcentage, sur
  les frais de scolarité.
- **Paiement** : espèces, Wave, Orange Money, Free Money, virement, chèque ; partiel accepté.
  Le montant est **imputé automatiquement aux échéances les plus anciennes**, sauf choix explicite.
- **Reçu** : numéro **séquentiel sans trou** par année (`R-2026-000001`), non modifiable.
- **Un paiement ne se supprime jamais** : il s'**annule** avec un motif ; l'annulation reste tracée
  (qui, quand, pourquoi) et le reçu apparaît « ANNULÉ ».
- **Impayés** : échéances dont la date limite est passée et non soldées ; relance SMS (phase 2).
- **Caisse du jour** : total par moyen de paiement et par caissier, à rapprocher des reçus.
- Montants en **FCFA entiers**.

### 4.3 Notes et bulletins
- Chaque **cours** = classe + matière + coefficient + enseignant titulaire.
- Saisie par l'**enseignant du cours** ou par un **surveillant affecté à la classe**.
- Chaque note garde **qui l'a saisie et quand** ; toute modification est journalisée.
- Réglage de l'école : les notes saisies par un surveillant doivent-elles être **validées** par
  l'enseignant ?
- **Paramètres par école** (jamais codés en dur) : barème (/10 ou /20), trimestres ou semestres,
  formule de la moyenne de matière (ex. `(moyenne devoirs + composition) / 2`), mentions.
- Moyenne générale pondérée par les coefficients ; **rang** dans la classe.
- **Verrouillage** de la période après le conseil de classe.
- **Bulletin PDF signé** avec un **QR code de vérification** (page publique qui confirme
  l'authenticité).

### 4.4 Absences
- Appel par l'enseignant ou le surveillant, depuis un téléphone, **même hors ligne**.
- Retards, justificatifs, sanctions ; cumul affiché sur le bulletin ; notification du parent.

### 4.5 Carte scolaire et porte-monnaie
- Carte imprimée avec **QR code** + photo ; au scan, l'agent voit la **photo** de l'élève.
  (Carte NFC MIFARE DESFire EV2/EV3 en option plus tard ; **MIFARE Classic exclu**.)
- **Porte-monnaie fermé** : utilisable uniquement dans l'école (cantine, boutique, événements),
  pas de retrait ni de transfert entre élèves.
- **Registre d'opérations** (recharge, achat, remboursement) : le solde est la somme des opérations ;
  aucune opération n'est supprimée.
- **Recharge** par le parent (ou l'élève) via Wave / Orange Money / Free Money : notification
  (webhook) **signée et vérifiée**, **idempotente** (un paiement = un crédit).
- **Contrôle parental** : plafond par jour / semaine, catégories autorisées (cantine, boutique,
  événements), blocage immédiat en cas de perte, remplacement de carte (l'ancienne devient
  inutilisable), notification de chaque achat.
- **Les fonds sont encaissés sur le compte marchand de l'école** via un agrégateur ;
  NexusEcole ne détient jamais les fonds. Montage à valider juridiquement (réglementation BCEAO
  sur la monnaie électronique).

### 4.6 Cantine
- Abonnement (mois / trimestre, jours choisis) ou paiement au repas par le porte-monnaie.
- Scan de la carte au passage : réponse immédiate ✅ / ❌ ; **mode hors ligne** avec synchronisation
  et protection contre la double dépense.
- Menus de la semaine visibles par les parents ; allergies signalées.

### 4.7 Boutique
- Catalogue (uniformes, polos de sport, badges, fournitures) avec **tailles et stock**.
- Commande par le parent ou l'élève, paiement en ligne ou porte-monnaie, remise à l'élève (« livrée »).
- Option : uniforme ajouté automatiquement à l'échéancier des nouveaux élèves.
- Alertes de stock bas, inventaire.

### 4.8 Événements et billetterie
- L'école crée des événements (kermesse, gala, sortie, tournoi) : prix, places, dates.
- Achat du ticket dans l'application (porte-monnaie ou paiement mobile).
- **Contrôle d'accès** par scan de la carte de l'élève ; un ticket ne sert qu'**une fois**.
- Tickets invités (QR code par SMS) ; bilan des recettes et des entrées.

### 4.9 Élections du gouvernement scolaire
- Postes, candidats, corps électoral (toute l'école ou certaines classes), dates d'ouverture.
- **Un élève = un vote par poste.**
- **Secret du vote** : la liste d'émargement (qui a voté) et l'urne (les bulletins) sont séparées ;
  personne, même l'administrateur, ne peut relier un vote à un élève.
- Résultats publiés à la clôture ; journal d'audit.

### 4.10 Espace parent et élève
- Suivi des performances : notes au fil de l'eau, moyenne de la classe, évolution, alertes
  (note < 10, absence, baisse), bulletins.
- Porte-monnaie : solde, historique, recharge, contrôles parentaux (parent uniquement).
- Un parent = un compte pour tous ses enfants.

## 5. Exigences non fonctionnelles

- **Sécurité** : isolation par schéma, JWT liés à l'école, permissions vérifiées côté serveur,
  limitation des tentatives de connexion, journal d'audit sur notes et paiements, HTTPS.
- **Données personnelles** : déclaration à la CDP (loi n° 2008-12) ; données de mineurs.
- **Mobile d'abord** : interface utilisable sur smartphone ; PWA.
- **Hors ligne** : appel et cantine fonctionnent sans Internet puis se synchronisent.
- **Design** : identité inspirée d'AP2A Impact (Plus Jakarta Sans / Outfit, barre latérale,
  bandeaux en dégradé, mode clair/sombre), couleurs de chaque école appliquées par variables CSS.
- **Sauvegardes** quotidiennes, restauration possible école par école.

## 6. Paiements en ligne (phase 2)

Aucun agrégateur n'est encore choisi. L'architecture prévoit une **interface de fournisseur** unique
(initier un paiement, vérifier une notification signée, interroger un statut) pour brancher
PayDunya, CinetPay, Wave Business ou Orange Money sans toucher au reste.
En phase 1, les paiements Wave / OM sont **enregistrés par la caisse** avec la référence de transaction.

## 7. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| 0 | Socle multi-tenant, marque blanche, console, forfaits, factures | ✅ |
| 1a | Droits configurables, inscriptions, frais, échéances, paiements, reçus, caisse | ✅ |
| 1b | Matières, cours, attributions, notes, bulletins PDF signés, absences | ✅ |
| 1c | Nouveau design (inspiré d'AP2A Impact) | ✅ |
| 2 | Espaces parent / élève, carte QR, porte-monnaie, paiement mobile | à faire |
| 3 | Cantine, boutique, événements & billetterie | à faire |
| 4 | Élections, NFC, écoles pilotes, mise en production | à faire |
