#!/usr/bin/env bash
# Prépare un serveur Ubuntu (testé pour Oracle Cloud « Always Free ») à recevoir NexusEcole.
# Usage : sudo bash deploy/preparer-serveur.sh
# Le script peut être relancé sans risque : chaque étape vérifie si elle est déjà faite.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez ce script avec sudo : sudo bash deploy/preparer-serveur.sh" >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
UTILISATEUR="${SUDO_USER:-ubuntu}"

echo "==> 1/4 Mises à jour et outils"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq git curl iptables-persistent unattended-upgrades

echo "==> 2/4 Pare-feu du serveur : ouverture du web (80 et 443)"
# Les images Ubuntu d'Oracle bloquent tout sauf SSH dans iptables. On ajoute les règles une seule fois.
ouvrir() {
  local proto="$1" port="$2"
  if ! iptables -C INPUT -p "$proto" --dport "$port" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null; then
    iptables -I INPUT -p "$proto" --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
    echo "    port $port/$proto ouvert"
  else
    echo "    port $port/$proto déjà ouvert"
  fi
}
ouvrir tcp 80
ouvrir tcp 443
ouvrir udp 443   # HTTP/3
netfilter-persistent save >/dev/null
echo "    règles enregistrées (conservées au redémarrage)"

echo "==> 3/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "    déjà installé : $(docker --version)"
fi
usermod -aG docker "$UTILISATEUR"

echo "==> 4/4 Mémoire de secours (swap) pour les petites machines"
memoire_mo=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if swapon --show | grep -q .; then
  echo "    swap déjà présent"
elif [ "$memoire_mo" -lt 3000 ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "    swap de 2 Go créé (mémoire : ${memoire_mo} Mo)"
else
  echo "    inutile (mémoire : ${memoire_mo} Mo)"
fi

echo
echo "Serveur prêt. Déconnectez-vous puis reconnectez-vous (pour utiliser docker sans sudo),"
echo "puis suivez l'étape suivante du guide docs/deploiement-gratuit.md."
