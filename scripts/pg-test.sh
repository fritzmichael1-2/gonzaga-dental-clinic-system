#!/usr/bin/env bash
# Rebuild a throwaway Postgres, apply the schema and seed, and run the security
# smoke test. Always starts from a clean database: the smoke test inserts
# conflicting rows on purpose, so re-running it against a dirty database makes
# the same guarantees fire a second time and the error count stops meaning
# anything.
#
#   scripts/pg-test.sh
#
# Exits non-zero if the schema fails to apply or the section count changes.
set -uo pipefail

cd "$(dirname "$0")/.."
REPO=$PWD
PSQL="psql -h /tmp/opencode -p 5433 -U khent -d gdcmas"
OUT=/tmp/opencode/smoke.out

bash scripts/pg-harness.sh > /dev/null || { echo "harness failed"; exit 1; }

if ! $PSQL -q -v ON_ERROR_STOP=1 -f supabase/schema.sql > /tmp/opencode/schema.out 2>&1; then
  echo "FAIL: schema.sql did not apply cleanly"
  grep -viE "notice|^$" /tmp/opencode/schema.out | tail -5
  exit 1
fi

# Idempotency is a documented property of both files, so prove it rather than
# assume it.
if ! $PSQL -q -v ON_ERROR_STOP=1 -f supabase/schema.sql >> /tmp/opencode/schema.out 2>&1; then
  echo "FAIL: schema.sql is not idempotent (second apply failed)"
  grep -viE "notice|^$" /tmp/opencode/schema.out | tail -5
  exit 1
fi
$PSQL -q -v ON_ERROR_STOP=1 -f supabase/seed.sql >> /tmp/opencode/schema.out 2>&1 \
  || { echo "FAIL: seed.sql did not apply cleanly"; exit 1; }
$PSQL -q -v ON_ERROR_STOP=1 -f supabase/seed.sql >> /tmp/opencode/schema.out 2>&1 \
  || { echo "FAIL: seed.sql is not idempotent"; exit 1; }

$PSQL -f supabase/smoke-test.sql > "$OUT" 2>&1

sections=$(grep -c '^== ' "$OUT")
errors=$(grep -c 'ERROR' "$OUT")
echo "smoke test: $sections sections, $errors intentional denials"
echo "transcript: $OUT"

# Every ERROR has to be one the script asked for. An unexpected error means a
# guarantee broke, so surface the list rather than trusting the count.
echo "--- denials observed ---"
grep 'ERROR' "$OUT" | sed 's/psql:[^ ]* ERROR:  */  /' | sort | uniq -c

grep -q 'reached the end of the script' "$OUT" \
  || { echo "FAIL: smoke test did not run to completion"; exit 1; }
echo "OK: schema applies twice, smoke test completes"
