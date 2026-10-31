#!/usr/bin/env bash
# Lance depuis le PC une des operations du VPS, sans jamais afficher l'adresse du serveur :
#   bash scripts/ops/run-on-vps.sh prerequisites     (installe pg_dump 18 + rclone)
#   bash scripts/ops/run-on-vps.sh mega              (branche la copie hors serveur sur Mega ; demande le mot de passe, masque)
# Lit VPS_HOST et VPS_USER dans .env.local ; cle SSH : $SSH_KEY ou ~/.ssh/id_ed25519_perso.
set -euo pipefail
cd "$(dirname "$0")/../.."
get() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"\r'; }
HOST="$(get VPS_HOST)"; USER_="$(get VPS_USER)"; KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_perso}"
[ -n "$HOST" ] && [ -n "$USER_" ] || { echo "VPS_HOST / VPS_USER introuvables dans .env.local"; exit 1; }
[ -f "$KEY" ] || { echo "Cle SSH introuvable : $KEY (definis SSH_KEY)"; exit 1; }
SSH=(ssh -i "$KEY" -o ConnectTimeout=15 "$USER_@$HOST")
SCP=(scp -i "$KEY" -o ConnectTimeout=15)

case "${1:-}" in
  prerequisites)
    "${SSH[@]}" 'bash -s' < scripts/ops/vps-prerequisites.sh
    ;;
  mega)
    MEGA_USER="${MEGA_USER:-contact.clippeak@sassify.fr}"
    echo "Compte Mega : $MEGA_USER"
    read -rsp "Mot de passe de ce compte Mega (rien ne s'affiche en tapant) : " PW; echo
    [ -n "$PW" ] || { echo "Mot de passe vide."; exit 1; }
    "${SCP[@]}" scripts/ops/vps-mega.sh "$USER_@$HOST:/tmp/vps-mega.sh"
    printf '%s\n' "$PW" | "${SSH[@]}" "bash /tmp/vps-mega.sh '$MEGA_USER'; rc=\$?; rm -f /tmp/vps-mega.sh; exit \$rc"
    unset PW
    ;;
  stripe)
    echo "Cles Stripe du compte Clippeak (mode test) : rien ne s'affiche en tapant."
    read -rsp "Cle secrete (sk_test_... ou rk_test_...) : " SK; echo
    read -rsp "Secret du webhook (whsec_...) : " WH; echo
    PRICE_DEFAULT="${STRIPE_PRICE_CREATOR:-price_1UWPYcEZhvrLO8HBxkKnEWsP}"
    read -rp "Identifiant du prix Creator [$PRICE_DEFAULT] : " PRICE; PRICE="${PRICE:-$PRICE_DEFAULT}"
    [ -n "$SK" ] && [ -n "$WH" ] || { echo "Une des deux cles est vide."; exit 1; }
    "${SCP[@]}" scripts/ops/vps-stripe.sh "$USER_@$HOST:/tmp/vps-stripe.sh"
    printf '%s\n%s\n%s\n' "$SK" "$WH" "$PRICE" | "${SSH[@]}" "bash /tmp/vps-stripe.sh; rc=\$?; rm -f /tmp/vps-stripe.sh; exit \$rc"
    unset SK WH PRICE
    ;;
  *) echo "Usage : bash scripts/ops/run-on-vps.sh prerequisites|mega|stripe"; exit 1 ;;
esac
