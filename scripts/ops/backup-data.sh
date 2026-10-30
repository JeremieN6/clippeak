#!/usr/bin/env bash
# Sauvegarde nocturne de Clippeak, a lancer par cron en root sur le VPS.
#  - FICHIERS des streamers (photos, sons, illustrations, clips rendus) -> archive datee ;
#  - BASE Neon -> pg_dump (adresse DIRECTE : l'adresse « -pooler » ne convient pas a pg_dump) ;
#  - CHIFFREMENT (AES-256, openssl) avant tout envoi hors serveur, car les photos montrent des visages ;
#  - COPIE HORS SERVEUR avec rclone si RCLONE_REMOTE est defini ;
#  - rotation : BACKUP_KEEP_DAYS jours (7 par defaut) en local.
# Reglages (facultatifs) dans /etc/clippeak-backup/backup.env (root, droits 600) :
#   RCLONE_REMOTE=r2:clippeak-backups     (nom du « remote » rclone et du bucket)
#   BACKUP_PASSPHRASE_FILE=/etc/clippeak-backup/backup.pass   (fichier root 600 ; A CONSERVER AUSSI DANS UN GESTIONNAIRE DE MOTS DE PASSE)
#   BACKUP_KEEP_DAYS=7   CLIPPEAK_DATA_DIR=/srv/saas/clippeak-data   BACKUP_DIR=/var/backups/clippeak
# Exclus (recreables) : extraits de VOD (`sources`), caches des modeles (`hf`, `models`).
# Cron :  30 3 * * * /usr/local/sbin/clippeak-backup-data.sh >> /var/log/clippeak-backup.log 2>&1
set -uo pipefail

# cron ne fournit que /usr/bin:/bin : rclone vit dans /usr/local/bin.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

[ -f /etc/clippeak-backup/backup.env ] && set -a && . /etc/clippeak-backup/backup.env && set +a

DATA_DIR="${CLIPPEAK_DATA_DIR:-/srv/saas/clippeak-data}"
DEST="${BACKUP_DIR:-/var/backups/clippeak}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
PASS="${BACKUP_PASSPHRASE_FILE:-}"
STAMP="$(date +%Y%m%d-%H%M)"
FAIL=0
log() { echo "[$STAMP] $*"; }

umask 077
mkdir -p "$DEST"

# Reglage de chiffrement present mais fichier absent : on s'arrete (sinon on sauvegarderait en clair sans que personne le sache).
if [ -n "$PASS" ] && [ ! -f "$PASS" ]; then log "ERREUR : BACKUP_PASSPHRASE_FILE est defini mais le fichier $PASS est introuvable"; exit 1; fi

# Adresse de la base : variable d'environnement, sinon la ligne DATABASE_URL de .env.local (jamais affichee).
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] && [ -f /srv/saas/clippeak/.env.local ]; then
  DB_URL="$(grep -E '^DATABASE_URL=' /srv/saas/clippeak/.env.local | head -1 | cut -d= -f2- | tr -d '"\r')"
fi
DB_URL="${DB_URL/-pooler/}"

# pg_dump doit etre au moins de la version du serveur (Neon : PostgreSQL 18 au 2026-10-30) : on prend la plus recente installee.
PG_DUMP="$(ls -1 /usr/lib/postgresql/*/bin/pg_dump 2>/dev/null | sort -V | tail -1)"
PG_DUMP="${PG_DUMP:-$(command -v pg_dump || true)}"

seal() {  # chiffre un fichier si une phrase secrete est fournie, sinon le laisse tel quel ; affiche le chemin final ; echec = code 1
  local f="$1"
  if [ -n "$PASS" ] && [ -f "$PASS" ]; then
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$PASS" -in "$f" -out "$f.enc" && [ -s "$f.enc" ] && rm -f "$f" && echo "$f.enc" && return 0
    rm -f "$f.enc"; return 1
  fi
  echo "$f"
}

# 1. Fichiers
FILES="$DEST/files-$STAMP.tar.gz"
if tar --exclude='./sources' --exclude='./hf' --exclude='./models' -czf "$FILES" -C "$DATA_DIR" . && tar -tzf "$FILES" >/dev/null; then
  if SEALED="$(seal "$FILES")"; then FILES="$SEALED"; log "fichiers : $(du -h "$FILES" | cut -f1)"; else log "ERREUR : chiffrement des fichiers"; FAIL=1; fi
else
  log "ERREUR : archive des fichiers"; rm -f "$FILES"; FAIL=1
fi

# 2. Base
if [ -n "$DB_URL" ] && [ -n "$PG_DUMP" ]; then
  DB="$DEST/db-$STAMP.sql.gz"
  if "$PG_DUMP" --no-owner --no-privileges "$DB_URL" 2>"$DEST/.pgdump.err" | gzip > "$DB" && [ "$(stat -c %s "$DB")" -gt 2000 ]; then
    if SEALED="$(seal "$DB")"; then DB="$SEALED"; log "base : $(du -h "$DB" | cut -f1)"; else log "ERREUR : chiffrement de la base"; FAIL=1; fi
  else
    log "ERREUR : pg_dump ($(head -c 200 "$DEST/.pgdump.err" | tr '\n' ' '))"; rm -f "$DB"; FAIL=1
  fi
  rm -f "$DEST/.pgdump.err"
else
  log "AVERTISSEMENT : base non sauvegardee ici (pg_dump ou adresse absents)"
fi

# 3. Rotation locale
find "$DEST" -type f \( -name 'files-*' -o -name 'db-*' \) -mtime +"$KEEP_DAYS" -delete

# 4. Copie hors serveur : uniquement des fichiers CHIFFRES (jamais les photos en clair)
if [ -n "${RCLONE_REMOTE:-}" ]; then
  if [ -z "$PASS" ] || [ ! -f "$PASS" ]; then
    log "ERREUR : copie hors serveur refusee sans phrase secrete (les photos ne partent jamais en clair)"; FAIL=1
  elif ! command -v rclone >/dev/null 2>&1; then
    log "ERREUR : RCLONE_REMOTE est defini mais rclone n'est pas installe"; FAIL=1
  elif rclone copy "$DEST" "$RCLONE_REMOTE" --include '*.enc' --max-age "${KEEP_DAYS}d" --quiet; then
    rclone delete "$RCLONE_REMOTE" --include '*.enc' --min-age "${KEEP_DAYS}d" --quiet || log "AVERTISSEMENT : rotation distante impossible"
    log "copie hors serveur : $RCLONE_REMOTE"
  else
    log "ERREUR : copie hors serveur"; FAIL=1
  fi
else
  log "AVERTISSEMENT : pas de copie hors serveur (RCLONE_REMOTE non defini) : une panne du serveur perdrait aussi les sauvegardes"
fi

exit $FAIL
