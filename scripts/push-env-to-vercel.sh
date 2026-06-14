#!/usr/bin/env bash
# Push every variable from an env file up to Vercel (all environments).
# Repeatable: uses --force so re-running overwrites existing values.
#
# Usage:
#   vercel login && vercel link      # one-time
#   ./scripts/push-env-to-vercel.sh                 # uses .env.local
#   ./scripts/push-env-to-vercel.sh .env.production # or a specific file
set -euo pipefail

ENV_FILE="${1:-.env.local}"
ENVIRONMENTS=(production preview development)

if ! command -v vercel >/dev/null 2>&1; then
  echo "✗ Vercel CLI not found. Run: npm i -g vercel" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Env file not found: $ENV_FILE" >&2
  exit 1
fi

echo "→ Pushing vars from $ENV_FILE to: ${ENVIRONMENTS[*]}"

while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blanks and comments.
  [[ -z "${line// }" || "$line" == \#* ]] && continue
  # Split on the first '=' only.
  key="${line%%=*}"
  value="${line#*=}"
  key="${key// /}"
  [[ -z "$key" ]] && continue
  # Strip a trailing inline comment is intentionally NOT done (values may contain '#').
  # Strip surrounding double quotes if present.
  value="${value%\"}"; value="${value#\"}"

  if [[ "$value" == *"<region>"* ]]; then
    echo "  ⚠ skipping $key — still contains the <region> placeholder; fix it first."
    continue
  fi

  for env in "${ENVIRONMENTS[@]}"; do
    printf "%s" "$value" | vercel env add "$key" "$env" --force >/dev/null
    echo "  ✓ $key → $env"
  done
done < "$ENV_FILE"

echo "✓ Done. Verify with: vercel env ls"
