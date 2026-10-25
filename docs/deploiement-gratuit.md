# Mise en ligne gratuite : Oracle Cloud + DuckDNS

> Oracle demande une carte bancaire. Sans carte, voir plutôt [Render + Neon](deploiement-render.md).

Objectif : NexusEcole en ligne, **gratuitement**, avec HTTPS, pour faire des démonstrations
et accueillir des écoles pilotes.

| Brique | Service gratuit | Ce qu'il fournit |
|---|---|---|
| Serveur | **Oracle Cloud « Always Free »** | une machine Ubuntu permanente |
| Nom de domaine | **DuckDNS** | `nexusecole.duckdns.org` et tous ses sous-domaines |
| Certificats HTTPS | **Let's Encrypt** (via Caddy) | automatiques, renouvelés seuls |

Résultat : la console sur `https://admin.nexusecole.duckdns.org`, chaque école sur
`https://nomecole.nexusecole.duckdns.org`.

> **À savoir avant de commencer**
> - Oracle demande une **carte bancaire pour vérifier votre identité** (pas de prélèvement
>   tant que vous restez sur les ressources « Always Free »).
> - Les conditions des offres gratuites peuvent changer : relisez-les à l'inscription.
>   Oracle indique notamment pouvoir récupérer les machines gratuites restées **inactives**
>   longtemps ; gardez des sauvegardes hors du serveur (étape 9).
> - Les menus d'Oracle changent souvent de place : si un libellé diffère, cherchez le mot-clé indiqué.
> - Serveur hors du Sénégal = données transférées à l'étranger : avant de mettre de **vraies**
>   données d'élèves, faites la déclaration à la CDP.

Durée totale : environ 1 h la première fois. Si une étape bloque, notez le message exact.

---

## Étape 1 – Réserver le domaine gratuit (DuckDNS) · 5 min

