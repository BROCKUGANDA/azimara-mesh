#!/usr/bin/env bash
# Deploy the built standalone artifact on the self-hosted VPS runner.
# Contract: run from the repository root after `bun run build`.
set -euo pipefail

TARGET_DIR="${TARGET_DIR:?TARGET_DIR is required}"
SERVICE_NAME="${SERVICE_NAME:-azimara-mesh}"
BACKUP_DIR="${TARGET_DIR}.previous"

command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }
[ -f .next/standalone/server.js ] || { echo "standalone build missing" >&2; exit 1; }
[ -d .next/static ] || { echo "static assets missing" >&2; exit 1; }

# Keep a rollback point, but never let backup creation abort a rollback deploy.
if [ -d "$TARGET_DIR" ]; then
  rm -rf "$BACKUP_DIR"
  cp -a "$TARGET_DIR" "$BACKUP_DIR"
fi

mkdir -p "$TARGET_DIR"
# Protected paths are runtime state, not build artifacts. `--delete` must not
# remove them on every release (that would erase the database and env file).
rsync -a --delete --exclude='.env' --exclude='db/' .next/standalone/ "$TARGET_DIR/"
mkdir -p "$TARGET_DIR/.next"
rsync -a --delete .next/static/ "$TARGET_DIR/.next/static/"
mkdir -p "$TARGET_DIR/public"
rsync -a --delete public/ "$TARGET_DIR/public/"

# Environment is supplied by a GitHub Actions secret. Never bake it into the
# image or print it. Preserve an existing file when no secret is configured.
if [ -n "${MESH_ENV:-}" ]; then
  umask 077
  printf '%s\n' "$MESH_ENV" > "$TARGET_DIR/.env"
fi

# Materialize the database and schema only after the artifact is in place.
# Pin the CLI major: `bunx prisma` on a bare runner resolves to the latest
# major (8.x), which removed `db push`. Keep this in step with package.json.
PRISMA_VERSION="$(node -p "require('./package.json').devDependencies.prisma.replace(/[^\d.]/g, '')")"
# The standalone artifact does not ship the Prisma schema; stage it from the
# checked-out workspace so `db push` has a contract to apply.
mkdir -p "$TARGET_DIR/prisma"
cp prisma/schema.prisma "$TARGET_DIR/prisma/schema.prisma"
cd "$TARGET_DIR"
if [ -n "$PRISMA_VERSION" ]; then
  bunx "prisma@${PRISMA_VERSION}" db push --skip-generate || echo "::warning::prisma db push failed; inspect before promoting"
fi

if command -v systemctl >/dev/null && sudo -n true 2>/dev/null; then
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl is-active --quiet "$SERVICE_NAME" || { echo "service failed to start" >&2; exit 1; }
  echo "deployed and restarted $SERVICE_NAME"
else
  echo "systemctl unavailable or passwordless sudo not configured; artifact staged at $TARGET_DIR"
fi
