#!/usr/bin/env bash
# Execute SUR LE VPS par `bash scripts/ops/run-on-vps.sh mega`. Le mot de passe Mega arrive par l'entree standard (jamais en argument,
# jamais dans l'historique) ; rclone ne le garde que masque (« obscure ») dans /root/.config/rclone/rclone.conf (droits 600).
set -euo pipefail
MEGA_USER="${1:?adresse du compte Mega}"
IFS= read -r PW
command -v rclone >/dev/null 2>&1 || { echo "rclone absent : lance d'abord « prerequisites »."; exit 1; }

rclone config delete mega >/dev/null 2>&1 || true
OB="$(printf '%s' "$PW" | rclone obscure -)"
rclone config create mega mega user "$MEGA_USER" pass "$OB" --non-interactive >/dev/null
unset PW OB

echo "== test de connexion a Mega"
rclone mkdir mega:clippeak-backups
rclone lsd mega: | head -5

echo "== activation de la copie hors serveur"
grep -v '^RCLONE_REMOTE=' /etc/clippeak-backup/backup.env > /tmp/clippeak-be.tmp || true
echo 'RCLONE_REMOTE=mega:clippeak-backups' >> /tmp/clippeak-be.tmp
install -m 600 /tmp/clippeak-be.tmp /etc/clippeak-backup/backup.env && rm -f /tmp/clippeak-be.tmp

echo "== essai de sauvegarde complet"
/usr/local/sbin/clippeak-backup-data.sh
echo "== contenu de Mega"
rclone ls mega:clippeak-backups
