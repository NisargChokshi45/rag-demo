#!/usr/bin/env bash
set -euo pipefail

set -a
source .env.local
set +a

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
    supabase db push --db-url "$SUPABASE_DB_URL" --include-all
else
    : "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF or SUPABASE_DB_URL before running this command}"
    supabase link --project-ref "$SUPABASE_PROJECT_REF"
    supabase db push --linked --include-all
fi
