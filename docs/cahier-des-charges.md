# NexusEcole — Cahier des charges

> Document de référence du produit : **ce que fait** l'application, **les règles métier**, et l'**état**
> de chaque point. Le README explique comment la lancer.
> **Version 2 — novembre 2026** (la version 1, d'octobre 2026, s'arrêtait à la phase 1b).
>
> Légende : ✅ fait et testé · 🟡 partiel · ⏳ à faire

## 1. Vision

NexusEcole est une plateforme **SaaS hybride** de gestion et de services pour les établissements scolaires
du **Sénégal et des pays voisins** (privé laïc, confessionnel, franco-arabe, public).

| Exigence | État |
|---|---|
| Un seul code pour toutes les écoles, données de chaque école dans un **schéma PostgreSQL isolé** | ✅ |
| **Marque blanche** : nom, logo, couleurs de l'école (palette dérivée de 2 couleurs) | ✅ |
| Adresse par **sous-domaine** (`ecole.nexusecole.sn`) ou par **chemin** (`/e/ecole`, hébergement gratuit) | ✅ |
| **Console éditeur** : écoles, forfaits, modules, abonnements, factures | ✅ |
| **Pays** par école : Sénégal, Mali, Guinée, Gambie, Mauritanie, Guinée-Bissau, Côte d'Ivoire, Burkina Faso, Niger, Togo, Bénin → monnaie affichée, indicatif téléphonique, fuseau horaire | ✅ |
| Interface en anglais (Gambie) ou en arabe (Mauritanie) | ⏳ |
| **Instance dédiée** pour un gros client (même code) | 🟡 possible techniquement, non outillé |

## 2. Acteurs, comptes et droits

