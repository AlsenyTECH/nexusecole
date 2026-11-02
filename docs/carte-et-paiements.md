# Frais, services, carte scolaire et porte-monnaie

## Ce que l'école paramètre (sans développeur)

| Écran | Rôle |
|---|---|
| **Frais et services** | Frais **obligatoires** (inscription, mensualités, APE…) dus dès l'inscription ; **services à la carte** (transport par zone, cantine, études surveillées, garderie, clubs, sorties…) dus seulement par les élèves inscrits au service |
| **Fiche élève → Services** | Inscrire / arrêter un service : les échéances partent du mois en cours ; à l'arrêt, les mois à venir non payés sont retirés |
| **Caisses et points de vente** | Caisses (celle de l'école est comptabilisée ; foyer, coopérative… hors comptabilité), points de vente (cantine, boutique d'uniformes, librairie) et leurs articles, règles de la carte (refus d'entrée en cas de retard, plafond de dépenses par jour) |
| **Activités** | Activité payante (prix, places, niveaux invités, caisse des recettes), vente au guichet ou par les parents dans l'application |
| **Rôles et droits** | Qui contrôle les cartes, qui vend, qui recharge, qui gère les activités |

## Comment l'argent circule

| Flux | Où il va | Comptabilisé par l'école ? |
|---|---|---|
| Frais scolaires (tous moyens, y compris porte-monnaie) | Caisse de l'école | Oui |
| Recharge du porte-monnaie | Argent **des familles** en dépôt | Non : ce n'est pas une recette tant qu'il n'est pas dépensé |
| Achat à la cantine / boutique | Caisse du point de vente | Selon la caisse |
| Ticket d'activité | Caisse de l'activité (souvent le foyer) | Selon la caisse |

L'écran **Recettes par caisse** sépare ces montants et vérifie l'intégrité du grand livre.

## Sécurité (résumé technique)

- **QR des cartes et tickets signés** (Ed25519, clé par école dérivée par HKDF) : impossible de fabriquer une carte valide,
  une carte d'une autre école est refusée. Format : `NXC1.<école>.<numéro>.<version>.<signature>`.
- **Réémission** (perte, vol) : la version augmente, l'ancienne carte est refusée partout (révocation).
- **Porte-monnaie = grand livre** : mouvements jamais modifiés ni effacés, chaînés par SHA-256 ; solde jamais négatif
  (contrainte en base) ; écritures sérialisées (verrous) ; annulation = remboursement tracé.
- **Plafond journalier et blocage** décidés par l'école ou par le parent (carte perdue).
- **Recharge en ligne idempotente** : une confirmation rejouée ne crédite jamais deux fois.

## Recharge Wave / Orange Money : ce qu'il reste à brancher

Aujourd'hui : recharge **au guichet** (espèces, ou Wave/OM reçu sur le téléphone de l'école avec la référence),
et un **simulateur** qui montre le parcours parent complet.

Pour la recharge réelle depuis l'application, il faut :
1. un **compte marchand** chez chaque opérateur (Wave Business, Orange Money marchand…) et leurs **clés d'API** ;
2. écrire, pour chaque opérateur, sa classe dans `backend/carte/paiement_mobile.py` (création du paiement,
   vérification de la signature de ses notifications) — le reste (crédit unique, traçabilité) est déjà prêt.

⚠️ `PAIEMENT_MOBILE_SIMULATION` crédite **sans argent réel** : vide par défaut ; `lycee_demo` le limite à l'école de démonstration.
Ne jamais y mettre une vraie école.
