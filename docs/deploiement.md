# Mettre NexusEcole en ligne

Ce guide met NexusEcole en production sur **un serveur à vous (VPS)** :

```
                  ┌──────────────────────── VPS (Ubuntu) ─────────────────────────┐
 Internet ──443──►│ Caddy : HTTPS automatique  ──/api/*──► Django (gunicorn)       │
 *.votredomaine   │         + interface React              │                       │
                  │                                        ▼                       │
                  │                         PostgreSQL (un schéma par école)        │
                  │                         Sauvegarde quotidienne → ./sauvegardes  │
                  └────────────────────────────────────────────────────────────────┘
```

- Chaque école est sur `nomecole.votredomaine` ; la console sur `admin.votredomaine`.
- **Le certificat HTTPS de chaque école est obtenu automatiquement** (Let's Encrypt) à sa première
  visite, quelques secondes après sa création dans la console. Caddy ne demande un certificat que pour
  les domaines déclarés dans la console : impossible d'en obtenir pour un domaine inconnu.

> Les prix ci-dessous sont des ordres de grandeur : vérifiez-les chez le fournisseur au moment de l'achat.

---

## 1. Acheter le nom de domaine

| Choix | Exemple | Ordre de prix | Où |
|---|---|---|---|
| Domaine sénégalais | `nexusecole.sn` | plus cher, démarches auprès d'un registraire agréé | registraires agréés par le NIC Sénégal |
| Domaine international | `nexusecole.com` | environ 10 à 15 € par an | Namecheap, OVHcloud, Gandi, Cloudflare… |

Vérifiez la disponibilité du nom chez le registraire. Le `.sn` rassure les écoles sénégalaises ;
le `.com` est plus rapide à obtenir. On peut commencer en `.com` et ajouter le `.sn` plus tard.

## 2. Louer un serveur (VPS)

Configuration conseillée pour démarrer (jusqu'à plusieurs dizaines d'écoles) :
**Ubuntu 24.04, 2 processeurs, 4 Go de mémoire, 40 Go de disque** — environ 5 à 15 € par mois
selon le fournisseur (Hetzner, OVHcloud, DigitalOcean, Contabo…).

> **Données personnelles** : un serveur hors du Sénégal implique un transfert de données à l'étranger,
> à déclarer auprès de la CDP (loi n° 2008-12). Un hébergeur au Sénégal évite cette question ;
> renseignez-vous avant de mettre de vraies données d'élèves.

Notez l'**adresse IP** du serveur.

## 3. Configurer le DNS

Chez le registraire du domaine, créez ces enregistrements (remplacez l'IP) :

| Type | Nom | Valeur |
|---|---|---|
| A | `@` | `203.0.113.10` |
| A | `*` | `203.0.113.10` |

L'enregistrement `*` (« wildcard ») fait pointer **tous** les sous-domaines (chaque école, la console)
vers le serveur. La propagation prend de quelques minutes à quelques heures.
Vérification : `ping lycee-test.votredomaine` doit répondre avec l'IP du serveur.

## 4. Préparer le serveur

Connectez-vous (depuis PowerShell ou un terminal) : `ssh root@203.0.113.10`, puis :

```bash
# Mises à jour et pare-feu : seuls SSH, HTTP et HTTPS sont ouverts
apt update && apt upgrade -y
apt install -y git ufw unattended-upgrades
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable

# Docker (script officiel)
curl -fsSL https://get.docker.com | sh
```

## 5. Installer NexusEcole

Le dépôt est privé : créez un **jeton GitHub en lecture seule** (GitHub → Settings → Developer settings →
Fine-grained tokens → accès *Contents : Read-only* au dépôt `nexusecole`).

```bash
cd /opt
git clone https://github.com/AlsenyTECH/nexusecole.git
cd nexusecole
cp deploy/env.production.example .env
nano .env
```

Dans `.env`, renseignez votre domaine et générez **chaque secret** avec `openssl rand -base64 48` :

| Variable | Valeur |
|---|---|
| `BASE_DOMAIN` / `PUBLIC_DOMAIN` | `votredomaine` / `admin.votredomaine` |
| `SECRET_KEY`, `JWT_SIGNING_KEY`, `BULLETIN_SIGNING_SECRET`, `POSTGRES_PASSWORD` | un secret différent chacun |
| `ACME_EMAIL` | votre e-mail (alertes Let's Encrypt) |

> ⚠️ **`BULLETIN_SIGNING_SECRET` ne doit jamais changer** : les bulletins déjà émis ne se
> vérifieraient plus. Conservez une copie de `.env` hors du serveur (gestionnaire de mots de passe).

Lancez :

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend python manage.py init_plateforme --email vous@votredomaine
```

La seconde commande crée la console et votre compte super-admin (elle demande le mot de passe).

## 6. Première école

1. Ouvrez `https://admin.votredomaine` et connectez-vous.
2. **Écoles → Nouvelle école** : nom, sous-domaine (ex. `sainte-marie`), couleurs, directeur.
3. Ouvrez `https://sainte-marie.votredomaine` : le certificat HTTPS est obtenu à la première visite
   (quelques secondes), puis la page de connexion de l'école s'affiche.

## 7. Au quotidien

| Action | Commande (dans `/opt/nexusecole`) |
|---|---|
| Mettre à jour | `git pull && docker compose -f docker-compose.prod.yml up -d --build` (les migrations de toutes les écoles s'appliquent au démarrage) |
| Voir l'état | `docker compose -f docker-compose.prod.yml ps` |
| Journaux de l'API | `docker compose -f docker-compose.prod.yml logs -f backend` |
| Journaux HTTPS | `docker compose -f docker-compose.prod.yml logs -f web` |
| Redémarrer | `docker compose -f docker-compose.prod.yml restart` |

## 8. Sauvegardes

- Une sauvegarde complète (toutes les écoles) est faite **chaque jour** dans `/opt/nexusecole/sauvegardes`,
  conservée 14 jours. Une sauvegarde ratée ne laisse pas de fichier vide derrière elle.
- **Copiez-les hors du serveur** (un serveur peut tomber en panne) : par exemple chaque semaine sur votre PC
  avec `scp root@203.0.113.10:/opt/nexusecole/sauvegardes/*.dump .`, ou automatiquement vers un stockage
  externe (rclone).

**Restaurer** (vérifié sur une base neuve lors des tests) :

```bash
C="docker compose -f docker-compose.prod.yml"
# Tout restaurer dans une base de contrôle
$C exec -T db createdb -U nexus controle
$C exec -T db pg_restore -U nexus -d controle < sauvegardes/nexusecole-AAAA-MM-JJ-HHMM.dump
# Restaurer UNE seule école (son schéma), par ex. après une erreur de manipulation
$C exec -T db pg_restore -U nexus -d controle -n sainte_marie < sauvegardes/nexusecole-AAAA-MM-JJ-HHMM.dump
```

## 9. Liste de contrôle sécurité

- [ ] Secrets générés aléatoirement, `.env` jamais commité (il est dans `.gitignore`), copie de `.env` en lieu sûr
- [ ] Pare-feu : seuls 22, 80, 443 ouverts ; la base de données n'est pas exposée (aucun port publié)
- [ ] Connexion SSH par clé, mot de passe root désactivé (`PasswordAuthentication no`)
- [ ] Mises à jour de sécurité automatiques (`unattended-upgrades`)
- [ ] Sauvegardes copiées hors du serveur, restauration testée
- [ ] Déclaration du traitement à la CDP avant d'accueillir de vraies données d'élèves

## Ce qui a été vérifié

La configuration de production (`docker-compose.prod.yml`) a été lancée et testée, avec des certificats
locaux à la place de Let's Encrypt : HTTPS pour une école et la console, redirection HTTP → HTTPS,
refus d'un domaine inconnu, en-têtes de sécurité, accès direct à une page interne de l'application,
point d'autorisation interne non exposé, sauvegarde puis restauration dans une base neuve.
L'obtention réelle de certificats Let's Encrypt ne peut se vérifier qu'avec un vrai domaine.
