#!/bin/bash
# Backs up the live Clarivi database into the encrypted backup disk image
# (D77; tech-spec, Privacy). Run in the Mac's Terminal app, with the image
# open first:
#   hdiutil attach ~/ClariviBackups.sparsebundle
#   scripts/backup-live.sh
#   hdiutil detach /Volumes/ClariviBackups
# Writes a dated folder with roles.sql, schema.sql, data.sql (every row,
# sign-in accounts included) and counts.txt (rows per table, nothing else),
# which scripts/restore-local.sh uses to check a restore.
# For testing on the local copy's made-up data only:
#   scripts/backup-live.sh --local <folder>
# The backup never goes into this repository, Documents or iCloud.
set -euo pipefail
cd "$(dirname "$0")/.."

VOLUME=/Volumes/ClariviBackups
IMAGE="$HOME/ClariviBackups.sparsebundle"

if [ "${1:-}" = "--local" ]; then
  SOURCE=--local
  DEST="${2:?a folder for the test backup}"
  mkdir -p "$DEST"
else
  SOURCE=--linked
  # Only into the encrypted image, opened from its usual place. (Read the
  # list first: grep -q stopping early would fail the pipe.)
  open_images=$(hdiutil info)
  if ! grep -q "image-path *: *$IMAGE$" <<< "$open_images"; then
    echo "Open the encrypted backup image first: hdiutil attach ~/ClariviBackups.sparsebundle"
    exit 1
  fi
  if [ ! -d "$VOLUME" ]; then
    echo "The backup image is open but $VOLUME is missing."
    exit 1
  fi
  DEST="$VOLUME/$(date +%Y-%m-%d-%H%M)"
  mkdir "$DEST"
fi

npx supabase db dump $SOURCE --role-only -f "$DEST/roles.sql"
npx supabase db dump $SOURCE -f "$DEST/schema.sql"
npx supabase db dump $SOURCE --data-only --use-copy -f "$DEST/data.sql"

# Rows per table, counted from the backup itself (no values).
awk '/^COPY /{table=$2; rows=0; next} /^\\\.$/{if (table != "") print table, rows; table=""; next} table != ""{rows++}' \
  "$DEST/data.sql" > "$DEST/counts.txt"

echo "Backed up to $DEST: $(wc -l < "$DEST/counts.txt" | tr -d ' ') tables, $(awk '{s += $2} END {print s + 0}' "$DEST/counts.txt") rows."
