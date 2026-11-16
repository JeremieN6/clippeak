#!/usr/bin/env bash
# Pose les identifiants Instagram (application Meta, connexion unifiee) dans /srv/saas/clippeak/.env.local du serveur (lus par le site ET par le worker, jamais affiches).
# A lancer SUR LE VPS : cd /srv/saas/clippeak && bash scripts/ops/vps-instagram.sh
# Trois valeurs (ou 3 lignes sur l'entree standard) : ID de l'app Meta (visible), secret de l'app Meta (MASQUE), ID de configuration (visible).
# ID et secret : tableau de bord Meta > Parametres de l'app > General. ID de configuration : Instagram > API setup with Unified login > 1. Configurez.
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
PUBLIC_URL=https://clippeak.sassify.fr
if [ -t 0 ]; then
  read -rp "ID de l'app Meta : " ID
  read -rsp "Secret de l'app Meta (masque) : " SECRET; echo
  read -rp "ID de configuration (Unified login) : " CONFIG
else
  read -r ID; read -r SECRET; read -r CONFIG
fi
[ -n "$ID" ] && [ -n "$SECRET" ] && [ -n "$CONFIG" ] || { echo "ID, secret ou configuration vide."; exit 1; }
case "$ID$SECRET$CONFIG" in *[[:space:]]*|*\"*|*\'*) echo "Valeur invalide (espace ou guillemet)."; exit 1 ;; esac
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
  rm -f "$tmp"  # on ecrit DANS le fichier : droits et proprietaire restent ceux d'origine (le worker doit pouvoir lire worker.env)
}
setvars "$ENVFILE" "INSTAGRAM_APP_ID=$ID" "INSTAGRAM_APP_SECRET=$SECRET" "INSTAGRAM_CONFIG_ID=$CONFIG"
grep -q '^CLIPPEAK_PUBLIC_URL=' "$ENVFILE" || printf '%s\n' "CLIPPEAK_PUBLIC_URL=$PUBLIC_URL" >> "$ENVFILE"
echo "Identifiants Instagram enregistres (ID de $(printf '%s' "$ID" | wc -c) caracteres)."

# Le worker lit /etc/clippeak/worker.env : memes valeurs, et l'adresse publique (Meta telecharge la video depuis le site).
WORKERENV=/etc/clippeak/worker.env
if [ -f "$WORKERENV" ]; then
  setvars "$WORKERENV" "INSTAGRAM_APP_ID=$ID" "INSTAGRAM_APP_SECRET=$SECRET" "INSTAGRAM_CONFIG_ID=$CONFIG"
  grep -q '^CLIPPEAK_PUBLIC_URL=' "$WORKERENV" || printf '%s\n' "CLIPPEAK_PUBLIC_URL=$PUBLIC_URL" >> "$WORKERENV"
  # le worker tourne sous l'utilisateur `clippeak` : root:clippeak 640 (voir DEPLOIEMENT-WORKER.md), jamais 600 sinon il ne demarre plus
  chown root:clippeak "$WORKERENV" && chmod 640 "$WORKERENV"
  echo "Identifiants aussi poses pour le worker."
fi
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
pm2 reload clippeak-worker --update-env >/dev/null 2>&1 && echo "Worker recharge." || echo "Worker non recharge : relance-le a la main."
