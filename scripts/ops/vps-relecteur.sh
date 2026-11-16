#!/usr/bin/env bash
# Ouvre ou ferme l'acces de l'equipe de relecture de Meta (page /relecteur) : pose ou retire REVIEWER_CODE dans /srv/saas/clippeak/.env.local (lu par le site).
# A lancer SUR LE VPS :
#   cd /srv/saas/clippeak && bash scripts/ops/vps-relecteur.sh        # ouvre : le code est saisi MASQUE (12 caracteres au moins, sans espace ni guillemet)
#   cd /srv/saas/clippeak && bash scripts/ops/vps-relecteur.sh off    # ferme : la page /relecteur repond 404
# Les droits du fichier ne sont pas modifies (on ecrit dedans).
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
[ -f "$ENVFILE" ] || { echo "$ENVFILE introuvable"; exit 1; }
install -d -m 700 /root/env-backups
cp -p "$ENVFILE" "/root/env-backups/clippeak.env.local.$(date +%Y%m%d-%H%M)"

if [ "${1:-}" = "off" ]; then
  tmp="$(mktemp)"
  grep -v '^REVIEWER_CODE=' "$ENVFILE" > "$tmp" || true
  cat "$tmp" > "$ENVFILE"; rm -f "$tmp"
  echo "Acces relecteur FERME."
else
  if [ -t 0 ]; then
    read -rsp "Code d'acces pour les relecteurs de Meta (masque, 12 caracteres au moins) : " CODE; echo
  else
    read -r CODE
  fi
  [ "${#CODE}" -ge 12 ] || { echo "Code trop court (12 caracteres au moins)."; exit 1; }
  case "$CODE" in *[[:space:]]*|*\"*|*\'*) echo "Valeur invalide (espace ou guillemet)."; exit 1 ;; esac
  tmp="$(mktemp)"
  grep -v '^REVIEWER_CODE=' "$ENVFILE" > "$tmp" || true
  { cat "$tmp"; printf '%s\n' "REVIEWER_CODE=$CODE"; } > "$ENVFILE"; rm -f "$tmp"
  echo "Acces relecteur OUVERT (code de ${#CODE} caracteres). Page : https://clippeak.sassify.fr/relecteur"
fi
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
