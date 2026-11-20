#!/usr/bin/env bash
# Provision least-privilege PostgreSQL roles in a disposable or managed database.
# Works with any container/service reachable through docker exec.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-mesh-ci-postgres}"
DB_USER="${POSTGRES_USERNAME:-mesh_bootstrap}"
DB_NAME="${POSTGRES_DB:-mesh}"

: "${POSTGRES_ADMIN_PASSWORD:?POSTGRES_ADMIN_PASSWORD is required}"
: "${MESH_MIGRATOR_PASSWORD:?MESH_MIGRATOR_PASSWORD is required}"
: "${MESH_APP_PASSWORD:?MESH_APP_PASSWORD is required}"

docker exec -i "$CONTAINER" \
  env PGPASSWORD="$POSTGRES_ADMIN_PASSWORD" \
  psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" \
    -v mesh_migrator_password="$MESH_MIGRATOR_PASSWORD" \
    -v mesh_app_password="$MESH_APP_PASSWORD" \
    -f - < "$ROOT_DIR/deploy/postgres/bootstrap-roles.sql"

echo "PostgreSQL roles and grants are ready."