1. Allez sur **https://www.duckdns.org** et connectez-vous (avec GitHub ou Google).
2. Dans « sub domain », tapez `nexusecole` (ou un autre nom s'il est pris), puis **add domain**.
3. Laissez la page ouverte : vous y mettrez l'adresse IP du serveur à l'étape 4.

DuckDNS fait pointer `nexusecole.duckdns.org` **et tous ses sous-domaines**
(`lycee-demo.nexusecole.duckdns.org`, `admin.nexusecole.duckdns.org`…) vers la même IP :
c'est exactement ce dont NexusEcole a besoin.

## Étape 2 – Créer le compte Oracle Cloud · 15 min

1. Allez sur **https://www.oracle.com/cloud/free/** → *Start for free*.
2. Remplissez le formulaire. **Région d'origine (Home Region)** : choisissez une région d'Europe
   (la plus proche de Dakar). ⚠️ Elle ne pourra plus être changée.
3. Vérification de la carte bancaire, puis attendez l'e-mail confirmant que le compte est actif.

## Étape 3 – Créer le serveur · 15 min

Dans la console Oracle : menu ☰ → **Compute** → **Instances** → **Create instance**.

1. **Name** : `nexusecole`.
2. **Image** : cliquez *Change image* → **Ubuntu** → **Canonical Ubuntu 24.04**.
3. **Shape** : *Change shape* → **Ampere** → `VM.Standard.A1.Flex`, **2 OCPU et 12 Go** de mémoire
   (dans la limite gratuite).
   - Message « Out of capacity » ? Réessayez plus tard ou dans un autre *Availability domain*,
     ou prenez à défaut la petite machine gratuite `VM.Standard.E2.1.Micro` (1 Go : le script de
     l'étape 6 ajoute automatiquement de la mémoire de secours).
4. **Networking** : laissez créer un réseau (VCN) et vérifiez que **Assign a public IPv4 address** est coché.
5. **Add SSH keys** : **Generate a key pair for me** → **Save private key**.
   Rangez ce fichier (ex. `C:\Users\pc\.ssh\nexusecole.key`) : **sans lui, plus d'accès au serveur.**
6. **Create**. Quand l'instance est *Running*, notez son **Public IP address** (ex. `141.145.x.x`).

### Ouvrir le web dans le pare-feu Oracle

Oracle a un pare-feu réseau qui ne laisse passer que SSH. Sur la page de l'instance :
cliquez sur le **Subnet** → **Security Lists** (ou *Security*) → la liste par défaut →
**Add Ingress Rules**, deux règles :

| Source CIDR | Protocole | Port de destination |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

(Le second pare-feu, celui d'Ubuntu, sera ouvert par le script de l'étape 6.)

## Étape 4 – Relier le domaine au serveur · 2 min

Sur **duckdns.org**, dans la ligne `nexusecole`, champ **current ip** : collez l'IP publique du serveur
→ **update ip**.

Vérification depuis PowerShell (quelques minutes peuvent être nécessaires) :

```powershell
nslookup lycee-demo.nexusecole.duckdns.org
```

La réponse doit contenir l'IP du serveur.

## Étape 5 – Se connecter au serveur (PowerShell) · 5 min

```powershell
ssh -i C:\Users\pc\.ssh\nexusecole.key ubuntu@141.145.x.x
```

Tapez `yes` à la première question. Message **« UNPROTECTED PRIVATE KEY FILE »** ? Restreignez le fichier
à votre seul compte Windows, puis relancez la commande `ssh` :

```powershell
icacls C:\Users\pc\.ssh\nexusecole.key /inheritance:r
icacls C:\Users\pc\.ssh\nexusecole.key /grant:r "$($env:USERNAME):(R)"
```

Vous êtes connecté quand l'invite devient `ubuntu@nexusecole:~$`. Toutes les commandes suivantes
se tapent **sur le serveur**.

## Étape 6 – Préparer le serveur (une commande) · 10 min

Le dépôt est privé : créez d'abord un **jeton GitHub en lecture seule**
(GitHub → Settings → Developer settings → *Fine-grained tokens* → *Generate new token* →
*Repository access* : `nexusecole` → *Contents* : **Read-only**). Copiez le jeton.

```bash
git clone https://github.com/AlsenyTECH/nexusecole.git
# Username : AlsenyTECH — Password : collez le jeton
cd nexusecole
sudo bash deploy/preparer-serveur.sh
```

Le script met le système à jour, **ouvre les ports 80 et 443** dans le pare-feu d'Ubuntu, installe Docker
et ajoute de la mémoire de secours si besoin. Il peut être relancé sans risque.
À la fin : tapez `exit`, puis reconnectez-vous (étape 5) et `cd nexusecole`.

## Étape 7 – Configurer NexusEcole · 5 min

```bash
cp deploy/env.production.example .env
# Domaine DuckDNS (remplacez nexusecole si vous avez choisi un autre nom)
sed -i 's|^BASE_DOMAIN=.*|BASE_DOMAIN=nexusecole.duckdns.org|; s|^PUBLIC_DOMAIN=.*|PUBLIC_DOMAIN=admin.nexusecole.duckdns.org|' .env
# Secrets générés aléatoirement (hexadécimal)
for v in SECRET_KEY JWT_SIGNING_KEY BULLETIN_SIGNING_SECRET POSTGRES_PASSWORD; do
  sed -i "s|^$v=.*|$v=$(openssl rand -hex 32)|" .env
done
# Votre e-mail pour Let's Encrypt
sed -i 's|^ACME_EMAIL=.*|ACME_EMAIL=votre.email@exemple.com|' .env
cat .env
```

> ⚠️ Copiez le contenu de `.env` dans un endroit sûr (gestionnaire de mots de passe).
> **`BULLETIN_SIGNING_SECRET` ne doit jamais changer**, sinon les bulletins déjà émis ne se vérifient plus.

## Étape 8 – Lancer · 10 à 15 min (la première fois)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Les 4 services (`db`, `backend`, `web`, `sauvegarde`) doivent être *Up*.
Créez ensuite la console et votre compte super-admin (le mot de passe vous est demandé) :

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py init_plateforme --email votre.email@exemple.com
```

Ouvrez **https://admin.nexusecole.duckdns.org** : la première visite prend quelques secondes
(obtention du certificat HTTPS), puis la page de connexion de la console s'affiche.

### Option : une école de démonstration remplie

Pour montrer l'application à des écoles, vous pouvez ajouter le « Lycée Démo » avec ses élèves,
frais, notes et absences :

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py demarrage_dev
```

Il sera sur `https://lycee-demo.nexusecole.duckdns.org` (comptes `directeur@lycee-demo.sn`,
`caisse@…`, `prof@…`, `surveillant@…`, mot de passe `Demo-Nexus-2026`).
⚠️ Ces mots de passe sont publics (ils sont dans le code) : réservez cette école à la démonstration.

## Étape 9 – Sauvegardes hors du serveur

Le serveur fait une sauvegarde chaque jour dans `~/nexusecole/sauvegardes`. Récupérez-les
régulièrement sur votre PC (depuis **PowerShell**, pas depuis le serveur) :

```powershell
mkdir C:\Users\pc\nexusecole-sauvegardes -Force
scp -i C:\Users\pc\.ssh\nexusecole.key "ubuntu@141.145.x.x:nexusecole/sauvegardes/*.dump" C:\Users\pc\nexusecole-sauvegardes\
```

## Mettre à jour plus tard

Quand de nouvelles fonctionnalités sont poussées sur GitHub :

```bash
cd ~/nexusecole
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Les migrations de toutes les écoles s'appliquent automatiquement au redémarrage.

## En cas de problème

| Symptôme | Piste |
|---|---|
| La page ne répond pas du tout | ports 80/443 ouverts dans la **Security List** Oracle (étape 3) ? `sudo iptables -S INPUT \| grep dport` sur le serveur ? |
| Erreur de certificat / « connexion non sécurisée » | DNS pas encore propagé (étape 4) ; voir `docker compose -f docker-compose.prod.yml logs web` |
| « Établissement introuvable » | l'école n'existe pas encore : créez-la dans la console |
| Un service n'est pas *Up* | `docker compose -f docker-compose.prod.yml logs backend` et envoyez-moi les dernières lignes |

Pour la suite (vrai domaine, autre hébergeur), voir [deploiement.md](deploiement.md) : la configuration est la même.
