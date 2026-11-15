#!/usr/bin/env bash
# Pose les identifiants Instagram (application Meta) dans /srv/saas/clippeak/.env.local du serveur (lus par le site ET par le worker, jamais affiches).
# A lancer SUR LE VPS : cd /srv/saas/clippeak && bash scripts/ops/vps-instagram.sh
# Les deux valeurs sont saisies MASQUEES (ou arrivent par l'entree standard, 2 lignes) : ID de l'app Instagram, puis secret de l'app Instagram
# (tableau de bord Meta > Instagram > API setup with Instagram login > Business login settings).
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
PUBLIC_URL=https://clippeak.sassify.fr
if [ -t 0 ]; then
  read -rsp "ID de l'app Instagram : " ID; echo
  read -rsp "Secret de l'app Instagram : " SECRET; echo
else
  read -r ID; read -r SECRET
fi
[ -n "$ID" ] && [ -n "$SECRET" ] || { echo "ID ou secret vide."; exit 1; }
case "$ID$SECRET" in *[[:space:]]*|*\"*|*\'*) echo "Valeur invalide (espace ou guillemet)."; exit 1 ;; esac
[ -f "$ENVFILE" ] || { echo "$ENVFILE introuvable"; exit 1; }
install -d -m 700 /root/env-backups
cp -p "$ENVFILE" "/root/env-backups/clippeak.env.local.$(date +%Y%m%d-%H%M)"

# Pose ou remplace des variables dans un fichier d'environnement (les autres lignes restent intactes).
setvars() {
  local file="$1"; shift
  local tmp; tmp="$(mktemp)"
  local pattern="^($(printf '%s|' "$@" | sed 's/|$//' | sed 's/=[^|]*//g'))="
  grep -vE "$pattern" "$file" > "$tmp" || true
  { cat "$tmp"; printf '%s\n' "$@"; } > "$file"
  rm -f "$tmp"; chmod 600 "$file"
}
setvars "$ENVFILE" "INSTAGRAM_APP_ID=$ID" "INSTAGRAM_APP_SECRET=$SECRET"
grep -q '^CLIPPEAK_PUBLIC_URL=' "$ENVFILE" || printf '%s\n' "CLIPPEAK_PUBLIC_URL=$PUBLIC_URL" >> "$ENVFILE"
echo "Identifiants Instagram enregistres (ID de $(printf '%s' "$ID" | wc -c) caracteres)."

# Le worker lit /etc/clippeak/worker.env : memes valeurs, et l'adresse publique (Meta telecharge la video depuis le site).
WORKERENV=/etc/clippeak/worker.env
if [ -f "$WORKERENV" ]; then
  setvars "$WORKERENV" "INSTAGRAM_APP_ID=$ID" "INSTAGRAM_APP_SECRET=$SECRET"
  grep -q '^CLIPPEAK_PUBLIC_URL=' "$WORKERENV" || printf '%s\n' "CLIPPEAK_PUBLIC_URL=$PUBLIC_URL" >> "$WORKERENV"
  echo "Identifiants aussi poses pour le worker."
fi
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
pm2 reload clippeak-worker --update-env >/dev/null 2>&1 && echo "Worker recharge." || echo "Worker non recharge : relance-le a la main."
