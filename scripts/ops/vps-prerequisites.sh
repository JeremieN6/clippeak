#!/usr/bin/env bash
# A lancer UNE FOIS en root sur le VPS (via `bash scripts/ops/run-on-vps.sh prerequisites`). Idempotent.
# Installe ce qu'il faut a la sauvegarde : unzip, le client PostgreSQL 18 (Neon est en PostgreSQL 18 ; le pg_dump 16 d'Ubuntu refuse) et rclone.
# Rien n'est demarre, aucun serveur PostgreSQL n'est installe, le pg_dump 16 existant reste en place.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "A lancer en root."; exit 1; }
. /etc/os-release

echo "== 1/3 unzip"
apt-get install -y unzip >/dev/null

echo "== 2/3 client PostgreSQL 18 (depot officiel apt.postgresql.org)"
if [ ! -x /usr/lib/postgresql/18/bin/pg_dump ]; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y postgresql-client-18
fi
/usr/lib/postgresql/18/bin/pg_dump --version

echo "== 3/3 rclone (version officielle, somme de controle verifiee)"
if ! command -v rclone >/dev/null 2>&1; then
  case "$(uname -m)" in x86_64) A=amd64 ;; aarch64) A=arm64 ;; *) echo "Architecture non geree : $(uname -m)"; exit 1 ;; esac
  T="$(mktemp -d)"; cd "$T"
  V="$(curl -fsSL https://downloads.rclone.org/version.txt | awk '{print $2}')"
  curl -fsSLO "https://downloads.rclone.org/$V/rclone-$V-linux-$A.zip"
  curl -fsSL "https://downloads.rclone.org/$V/SHA256SUMS" -o SHA256SUMS
  grep " rclone-$V-linux-$A.zip\$" SHA256SUMS | sha256sum -c -
  unzip -q "rclone-$V-linux-$A.zip"
  install -m 755 "rclone-$V-linux-$A/rclone" /usr/local/bin/rclone
  cd /; rm -rf "$T"
fi
rclone version | head -1
echo "== termine : relance maintenant /usr/local/sbin/clippeak-backup-data.sh pour verifier « base : ... »"
