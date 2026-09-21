#!/usr/bin/env bash
# Vercel Ignored Build Step for merchant-ui.
# Exit 0 = skip build; exit 1 = proceed with build.
set -euo pipefail

CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null || true)
if [ -z "$CHANGED" ]; then
  # First commit / shallow clone — build
  exit 1
fi

echo "$CHANGED" | grep -qE '^(merchant-ui/|packages/commerce-shared/|package-lock\.json|package\.json)' && exit 1
exit 0
