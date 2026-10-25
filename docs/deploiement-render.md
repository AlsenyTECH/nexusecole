# Mise en ligne gratuite : Render + Neon (sans carte bancaire)

Objectif : NexusEcole en ligne **gratuitement**, en HTTPS, sans serveur à administrer,
pour des démonstrations et des écoles pilotes.

| Brique | Service gratuit | Rôle |
|---|---|---|
| Application | **Render** (offre *Free*) | construit et lance NexusEcole depuis GitHub |
| Base de données | **Neon** (offre *Free*) | PostgreSQL hébergé (un schéma par école, comme en production) |

Résultat, avec une seule adresse `https://nexusecole.onrender.com` (le nom exact dépend de Render) :

| Espace | Adresse |
|---|---|
| Page d'accueil (saisie du code de l'école) | `https://nexusecole.onrender.com` |
| Console éditeur (vous) | `https://nexusecole.onrender.com/console` |
| Une école | `https://nexusecole.onrender.com/e/lycee-demo` |

> **Mode « chemin »** : sans nom de domaine à vous, les écoles ne peuvent pas avoir chacune
> leur sous-domaine. Elles sont donc identifiées par leur code dans l'adresse (`/e/<code>`).
> Le code, les données et la sécurité sont les mêmes qu'en production ; le jour où vous achetez
> un domaine, vous passez au mode sous-domaines ([deploiement.md](deploiement.md)).

