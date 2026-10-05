#!/bin/bash
# Practises a restore: loads a backup made by scripts/backup-live.sh into the
# LOCAL copy of Supabase (never the live project), then checks every table
# has the same number of rows as the backup's counts.txt. A real restore into
# a new project follows the same steps: the migrations first, then data.sql.
#   scripts/restore-local.sh /Volumes/ClariviBackups/<date>
# It wipes the local copy first (supabase db reset). Afterwards, wipe it
# again so no real data stays there:
#   npx supabase db reset
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${1:?the backup folder}"
for f in data.sql counts.txt; do
  [ -f "$DIR/$f" ] || { echo "Missing $DIR/$f"; exit 1; }
done
API=$(npx supabase status -o env | sed -n 's/^API_URL="\(.*\)"$/\1/p')
case "$API" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "The local copy isn't running (npx supabase start)."; exit 1 ;;
esac
psql_local() { docker exec -i supabase_db_clarivi psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q -At "$@"; }

echo "Wiping the local copy and applying the migrations..."
npx supabase db reset --local > /dev/null

echo "Loading the backup..."
# The migrations already wrote the score settings, which the backup has too,
# so that table starts empty. The backup turns triggers off while loading
# (it is already consistent). Scheduled jobs and Vault keys aren't in a
# backup: the migrations make them again.
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  echo "delete from public.score_settings;"
  cat "$DIR/data.sql"
  echo "commit;"
} | psql_local > /dev/null

echo "Comparing row counts..."
mismatches=0
while read -r table rows; do
  have=$(echo "select count(*) from $table;" | psql_local)
  if [ "$have" != "$rows" ]; then
    echo "DIFFERENT  $table: backup $rows, restored $have"
    mismatches=$((mismatches + 1))
  fi
done < "$DIR/counts.txt"

tables=$(wc -l < "$DIR/counts.txt" | tr -d ' ')
total=$(awk '{s += $2} END {print s + 0}' "$DIR/counts.txt")
if [ "$mismatches" -eq 0 ]; then
  echo "Restore matches the backup: $tables tables, $total rows."
else
  echo "$mismatches of $tables tables differ."
  exit 1
fi
