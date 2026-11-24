#!/usr/bin/env bash
# Compute the next semantic version from the latest v* tag.
# Commit subject may contain #major or #minor to bump those components.
set -euo pipefail
git fetch --tags --force -q || true
LATEST="$(git tag -l 'v*' --sort=-v:refname | head -1 || true)"
if [ -z "$LATEST" ]; then
  echo 'v0.1.0'
  exit 0
fi
VERSION="${LATEST#v}"
IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"
MAJOR="${MAJOR:-0}"; MINOR="${MINOR:-0}"; PATCH="${PATCH:-0}"
SUBJECT="$(git log -1 --pretty=%B)"
case "$SUBJECT" in
  *#major*) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  *#minor*) MINOR=$((MINOR + 1)); PATCH=0 ;;
  *) PATCH=$((PATCH + 1)) ;;
esac
echo "v${MAJOR}.${MINOR}.${PATCH}"
