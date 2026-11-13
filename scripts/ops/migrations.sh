#!/usr/bin/env bash
# Migrations Neon en deux commandes, sans jamais afficher l'adresse de la base :
#   bash scripts/ops/migrations.sh check    (lecture seule : dit s'il reste des migrations a appliquer ; code 3 si oui)
#   bash scripts/ops/migrations.sh apply    (liste ce qui va etre applique, demande « oui », puis applique)
#   bash scripts/ops/migrations.sh auto     (deploiement : applique SEUL les migrations en attente si elles ne font qu'AJOUTER (colonnes, tables,
#                                            index) ; s'arrete (code 4) si l'une supprime, renomme ou modifie des donnees : a relire puis « apply »)
#   bash scripts/ops/migrations.sh scan <fichier.sql> [...]   (dit si un fichier de migration est risque ; code 4 si oui)
# Lit DATABASE_URL dans .env.local (seule cette ligne est lue) et utilise l'adresse DIRECTE de Neon (sans « -pooler »).
# Utilise aussi par le deploiement (.github/workflows/deploy.yml) : « check » bloque le redemarrage si une migration manque.
set -uo pipefail
cd "$(dirname "$0")/../.."
# Une migration est « risquee » si elle supprime, renomme ou modifie des donnees ou des colonnes existantes. Les commentaires et les
# « ON DELETE / ON UPDATE CASCADE » des cles etrangeres (ajout pur) ne comptent pas.
risky() {
  sed -E -e 's/--.*$//' -e 's/[Oo][Nn] +([Dd][Ee][Ll][Ee][Tt][Ee]|[Uu][Pp][Dd][Aa][Tt][Ee]) +([Cc][Aa][Ss][Cc][Aa][Dd][Ee]|[Ss][Ee][Tt] +[Nn][Uu][Ll][Ll]|[Rr][Ee][Ss][Tt][Rr][Ii][Cc][Tt]|[Ss][Ee][Tt] +[Dd][Ee][Ff][Aa][Uu][Ll][Tt]|[Nn][Oo] +[Aa][Cc][Tt][Ii][Oo][Nn])//g' "$1" | grep -niE '(^|[^a-z_])(drop|delete|truncate|rename|update)([^a-z_]|$)|alter +column'
}

if [ "${1:-}" = "scan" ]; then
  shift; [ "$#" -ge 1 ] || { echo "Usage : bash scripts/ops/migrations.sh scan <fichier.sql> [...]"; exit 1; }
  BAD=0
  for F in "$@"; do
    LINES="$(risky "$F")" || true
    if [ -n "$LINES" ]; then echo "RISQUE dans $F :"; echo "$LINES" | head -5; BAD=1; fi
  done
  [ "$BAD" = "1" ] && exit 4
  echo "Ajouts seulement."; exit 0
fi

# CLIPPEAK_PRISMA : commande de remplacement, pour les tests (« bash faux-prisma.sh »).
read -ra PRISMA <<< "${CLIPPEAK_PRISMA:-./node_modules/.bin/prisma}"
[ -x "${PRISMA[0]}" ] || command -v "${PRISMA[0]}" > /dev/null || { echo "Prisma introuvable : lance « npm ci --ignore-scripts » d'abord."; exit 1; }

URL="${DATABASE_URL:-}"
[ -n "$URL" ] || URL="$(grep -E '^DATABASE_URL=' .env.local 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"\r')"
[ -n "$URL" ] || { echo "DATABASE_URL introuvable (ni dans l'environnement, ni dans .env.local)."; exit 1; }
export DATABASE_URL="${URL//-pooler/}"

status() { OUT="$("${PRISMA[@]}" migrate status 2>&1)"; RC=$?; }


case "${1:-}" in
  check)
    status
    if echo "$OUT" | grep -q "have not yet been applied"; then
      echo "MIGRATIONS EN ATTENTE :"; echo "$OUT" | sed -n '/have not yet been applied/,$p' | grep -E '^[0-9]{12}_' ; exit 3
    fi
    if echo "$OUT" | grep -q "Database schema is up to date"; then echo "Base a jour : aucune migration en attente."; exit 0; fi
    # Ni « a jour » ni « en attente » : connexion impossible ou historique inattendu. On le dit, sans bloquer a tort.
    echo "Etat des migrations IMPOSSIBLE a determiner :"; echo "$OUT" | grep -vE '^(Prisma schema|Datasource)' | tail -6 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'; exit 2
    ;;
  apply)
    status
    echo "$OUT" | grep -q "have not yet been applied" || { echo "Rien a appliquer."; echo "$OUT" | grep -q "up to date" && exit 0; echo "$OUT" | tail -5 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'; exit 2; }
    echo "Migrations qui vont etre appliquees a la base de PRODUCTION :"
    echo "$OUT" | sed -n '/have not yet been applied/,$p' | grep -E '^[0-9]{12}_'
    read -rp "Ecris « oui » pour les appliquer : " A
    [ "$A" = "oui" ] || { echo "Annule."; exit 1; }
    "${PRISMA[@]}" migrate deploy 2>&1 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'; exit "${PIPESTATUS[0]}"
    ;;
  auto)
    status
    if ! echo "$OUT" | grep -q "have not yet been applied"; then
      if echo "$OUT" | grep -q "Database schema is up to date"; then echo "Base a jour : aucune migration en attente."; exit 0; fi
      echo "Etat des migrations IMPOSSIBLE a determiner :"; echo "$OUT" | grep -vE '^(Prisma schema|Datasource)' | tail -6 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'; exit 2
    fi
    PENDING="$(echo "$OUT" | sed -n '/have not yet been applied/,$p' | grep -E '^[0-9]{12}_')"
    echo "Migrations en attente :"; echo "$PENDING"
    for M in $PENDING; do
      LINES="$(risky "prisma/migrations/$M/migration.sql")" || true
      if [ -n "$LINES" ]; then
        echo "STOP : la migration $M supprime, renomme ou modifie des donnees ou des colonnes existantes :"; echo "$LINES" | head -5
        echo "Relis-la, puis applique-la toi-meme : bash scripts/ops/migrations.sh apply (puis relance le deploiement)."
        exit 4
      fi
    done
    echo "Ajouts seulement : application automatique."
    "${PRISMA[@]}" migrate deploy 2>&1 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'; exit "${PIPESTATUS[0]}"
    ;;
  resolve)
    # Pour une migration dont le SQL a ete colle a la main dans la console Neon : l'enregistre comme appliquee (n'execute aucun SQL de migration).
    shift; [ "$#" -ge 1 ] || { echo "Usage : bash scripts/ops/migrations.sh resolve <nom-de-migration> [...]"; exit 1; }
    for M in "$@"; do
      [ -d "prisma/migrations/$M" ] || { echo "Migration inconnue : $M"; exit 1; }
      "${PRISMA[@]}" migrate resolve --applied "$M" 2>&1 | sed -E -e '/^Datasource/d' -e 's#postgres(ql)?://[^ ]+#<adresse masquee>#g'
    done
    ;;
  *) echo "Usage : bash scripts/ops/migrations.sh check|apply|auto|scan|resolve"; exit 1 ;;
esac
