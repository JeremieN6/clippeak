#!/usr/bin/env bash
# Sauvegarde nocturne des donnees de Clippeak sur le VPS.
#  - fichiers des streamers (photos, sons, illustrations, clips rendus) : archive datee dans /var/backups/clippeak, 7 jours gardes ;
#  - base Neon : `pg_dump` si le client est installe et DATABASE_URL defini (sinon on compte sur la restauration a un instant donne de Neon) ;
#  - copie HORS SERVEUR : seulement si RCLONE_REMOTE est defini (exemple : b2:mon-bucket/clippeak). Sans cela, les archives
#    protegent d'une erreur de suppression mais PAS de la perte du serveur.
# Exclus (recreables) : extraits de VOD (`sources`), cache des modeles (`hf`, `models`).
# Usage (cron, en root) : 30 3 * * * /srv/saas/clippeak/scripts/ops/backup-data.sh >> /var/log/clippeak-backup.log 2>&1
set -euo pipefail

DATA_DIR="${CLIPPEAK_DATA_DIR:-/srv/saas/clippeak-data}"
DEST="${BACKUP_DIR:-/var/backups/clippeak}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
STAMP="$(date +%Y%m%d-%H%M)"

umask 077
mkdir -p "$DEST"

tar --exclude='./sources' --exclude='./hf' --exclude='./models' -czf "$DEST/files-$STAMP.tar.gz" -C "$DATA_DIR" .
echo "[$STAMP] fichiers : $(du -h "$DEST/files-$STAMP.tar.gz" | cut -f1)"

if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$DEST/db-$STAMP.sql.gz"
  echo "[$STAMP] base : $(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1)"
else
  echo "[$STAMP] base : non sauvegardee ici (pg_dump ou DATABASE_URL absent) : voir la restauration a un instant donne de Neon"
fi

find "$DEST" -type f \( -name 'files-*.tar.gz' -o -name 'db-*.sql.gz' \) -mtime +"$KEEP_DAYS" -delete

if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$DEST" "$RCLONE_REMOTE" --max-age "${KEEP_DAYS}d" --quiet
  echo "[$STAMP] copie hors serveur : $RCLONE_REMOTE"
else
  echo "[$STAMP] AVERTISSEMENT : pas de copie hors serveur (RCLONE_REMOTE non defini)"
fi
