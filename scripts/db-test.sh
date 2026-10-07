#!/usr/bin/env bash
# Runs supabase/tests/db.test.sql (self-contained, rolls back) against $DATABASE_URL and fails on any failed assertion.
set -euo pipefail
: "${DATABASE_URL:?set DATABASE_URL (e.g. postgresql://postgres:postgres@127.0.0.1:56422/postgres)}"
out=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F '|' -f "$(dirname "$0")/../supabase/tests/db.test.sql" | grep -E '^[0-9]+\|[0-9]+\|' | tail -1)
passed=${out%%|*}; rest=${out#*|}; total=${rest%%|*}; failures=${rest#*|}
echo "db tests: $passed/$total passed"
if [ "$passed" != "$total" ]; then echo "$failures"; exit 1; fi
