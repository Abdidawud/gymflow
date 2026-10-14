#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into an EMPTY database (never the
# live one by accident): create the database first, restore, then point a
# GymFlow instance at it and check /api/v1/ready. Grants for the application
# role are re-applied with `npm run cli -- grant`.
#
#   DATABASE_URL=postgres://owner:…@host/gymflow_restored STORAGE_DIR=/srv/gymflow/storage-restored \
#     scripts/restore.sh /var/backups/gymflow/gymflow-20261008T020000Z
set -euo pipefail

SRC="${1:?Usage: restore.sh <backup-folder>}"
: "${DATABASE_URL:?Set DATABASE_URL to the empty target database}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"

(cd "$SRC" && sha256sum --check --quiet SHA256SUMS)
tables="$("$PSQL" "$DATABASE_URL" -tAc "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ]; then
  echo "Refusing to restore: the target database is not empty." >&2
  exit 1
fi
"$PG_RESTORE" --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$SRC/database.dump"
if [ -f "$SRC/storage.tar.gz" ]; then
  : "${STORAGE_DIR:?Set STORAGE_DIR to restore photos and the logo}"
  mkdir -p "$STORAGE_DIR"
  tar -C "$STORAGE_DIR" -xzf "$SRC/storage.tar.gz"
fi
echo "Restored $SRC"
