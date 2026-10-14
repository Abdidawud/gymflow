#!/usr/bin/env bash
# Backs up the GymFlow database (pg_dump custom format) into a timestamped
# folder. Member photos and the gym logo are stored in the database, so the
# dump contains everything. Run daily from cron/systemd; keep copies off the
# server. Test restores regularly (scripts/restore.sh). STORAGE_DIR is only
# for older installations that kept files on disk.
#
#   DATABASE_URL=postgres://owner:…@host/gymflow scripts/backup.sh /var/backups/gymflow
set -euo pipefail

DEST_ROOT="${1:?Usage: backup.sh <destination-folder>}"
: "${DATABASE_URL:?Set DATABASE_URL (the schema owner connection works best)}"
STORAGE_DIR="${STORAGE_DIR:-}"
PG_DUMP="${PG_DUMP:-pg_dump}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$DEST_ROOT/gymflow-$stamp"
mkdir -p "$dest"
umask 077

"$PG_DUMP" --format=custom --no-owner --no-privileges --file="$dest/database.dump" "$DATABASE_URL"
if [ -n "$STORAGE_DIR" ] && [ -d "$STORAGE_DIR" ]; then
  tar -C "$STORAGE_DIR" -czf "$dest/storage.tar.gz" .
fi
(cd "$dest" && sha256sum ./* > SHA256SUMS)
echo "$dest"
