# Étude : génération automatique des emplois du temps

> Étude préalable (novembre 2026), puis implémentation (section 8). Décisions validées avec le porteur du projet.

## 1. Le problème

Placer chaque séance de chaque classe dans la semaine en respectant des contraintes : c'est le problème
d'**emploi du temps scolaire** (*school timetabling*), **NP-difficile**. On ne cherche pas toutes les
combinaisons : un **solveur de contraintes** trouve de très bonnes solutions en quelques secondes.

## 2. Décisions

| Question | Décision |
|---|---|
| Découpage | **Heures de 1 h** ; une séance de 2 h occupe deux créneaux consécutifs de la même demi-journée |
| Salles | **Salles spécialisées seulement** (labo, salle info, terrain) ; chaque classe garde sa salle |
| Disponibilités | Saisies par **la direction et par chaque professeur** depuis son compte ; la direction valide |
| Confort | **Matières lourdes le matin**, **peu de trous pour les professeurs**, **matière répartie sur la semaine** |
| Solveur | **OR-Tools CP-SAT** (Google, gratuit) |

## 3. Données à saisir

1. **Grille de l'école** : créneaux ouverts cochés sur une grille jours × heures (ex. 8 h – 13 h tous les
   matins, 15 h – 17 h sauf mercredi et samedi).
2. **Qui enseigne quoi** : professeur de chaque matière de chaque classe (existe déjà : « Classes et matières »).
3. **Volume horaire** : heures par semaine de chaque matière dans chaque classe, et découpage en séances
   (ex. maths 5 h = 2 + 2 + 1 ; EPS 2 h d'un bloc).
4. **Disponibilités** : sur la même grille, chaque professeur coche *indisponible* ou *préféré*.
5. **Salles spécialisées** : nombre de labos, de salles info, de terrains, et matières qui en ont besoin.

## 4. Modèle mathématique (CP-SAT)

- **Variables** : `y[s, j, h] ∈ {0, 1}` vaut 1 si la séance *s* commence le jour *j* à l'heure *h*
  (créée seulement si la séance tient dans une demi-journée ouverte et si le professeur est disponible).
- **Contraintes dures** :
  - chaque séance est placée exactement une fois : `Σ_{j,h} y[s,j,h] = 1` ;
  - à chaque créneau, au plus une séance par classe et par professeur ;
  - au plus *k* séances par salle spécialisée, si l'école en a *k*.
- **Objectif** (pénalités à minimiser) : `3 × (séances de matières lourdes l'après-midi) + 2 × (trous des professeurs)
  + 5 × (séances en trop d'une même matière le même jour) + 1 × (heures hors des créneaux préférés d'un professeur)`.
  La répartition sur la semaine est une pénalité forte plutôt qu'une contrainte dure : une école très chargée
  obtient quand même un emploi du temps, et le point faible est signalé.
  Un trou est compté comme un « bloc » de cours supplémentaire dans une demi-journée.
- **Plusieurs propositions** : après chaque solution, on impose que la suivante diffère d'au moins 25 % des
  placements, puis on relance.

## 5. Mesures du prototype (machine de développement, 2 cœurs, 30 s maximum par proposition)

| École | Séances | Résultat | Temps par proposition |
|---|---|---|---|
| 8 classes, 10 professeurs, 1 labo | 124 | 3 propositions optimales | 0,5 à 0,7 s |
| 16 classes, 22 professeurs, **1 labo** | 248 | **impossible** (48 h de labo pour 38 créneaux) | — |
| 16 classes, 22 professeurs, 2 labos | 248 | 3 propositions optimales | 2 à 3 s |
| 24 classes, 34 professeurs, 1 terrain | 372 | **impossible, détecté avant calcul** (48 h d'EPS pour 38 créneaux) | 2 s pour le prouver |

- **Mémoire maximale : 173 Mo** pour 16 classes, compatible avec les 512 Mo de Render.
- **Taille d'OR-Tools : 80 Mo** dans l'image Docker.
- Conclusion : faisable pour les écoles visées (10 à 30 classes). Le **diagnostic avant calcul** est
  indispensable : sur des données impossibles, il explique la cause au lieu de laisser le solveur échouer.

## 6. Diagnostics à afficher avant de générer

- Une classe a plus d'heures de cours que de créneaux ouverts.
- Un professeur a plus d'heures à donner que d'heures disponibles.
- Une salle spécialisée est demandée plus d'heures qu'elle n'en offre.
- Un cours n'a pas de professeur, ou pas de volume horaire.
- Une séance de 2 h ne tient dans aucune demi-journée où le professeur est disponible.

## 7. Parcours prévu

1. Grille horaire de l'école et volumes horaires (Matières et cours).
2. Disponibilités des professeurs (fiche enseignant et compte du professeur).
3. Salles spécialisées.
4. Génération en tâche de fond (barre de progression) : diagnostic, puis 3 propositions notées avec
   leurs points faibles.
5. Comparaison (par classe, par professeur), ajustement à la main (conflits refusés), **publication** :
   la proposition retenue devient l'emploi du temps visible des enseignants et des familles.

## 8. Implémentation

| Élément | Fichier |
|---|---|
| Modèles : grille, salles spécialisées, volume et découpage des cours, disponibilités, générations | `backend/pedagogie/models.py` |
| Diagnostic, modèle CP-SAT, numérotation des salles, publication | `backend/pedagogie/generation.py` |
| API (`/api/edt/…`) | `backend/pedagogie/edt.py` |
| Écran « Générer les emplois du temps » (5 étapes) | `frontend/src/pages/GenerateurEDT.tsx` |
| « Mes disponibilités » (professeur) | `frontend/src/pages/EmploiDuTemps.tsx` |
| Tests | `backend/tests/test_emploi_du_temps.py` |

**API** (droit `emploi_du_temps.gerer`, sauf mention) :

- `GET/PUT /api/edt/grille` : heures de début et créneaux ouverts `[[jour, indice], …]` (lecture : `eleves.voir`).
- `/api/edt/salles` : salles spécialisées (nom, nombre). Une matière est rattachée à une salle par `PATCH /api/matieres/<id> {salle}` ;
  `lourde` se règle de la même façon. Volume et découpage : `PATCH /api/cours/<id> {volume_horaire, decoupage: "2+2+1"}`.
- `GET /api/edt/disponibilites` ; `PUT /api/edt/disponibilites/<prof>` (saisie directe, validée) ;
  `POST /api/edt/disponibilites/<prof>` (valider la proposition, ou `{refuser: true}`).
- `GET/PUT /api/edt/mes-disponibilites` : le professeur propose (tout compte enseignant).
- `GET /api/edt/diagnostic` : charge et impossibilités, avant tout calcul.
- `POST /api/edt/generations` (202) lance le calcul dans un fil d'exécution séparé ; `GET /api/edt/generations[/<id>]`
  donne l'avancement (`progression`) puis les propositions notées et leurs points faibles. Un calcul « en cours »
  depuis plus de 6 minutes (redémarrage du serveur) passe en échec à la lecture suivante.
- `POST /api/edt/generations/<id>/publier {proposition}` : remplace les créneaux de l'année par la proposition retenue.

**Démo** : volumes de toutes les matières, un laboratoire (SVT) et un terrain (EPS), professeure d'anglais vacataire
indisponible lundi et mardi, proposition du professeur de maths à valider (mercredi matin libre). Calcul : 60 séances,
3 propositions optimales en 2 s.
