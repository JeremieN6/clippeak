#!/usr/bin/env bash
# Pose l'identifiant du prix ANNUEL Creator dans /srv/saas/clippeak/.env.local du serveur (STRIPE_PRICE_CREATOR_YEARLY).
# Lance depuis le PC par `bash scripts/ops/run-on-vps.sh stripe-annuel`. Un identifiant de prix n'est pas un secret.
# Entree standard, 1 ligne : identifiant du prix annuel (price_...), ou « none » pour retirer l'offre annuelle.
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
read -r PRICE
[ -f "$ENVFILE" ] || { echo "$ENVFILE introuvable"; exit 1; }
case "$PRICE" in price_*|none) ;; *) echo "Identifiant de prix invalide (il commence par price_)."; exit 1 ;; esac
install -d -m 700 /root/env-backups
cp -p "$ENVFILE" "/root/env-backups/clippeak.env.local.$(date +%Y%m%d-%H%M)"
tmp="$(mktemp)"
grep -vE '^STRIPE_PRICE_CREATOR_YEARLY=' "$ENVFILE" > "$tmp" || true
if [ "$PRICE" = none ]; then
  cat "$tmp" > "$ENVFILE"; echo "Offre annuelle retiree."
else
  { cat "$tmp"; printf '%s\n' "STRIPE_PRICE_CREATOR_YEARLY=$PRICE"; } > "$ENVFILE"; echo "Prix annuel enregistre ($PRICE)."
fi
rm -f "$tmp"; chmod 600 "$ENVFILE"
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
