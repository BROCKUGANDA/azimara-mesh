#!/usr/bin/env bash
# Backup/restore drill for PostgreSQL. Restores into a DISPOSABLE database and
# verifies table counts. Never touches the live database.
# Usage: DATABASE_MIGRATION_URL=postgres://... POSTGRES_ADMIN_URL=postgres://... bash scripts/backup-restore-drill.sh
set -euo pipefail

: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"
: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required for creating the disposable database}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/tmp/mesh-backup-${STAMP}.sql"
DRAIL_DB="mesh_restore_drill_${STAMP//[^0-9A-Za-z]/}"

command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }

echo "backing up source..."
pg_dump "$DATABASE_MIGRATION_URL" -F p -f "$BACKUP"

echo "creating disposable database..."
psql "$POSTGRES_ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DRAIL_DB"

cleanup() {
  psql "$POSTGRES_ADMIN_URL" -c "DROP DATABASE IF EXISTS $DRAIL_DB" >/dev/null 2>&1 || true
  rm -f "$BACKUP"
}
trap cleanup EXIT

echo "restoring..."
psql "${DATABASE_MIGRATION_URL%/*}/$DRAIL_DB" -v ON_ERROR_STOP=1 -f "$BACKUP" >/dev/null

echo "verifying row counts..."
TABLES=(Agent Execution UsageEvent AuditEvent Approval BudgetReservation OutboxEvent)
for t in "${TABLES[@]}"; do
  src="$(psql "$DATABASE_MIGRATION_URL" -tAc "SELECT COUNT(*) FROM \"$t\"")"
  dst="$(psql "${DATABASE_MIGRATION_URL%/*}/$DRAIL_DB" -tAc "SELECT COUNT(*) FROM \"$t\"")"
  if [ "$src" != "$dst" ]; then
    echo "MISMATCH $t: source=$src restored=$dst" >&2
    exit 1
  fi
  echo "$t: $src rows verified"
done

echo "RESTORE_DRILL_OK — evidence recorded at $STAMP (backup removed after drill)"
