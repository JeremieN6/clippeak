#!/usr/bin/env bash
# Pose les cles Stripe dans /srv/saas/clippeak/.env.local du serveur (lues a chaque demarrage par le site, jamais affichees).
# Lance depuis le PC par `bash scripts/ops/run-on-vps.sh stripe` : les secrets sont saisis MASQUES et arrivent ici par l'entree standard,
# jamais dans la conversation, dans l'historique du terminal ni dans les arguments d'une commande.
# Entree standard, 3 lignes : cle secrete (sk_test_... ou rk_test_...), secret du webhook (whsec_...), identifiant du prix (price_...).
set -euo pipefail
ENVFILE=/srv/saas/clippeak/.env.local
read -r SK; read -r WH; read -r PRICE
case "$SK" in sk_test_*|rk_test_*|sk_live_*|rk_live_*) ;; *) echo "Cle secrete Stripe invalide (elle commence par sk_test_ ou rk_test_)."; exit 1 ;; esac
case "$WH" in whsec_*) ;; *) echo "Secret de webhook invalide (il commence par whsec_)."; exit 1 ;; esac
case "$PRICE" in price_*) ;; *) echo "Identifiant de prix invalide (il commence par price_)."; exit 1 ;; esac
[ -f "$ENVFILE" ] || { echo "$ENVFILE introuvable"; exit 1; }
install -d -m 700 /root/env-backups
cp -p "$ENVFILE" "/root/env-backups/clippeak.env.local.$(date +%Y%m%d-%H%M)"
tmp="$(mktemp)"
grep -vE '^(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_PRICE_CREATOR)=' "$ENVFILE" > "$tmp" || true
{ cat "$tmp"; printf '%s\n' "STRIPE_SECRET_KEY=$SK" "STRIPE_WEBHOOK_SECRET=$WH" "STRIPE_PRICE_CREATOR=$PRICE"; } > "$ENVFILE"
rm -f "$tmp"; chmod 600 "$ENVFILE"
echo "Cles Stripe enregistrees ($(echo "$SK" | cut -c1-8)... mode $(case "$SK" in *_test_*) echo test ;; *) echo PRODUCTION ;; esac))."
pm2 reload clippeak --update-env >/dev/null 2>&1 && echo "Site recharge." || echo "Site non recharge : relance-le a la main."