> **À savoir avant de commencer** (conditions à relire à l'inscription, elles peuvent changer)
> - **Mise en veille** : sur l'offre gratuite, Render endort le service après une période sans visite
>   (de l'ordre de 15 minutes). La visite suivante attend son réveil, **environ 1 minute**.
>   Pour une démonstration, ouvrez l'adresse une minute avant.
> - **Neon** endort aussi la base inactive ; elle se réveille en quelques secondes, automatiquement.
> - Espace gratuit limité (de l'ordre de 0,5 Go chez Neon) : largement suffisant pour des écoles pilotes.
> - Serveurs hors du Sénégal : avant de mettre de **vraies** données d'élèves, faites la déclaration à la CDP.

Durée : environ 20 minutes. Aucune ligne de commande n'est nécessaire.

---

## Étape 1 – Créer la base de données (Neon) · 5 min

1. Allez sur **https://neon.tech** → *Sign up* → **Continue with GitHub** (le plus simple).
2. Créez un projet :
   - **Project name** : `nexusecole`
   - **Postgres version** : laissez la valeur proposée
   - **Region** : une région **Europe**, de préférence *AWS Europe Central 1 (Frankfurt)*
3. Sur le tableau de bord du projet, cliquez **Connect** (ou *Connection string*).
4. ⚠️ **Désactivez « Connection pooling »** (l'adresse ne doit **pas** contenir `-pooler`).
   NexusEcole range chaque école dans son propre schéma, ce que le mode « pooling » ne respecte pas.
5. Copiez l'adresse. Elle ressemble à :

   ```
   postgresql://neondb_owner:AbCd1234@ep-nom-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```

   Gardez-la de côté (c'est un mot de passe : ne la publiez nulle part).

## Étape 2 – Créer le compte Render · 3 min

1. Allez sur **https://render.com** → *Get Started* → **GitHub**.
2. Autorisez Render à lire vos dépôts. Si GitHub demande lesquels : choisissez
   *Only select repositories* → **nexusecole**.

## Étape 3 – Lancer NexusEcole (Blueprint) · 2 min + 10 min d'attente

Le fichier [`render.yaml`](../render.yaml) du dépôt décrit tout le service : Render le lit tout seul.

1. Dans Render : **New +** → **Blueprint**.
2. Choisissez le dépôt **AlsenyTECH/nexusecole** (branche `main`) → *Connect*.
3. Render affiche le service `nexusecole` et demande trois valeurs :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | l'adresse Neon copiée à l'étape 1 |
   | `SUPERADMIN_EMAIL` | votre e-mail (compte de la console) |
   | `SUPERADMIN_PASSWORD` | un mot de passe solide (12 caractères ou plus) |

   Les secrets (`SECRET_KEY`, `JWT_SIGNING_KEY`, `BULLETIN_SIGNING_SECRET`) sont **générés par Render** :
   vous n'avez rien à inventer.
4. **Apply**. Render construit l'application (environ 5 à 10 minutes la première fois) : suivez
   l'avancement dans l'onglet **Logs** du service. C'est prêt quand apparaît
   `Listening at: http://0.0.0.0:...` puis le statut **Live**.

Au premier démarrage, NexusEcole crée automatiquement la base, votre compte super-admin et le
**Lycée Démo** rempli (élèves, frais, paiements, notes, absences).

## Étape 4 – Vérifier · 3 min

L'adresse du service est affichée en haut de sa page Render (ex. `https://nexusecole.onrender.com`).

1. **`/api/sante-plateforme`** doit afficher `{"ok": true}`.
2. **`/console`** : connectez-vous avec `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`.
   Le tableau de bord et la liste des écoles s'affichent.
3. **`/e/lycee-demo`** : connectez-vous avec `directeur@lycee-demo.sn` / `Demo-Nexus-2026`
   (aussi `caisse@…`, `prof@…`, `surveillant@…`, même mot de passe).
4. La page d'accueil (adresse sans rien derrière) demande le **code de l'école** : tapez `lycee-demo`.

> ⚠️ Les mots de passe du Lycée Démo sont publics (ils sont dans le code) : réservez cette école
> à la démonstration. Pour un espace vide, mettez `DONNEES_DEMO` à `false` **avant** le premier
> lancement (l'école de démo déjà créée n'est pas supprimée ensuite).

## Étape 5 – Mettre en sécurité les secrets · 2 min

Dans Render → service `nexusecole` → **Environment** : copiez la valeur de
**`BULLETIN_SIGNING_SECRET`** dans un endroit sûr (gestionnaire de mots de passe).

**Elle ne doit jamais changer** : c'est d'elle que dépend la signature des bulletins. Si elle était
perdue ou modifiée, les bulletins déjà remis aux familles ne se vérifieraient plus.

## Créer une vraie école

Console → **Écoles → Nouvelle école**. Le champ « sous-domaine » devient le **code de l'école** :
`sainte-marie` donne l'adresse `https://nexusecole.onrender.com/e/sainte-marie`, affichée dans la liste.
Communiquez ce code à l'école : c'est ce que ses utilisateurs tapent sur la page d'accueil.

## Mettre à jour plus tard

Chaque `git push` sur `main` **redéploie automatiquement** l'application. Les migrations de toutes les
écoles s'appliquent au redémarrage, sans action de votre part. En cas d'échec de la construction,
Render garde l'ancienne version en ligne.

## Sauvegarder la base sur votre PC

Neon garde un court historique, mais faites aussi des copies chez vous, par exemple chaque semaine.
Depuis **PowerShell**, avec Docker Desktop lancé, dans le dossier de votre choix :

```powershell
docker run --rm -v "${PWD}:/out" postgres:17 pg_dump -Fc -f /out/nexusecole.dump "COLLEZ_ICI_L_ADRESSE_NEON"
```

Le fichier `nexusecole.dump` contient toutes les écoles. (L'image `postgres:17` sait sauvegarder
une base de version 17 ou antérieure.)

## En cas de problème

| Symptôme | Piste |
|---|---|
| La page met une minute à s'ouvrir | normal après une période sans visite (réveil du service gratuit) |
| *Deploy failed* : `DATABASE_URL manquant` ou `SUPERADMIN_… requis` | renseignez la variable dans **Environment**, puis *Manual Deploy* |
| Erreur de connexion à la base dans les **Logs** | adresse Neon complète ? sans `-pooler` ? avec `?sslmode=require` ? |
| « Établissement introuvable » | le code tapé ne correspond à aucune école : vérifiez-le dans la console |
| Autre chose | envoyez-moi les dernières lignes de l'onglet **Logs** |

## Ce qui a été vérifié

L'image Render a été construite et lancée en local avec une base PostgreSQL configurée comme Neon,
puis testée dans un navigateur : démarrage (migrations, super-admin, Lycée Démo), point de santé,
page d'accueil, console, connexion à une école, rechargement d'une page profonde, reçu ouvert dans un
nouvel onglet, conseil de classe et bulletin, vérification publique par QR code, et plusieurs écoles
plus la console ouvertes en même temps dans le même navigateur, chacune gardant sa session.
Le déploiement réel sur Render et Neon reste à faire de votre côté (étapes ci-dessus).