| Acteur | Accès | État |
|---|---|---|
| Super-admin NexusEcole | Console uniquement ; **aucun** accès aux données des écoles | ✅ |
| Directeur | Tous les droits, toujours (ne peut pas se bloquer) | ✅ |
| Personnel (secrétariat, comptabilité, surveillance, rôles créés par l'école) | Selon son rôle | ✅ |
| Enseignant | Ses classes seulement (cours attribués) | ✅ |
| Parent / tuteur | Espace famille : uniquement les élèves qui lui sont rattachés | ✅ |
| Élève | Son propre espace (notes, solde, tickets, votes) | ⏳ |

### Règles
- **Rôles personnalisés** (comme AP2A Impact) : l'école crée ses rôles (économe, censeur, bibliothécaire…),
  les copie, les supprime s'ils ne sont attribués à personne ; matrice « qui peut quoi ». ✅
- **On ne donne que les droits qu'on a soi-même** : ni à un rôle, ni en attribuant un rôle à quelqu'un
  (pas d'élévation de privilèges) ; seul un directeur nomme ou retire un directeur. ✅
- **Périmètre** : sans le droit « voir toutes les classes », un compte ne voit que les classes où il enseigne
  ou qu'il surveille (élèves, notes, résultats, bulletins, absences). ✅
- **Blocage** de n'importe quel compte : coupure immédiate, même pendant une session ouverte ; message
  « accès bloqué » à la connexion (seulement si le mot de passe est juste). ✅
- **Pas de suppression** d'un compte qui a effectué une opération (encaissement, note, appel, vente…) :
  on le bloque, pour garder la trace de qui a fait quoi. Dernier directeur actif protégé. ✅
- Toutes les vérifications sont faites **côté serveur** ; le menu masque seulement ce qui n'est pas permis. ✅
- Connexion par **téléphone** (beaucoup de parents n'ont pas d'e-mail). ⏳

### Catalogue des droits (30)
Scolarité : paramétrer, voir les élèves, voir toutes les classes, gérer élèves, parents/tuteurs, inscriptions ·
Frais : voir, services, paramétrer, encaisser, annuler, rapports · Carte : cartes, contrôle d'accès,
voir / recharger les porte-monnaie, vendre, paramétrer les ventes, activités · Pédagogie : voir, saisir
(ses classes / toutes), valider et tenir le conseil, rouvrir un conseil, appel, emploi du temps ·
Administration : comptes, rôles.

## 3. Modules et forfaits

| Module | Starter | Standard | Premium | État |
|---|---|---|---|---|
| Scolarité, frais, notes, absences | ✅ | ✅ | ✅ | ✅ |
| Espace parents | | ✅ | ✅ | ✅ |
| Carte scolaire, porte-monnaie, contrôle d'accès | | ✅ | ✅ | ✅ |
| Activités et billetterie | | ✅ | ✅ | ✅ |
| Paiement mobile en ligne (Wave, Orange Money…) | | | ✅ | 🟡 simulateur |
| SMS / WhatsApp | | ✅ | ✅ | ⏳ (liens WhatsApp manuels ✅) |
| Élections du gouvernement scolaire | | option | option | ⏳ |

Prix indicatifs : Starter 25 000, Standard 50 000, Premium 100 000 FCFA / mois. Un module peut être ajouté
à une école en dehors de son forfait.

## 4. Règles métier

### 4.1 Années scolaires et rentrée ✅
- Une année est **en préparation**, **active** (une seule, elle sert partout) ou **clôturée** (archive
  consultable, plus d'inscription). On peut désactiver l'année active sans en activer une autre.
- **Préparer l'année suivante** en reconduisant au choix : classes, grille des frais (dates décalées d'un an),
  matières et coefficients **sans enseignant** (affectations remises à zéro), trimestres. L'année reste en
  préparation jusqu'à son activation.
- Conservés d'une année à l'autre : élèves, parents, personnel, enseignants **et leurs accès**.
- Un bandeau signale une année active sans classes (cause classique des listes vides).

### 4.2 Élèves et familles ✅
- Fiche complète : identité, lieu de naissance, nationalité, adresse, établissement précédent, date d'arrivée,
  informations médicales ; **matricule automatique**.
- **Parents et tuteurs** : plusieurs par élève (père, mère, tuteur légal, autre), **fratries** (une personne,
  plusieurs enfants), contact principal, accès à l'application **élève par élève**.
- Une inscription par élève et par année ; ses échéances sont générées depuis la grille.

### 4.3 Fin d'année et réinscription ✅
- **Décisions du conseil** par classe : passe, redouble, exclu, quitte l'école ; moyenne annuelle affichée,
  proposition automatique (moyenne ≥ moitié du barème → passe).
- **Réinscription proposée** d'après la décision (6e A qui passe → 5e A ; redoublant → 6e A ;
  exclus et départs non proposés), **à valider** en lot ; échéances créées.

### 4.4 Frais, services et caisses ✅
- **Frais obligatoires** (inscription, mensualités, APE…) dus dès l'inscription, par niveau ; **réduction** en %
  sur la scolarité (fratrie, bourse…).
- **Services à la carte** : transport (par zone), cantine, études surveillées, garderie, clubs, sorties,
  examens… dus seulement par les élèves inscrits au service ; échéances à partir du mois en cours ; à l'arrêt,
  les mois futurs non payés sont retirés, l'échu reste dû.
- **Paiement** : espèces, Wave, Orange Money, Free Money, virement, chèque, porte-monnaie de la carte ;
  partiel accepté, imputé aux échéances les plus anciennes sauf choix.
- **Reçu** au numéro séquentiel sans trou ; un paiement **ne se supprime jamais**, il s'**annule** avec motif.
- **Impayés** (relance WhatsApp en un clic), **caisse du jour**.
- **Caisses** : celle de l'école est **comptabilisée** ; le foyer des élèves, la coopérative… sont **hors
  comptabilité**. Rapport des recettes par caisse ; l'argent des porte-monnaie est un **dépôt des familles**,
  pas une recette.
- Relances SMS automatiques ; facturation automatique des écoles par la console. ⏳

### 4.5 Notes, résultats et bulletins ✅
- Cours = classe + matière + coefficient + enseignant. Saisie par l'enseignant du cours ou le surveillant de la
  classe (validation par l'enseignant si l'école le demande).
- **Journal des notes chaîné** (SHA-256) : toute modification en base est détectée.
- Barème /10 ou /20, trimestres ou semestres, poids devoirs/composition : réglés par l'école.
- Moyennes pondérées, rangs (ex aequo), mentions, statistiques de classe.
- **Conseil de classe** : verrouille la période et émet des **bulletins signés (Ed25519)** avec **QR code**
  vérifiable publiquement.
- **Réouverture** du conseil (droit dédié, motif obligatoire, historique) : les bulletins émis sont **annulés,
  jamais effacés** ; leur QR indique « annulé, version corrigée émise » ; le conseil suivant émet les versions
  corrigées.
- Bulletin imprimable (PDF par l'impression du navigateur). Fichier PDF généré côté serveur. ⏳

### 4.6 Absences et assiduité 🟡
- Appel par classe et par demi-journée ; retards ; justification avec motif. ✅
- Passages enregistrés à chaque contrôle de carte (portail, activités). ✅
- Appel **hors ligne**, sanctions, notification automatique des parents. ⏳

### 4.7 Emploi du temps ✅
- Créneaux par classe ; **chevauchements refusés** (même classe, même enseignant, même salle).
- Emploi du temps personnel de l'enseignant ; visible par les familles.

### 4.8 Carte scolaire ✅
- Créée **automatiquement** pour chaque élève ; photo prise au téléphone ; planche d'impression au format
  carte bancaire (85,6 × 54 mm) ; **carte virtuelle** sur le téléphone du parent.
- **QR signé (Ed25519)** : impossible à imiter ; une carte d'une autre école est refusée.
- **Réémission** (perte, vol) : l'ancienne carte est refusée partout.
- **Contrôle à l'entrée** (caméra du téléphone ou saisie du numéro) : photo, droit d'accès, « à jour » ou
  « retard de X » ; **refus en cas d'impayé** au choix de l'école, avec seuil.
- Carte **NFC** (MIFARE DESFire EV2/EV3 ; MIFARE Classic exclu) ; **mode hors ligne** du contrôle. ⏳

### 4.9 Porte-monnaie 🟡
- **Grand livre** : mouvements jamais modifiés ni effacés, **chaînés (SHA-256)**, solde jamais négatif. ✅
- Recharge au guichet (espèces, ou Wave/OM reçu par l'école avec référence). ✅
- Achats aux **points de vente** (cantine, boutique d'uniformes, librairie) avec articles ; tickets ;
  frais scolaires payés depuis le porte-monnaie ; annulation = remboursement tracé. ✅
- **Parent** : solde, historique, **plafond par jour**, **blocage** (carte perdue). ✅
- **Recharge en ligne idempotente** (un paiement = un crédit) : parcours complet démontré par un **simulateur**,
  limité à l'école de démo. ✅
- Branchement réel Wave / Orange Money (comptes marchands et clés API de l'école) ; plafond par semaine ;
  catégories autorisées ; notification de chaque achat. ⏳
- Montage financier à valider juridiquement (réglementation **BCEAO** sur la monnaie électronique) ; les fonds
  doivent rester sur le compte marchand de l'école. ⏳

### 4.10 Cantine et boutique 🟡
- Forfait cantine (service à la carte) **ou** paiement au repas par la carte ; boutique d'uniformes en point
  de vente. ✅
- Menus de la semaine, allergies visibles à la cantine, **tailles et stock**, commandes en ligne,
  passage cantine hors ligne. ⏳

### 4.11 Activités et billetterie ✅
- Activité : prix, places, niveaux invités, caisse des recettes (souvent **hors comptabilité**).
- Ticket acheté par le parent (porte-monnaie) ou vendu au guichet ; **ticket d'invité** à QR signé.
- L'élève entre **avec sa carte** ; un ticket ne sert **qu'une fois** ; bilan des ventes et des entrées.

### 4.12 Espace famille ✅
- Pour chaque enfant : notes et moyennes provisoires, évaluations prévues, emploi du temps, bulletins,
  absences, échéances, services, reçus, porte-monnaie, activités.
- Un parent = un compte pour tous ses enfants. Alertes (note faible, absence), notifications. ⏳

### 4.13 Élections du gouvernement scolaire ⏳
- Postes, candidats, corps électoral ; un élève = un vote par poste.
- **Secret du vote** : liste d'émargement et urne séparées ; personne ne peut relier un vote à un élève.
- Nécessite les **comptes élèves**.

## 5. Exigences non fonctionnelles

| Exigence | État |
|---|---|
| Isolation par schéma ; jetons JWT liés à l'école (claim `schema`) | ✅ |
| Permissions vérifiées côté serveur ; limitation des tentatives de connexion | ✅ |
| Signatures Ed25519 (bulletins, cartes, tickets), clé par école dérivée par HKDF | ✅ |
| Journaux chaînés SHA-256 (notes, porte-monnaie) | ✅ |
| HTTPS (Caddy / Render), en-têtes de sécurité | ✅ |
| Mobile d'abord (barre du bas, scanner au téléphone) | ✅ |
| Application installable (PWA), fonctionnement hors ligne | ⏳ |
| Design inspiré d'AP2A Impact, mode clair/sombre, couleurs de l'école | ✅ |
| Sauvegarde quotidienne et restauration école par école (serveur dédié) | ✅ |
| Sauvegarde sur l'hébergement gratuit (Neon : export manuel documenté) | 🟡 |
| **Données personnelles** : déclaration à la CDP (Sénégal) et aux autorités des autres pays (ARTCI, APDP…) | ⏳ |
| Tests automatiques à chaque envoi (104 tests backend + construction de l'interface) | ✅ |

## 6. Hébergement

| Option | État |
|---|---|
| Serveur dédié (VPS) : Docker, Caddy (HTTPS automatique par école), sauvegardes | ✅ |
| Oracle Cloud gratuit + DuckDNS (guide) | ✅ (carte bancaire exigée) |
| **Render + Neon** gratuit, écoles sur `/e/<code>` | ✅ en ligne (mise en veille après inactivité) |

## 7. Feuille de route

| Phase | Contenu | État |
|---|---|---|
| 0 | Socle multi-tenant, marque blanche, console, forfaits, factures | ✅ |
| 1a–1c | Droits, inscriptions, frais, reçus, caisse ; notes, bulletins signés, absences ; design | ✅ |
| 2a | Rôles personnalisés, familles et tuteurs, espace famille, enseignants, emploi du temps | ✅ |
| 2b | Services à la carte, caisses, carte QR, porte-monnaie, cantine/boutique, activités, contrôle d'accès | ✅ |
| — | Réouverture de conseil, multi-pays, rentrée scolaire (reconduction, décisions, réinscriptions), comptes | ✅ |
| 2c | **Recharge Wave / Orange Money réelle**, **comptes élèves**, connexion par téléphone, SMS/WhatsApp | ⏳ |
| 3 | Menus cantine, stock boutique, hors ligne (appel, cantine, contrôle), PWA, alertes et notifications | ⏳ |
| 4 | Élections, NFC, langues (anglais, arabe), conformité CDP/BCEAO, **écoles pilotes** | ⏳ |
