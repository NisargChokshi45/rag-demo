#!/usr/bin/env bash
set -euo pipefail

# Automatically export all variables loaded from this point
set -a
source .env.local
set +a

operation="${1:-setup}"

run_with_db_url() {
  case "$operation" in
    setup)
      supabase db push --db-url "$SUPABASE_DB_URL" --include-all --include-seed
      ;;
    cleanup)
      supabase db query --db-url "$SUPABASE_DB_URL" --file supabase/cleanup.sql
      ;;
    seed)
      supabase db query --db-url "$SUPABASE_DB_URL" --file supabase/seed.sql
      ;;
    *)
      echo "Unknown database operation: $operation" >&2
      exit 1
      ;;
  esac
}

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  run_with_db_url
  exit 0
fi

: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF or SUPABASE_DB_URL before running this command}"

link_args=(--project-ref "$SUPABASE_PROJECT_REF")
if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
  link_args+=(--password "$SUPABASE_DB_PASSWORD")
fi
supabase link "${link_args[@]}"

case "$operation" in
  setup)
    supabase db push --linked --include-all --include-seed
    ;;
  cleanup)
    supabase db query --linked --file supabase/cleanup.sql
    ;;
  seed)
    supabase db query --linked --file supabase/seed.sql
    ;;
  *)
    echo "Unknown database operation: $operation" >&2
    exit 1
    ;;
 esac
