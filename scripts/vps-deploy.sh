#!/usr/bin/env bash
# Deploy the built standalone artifact on the self-hosted VPS.
#
# Layout (block storage, immutable releases):
#   /mnt/data/azimara-mesh-releases/<timestamp>   immutable release
#   /mnt/data/azimara-mesh-app                    symlink -> active release
#   systemd unit: WorkingDirectory/EnvironmentFile/ExecStart use the symlink
#
# Cutover is an atomic symlink swap after migrations and health verification.
# On failure the previous release is restored. Runtime .env, database volumes
# and backups are never overwritten by an artifact.
set -euo pipefail

RELEASES="${RELEASES_DIR:-/mnt/data/azimara-mesh-releases}"
LINK="${APP_LINK:-/mnt/data/azimara-mesh-app}"
SERVICE_NAME="${SERVICE_NAME:-azimara-mesh}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE="$RELEASES/$STAMP"

command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 1; }
[ -f .next/standalone/server.js ] || { echo "standalone build missing" >&2; exit 1; }
[ -d .next/static ] || { echo "static assets missing" >&2; exit 1; }

# --- stage immutable release ------------------------------------------------
sudo mkdir -p "$RELEASES" "$RELEASE"
sudo chown -R "$(id -u):$(id -g)" "$RELEASES"

cp -a .next/standalone/. "$RELEASE/"
mkdir -p "$RELEASE/.next" "$RELEASE/public" "$RELEASE/prisma"
cp -a .next/static/. "$RELEASE/.next/static/"
cp -a public/. "$RELEASE/public/"
cp -a prisma/schema.prisma "$RELEASE/prisma/"
[ -d prisma/migrations ] && cp -a prisma/migrations "$RELEASE/prisma/"

# Preserve runtime configuration from the active release. Only an explicit
# MESH_ENV overlay (newline-separated KEY=VALUE) can change it.
umask 077
if [ -f "$LINK/.env" ]; then
  cp -a "$LINK/.env" "$RELEASE/.env"
else
  : > "$RELEASE/.env"
fi
if [ -n "${MESH_ENV:-}" ]; then
  printf '%s\n' "$MESH_ENV" >> "$RELEASE/.env"
fi
chmod 600 "$RELEASE/.env"
# Record the immutable version on the release itself.
if [ -n "${RELEASE_VERSION:-}" ]; then
  printf '%s\n' "$RELEASE_VERSION" > "$RELEASE/VERSION"
fi
echo "release staged: $RELEASE"

# --- staging smoke gate -----------------------------------------------------
# Boot the staged build on a separate port and exercise its health endpoint
# before any production traffic is switched. This is the "staging" gate for
# the single-host deployment.
if [ "${SKIP_PROBE:-0}" != "1" ]; then
  PROBE_PORT="${PROBE_PORT:-3041}"
  if ss -ltn | grep -q ":${PROBE_PORT} "; then
    echo "probe port $PROBE_PORT is busy; refusing to deploy" >&2
    exit 1
  fi
  PROBE_PID_FILE="/tmp/mesh-probe-${STAMP}.pid"
  # Clear CI placeholder credentials so bun loads the release's own .env.
  (cd "$RELEASE" && env -u DATABASE_URL -u DATABASE_MIGRATION_URL -u SESSION_SECRET \
    PORT="$PROBE_PORT" nohup bun server.js > "/tmp/mesh-probe-${STAMP}.log" 2>&1 & echo $! > "$PROBE_PID_FILE")
  PROBE_OK=0
  for _ in $(seq 1 25); do
    code="$(curl -s -o "/tmp/mesh-probe-${STAMP}.json" -w '%{http_code}' "http://127.0.0.1:${PROBE_PORT}/api/health" || true)"
    if [ "$code" = "200" ] && grep -q '"status":"ok"' "/tmp/mesh-probe-${STAMP}.json"; then PROBE_OK=1; break; fi
    sleep 1
  done
  kill "$(cat "$PROBE_PID_FILE")" >/dev/null 2>&1 || true
  rm -f "$PROBE_PID_FILE"
  if [ "$PROBE_OK" != "1" ]; then
    echo "staging smoke gate failed; refusing to promote. Log: /tmp/mesh-probe-${STAMP}.log" >&2
    exit 1
  fi
  echo "staging smoke gate passed"
fi

# --- forward-only migrations (before traffic switch) -----------------------
MIGRATION_URL="$(grep -E '^DATABASE_MIGRATION_URL=' "$RELEASE/.env" | head -1 | cut -d= -f2- || true)"
if [ -z "$MIGRATION_URL" ]; then
  echo "DATABASE_MIGRATION_URL missing; refusing to deploy" >&2
  exit 1
fi
PRISMA_VERSION="6.19.2"
(
  cd "$RELEASE"
  DATABASE_MIGRATION_URL="$MIGRATION_URL" \
    bun x "prisma@${PRISMA_VERSION}" migrate deploy
) || { echo "migration failed; refusing to promote" >&2; exit 1; }

# --- atomic switch with rollback -------------------------------------------
PREVIOUS=""
if [ -L "$LINK" ]; then PREVIOUS="$(readlink -f "$LINK")"; fi
sudo systemctl stop "$SERVICE_NAME" || true
ln -sfn "$RELEASE" "$LINK.tmp"
mv -Tf "$LINK.tmp" "$LINK"
sudo systemctl daemon-reload
sudo systemctl start "$SERVICE_NAME"

ROLLBACK=0
for _ in $(seq 1 15); do
  sudo systemctl is-active --quiet "$SERVICE_NAME" || break
  code="$(curl -s -o /tmp/mesh-health.json -w '%{http_code}' http://127.0.0.1:3031/api/health || true)"
  if [ "$code" = "200" ] && grep -q '"status":"ok"' /tmp/mesh-health.json; then break; fi
  sleep 2
done
if ! sudo systemctl is-active --quiet "$SERVICE_NAME"; then ROLLBACK=1; fi

if [ "$ROLLBACK" = "1" ] || ! grep -q '"status":"ok"' /tmp/mesh-health.json 2>/dev/null; then
  echo "health check failed; rolling back" >&2
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    ln -sfn "$PREVIOUS" "$LINK.tmp"
    mv -Tf "$LINK.tmp" "$LINK"
    sudo systemctl restart "$SERVICE_NAME" || true
  fi
  exit 1
fi

echo "deployed $RELEASE (previous: ${PREVIOUS:-none})"
