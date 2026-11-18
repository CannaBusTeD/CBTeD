#!/usr/bin/env bash
# Rebuilds the live CBTeD production-controller schema (snapshot of 2026-11-18) in a throwaway LOCAL
# PostgreSQL database, records every canonical plan, applies every newer migration, then checks:
#   P1-P4  existing workflows unchanged, new workflow valid, database plans equal the JavaScript planner
#   01-28  ownership, tampering, approvals and fail-closed publishing, run as pretend users
# It never connects to the live Supabase database.
# Usage: PSQL="sudo -u postgres psql" bash tests/sql/run-check.sh   (PSQL defaults to "psql")
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"; repo="$(cd "$here/../.." && pwd)"
read -r -a PSQL <<< "${PSQL:-psql}"
DB="${CBTED_TEST_DB:-cbted_sql_check}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
node "$here/make-expected.mjs" "$work/expected.sql" >/dev/null
cp "$here"/*.sql "$work"/
migrations=()
for f in "$repo"/supabase/migrations/*.sql; do
  ts="$(basename "$f" | cut -c1-14)"
  if [[ "$ts" > "20261118000000" ]]; then cp "$f" "$work/"; migrations+=("$work/$(basename "$f")"); fi
done
chmod -R a+rX "$work"; cd "$work"
"${PSQL[@]}" -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
"${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 -q -f schema_2026-11-18.sql -f live_functions_2026-11-18.sql -f expected.sql -f record-before.sql
for m in "${migrations[@]}"; do "${PSQL[@]}" -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -q -f "$m"; done
{ "${PSQL[@]}" -d "$DB" -q -f compare-plans.sql; "${PSQL[@]}" -d "$DB" -q -f behaviour.sql; } 2>&1 | grep -E '^(P[0-9]|[0-9]{2}) |ERROR:' > actual.txt || true
"${PSQL[@]}" -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null
if diff -u "$here/expected-output.txt" actual.txt; then echo "SQL check passed (${#migrations[@]} migration(s) applied to a local copy)."; else echo "SQL check FAILED"; exit 1; fi
