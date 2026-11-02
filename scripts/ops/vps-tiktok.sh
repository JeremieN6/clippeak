#!/usr/bin/env bash
# Pose les identifiants TikTok dans /srv/saas/clippeak/.env.local du serveur (lus a chaque demarrage par le site ET par le worker, jamais affiches).
# Lance depuis le PC par `bash scripts/ops/run-on-vps.sh tiktok` : les secrets sont saisis MASQUES et arrivent ici par l'entree standard.
# Entree standard, 2 lignes : Client key, Client secret (portail TikTok for Developers > ton application).
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
read -r KEY; read -r SECRET
[ -n "$KEY" ] && [ -n "$SECRET" ] || { echo "Client key ou Client secret vide."; exit 1; }
case "$KEY$SECRET" in *[[:space:]]*|*\"*|*\'*) echo "Valeur invalide (espace ou guillemet)."; exit 1 ;; esac
[ -f "$ENVFILE" ] || { echo "$ENVFILE introuvable"; exit 1; }
install -d -m 700 /root/env-backups
cp -p "$ENVFILE" "/root/env-backups/clippeak.env.local.$(date +%Y%m%d-%H%M)"
tmp="$(mktemp)"
grep -vE '^(TIKTOK_CLIENT_KEY|TIKTOK_CLIENT_SECRET)=' "$ENVFILE" > "$tmp" || true
{ cat "$tmp"; printf '%s\n' "TIKTOK_CLIENT_KEY=$KEY" "TIKTOK_CLIENT_SECRET=$SECRET"; } > "$ENVFILE"
rm -f "$tmp"; chmod 600 "$ENVFILE"
echo "Identifiants TikTok enregistres (cle de $(printf '%s' "$KEY" | wc -c) caracteres)."
# Le worker lit /etc/clippeak/worker.env : il faut y mettre les memes valeurs (voir DEPLOIEMENT-WORKER.md).
WORKERENV=/etc/clippeak/worker.env
if [ -f "$WORKERENV" ]; then
  tmp="$(mktemp)"
  grep -vE '^(TIKTOK_CLIENT_KEY|TIKTOK_CLIENT_SECRET)=' "$WORKERENV" > "$tmp" || true
  { cat "$tmp"; printf '%s\n' "TIKTOK_CLIENT_KEY=$KEY" "TIKTOK_CLIENT_SECRET=$SECRET"; } > "$WORKERENV"
  rm -f "$tmp"
  echo "Identifiants aussi poses pour le worker."
fi
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
pm2 reload clippeak-worker --update-env >/dev/null 2>&1 && echo "Worker recharge." || echo "Worker non recharge : relance-le a la main."
