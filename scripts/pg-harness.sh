#!/usr/bin/env bash
# Rebuild a throwaway Postgres cluster that emulates Supabase's auth schema, so
# schema.sql / seed.sql / smoke-test.sql can be exercised without a Supabase
# project. Everything lives under /tmp and is safe to delete.
set -euo pipefail

PGBIN=/usr/lib/postgresql/17/bin
PGDATA=/tmp/opencode/gdcmas-pg
PGPORT=${PGPORT:-5433}
DB=gdcmas
LOG=/tmp/opencode/pg.log

# Stop a cluster left over from a previous run before deleting its data dir,
# otherwise the running postmaster keeps serving a directory that no longer
# exists and fails with a missing pg_filenode.map.
if [ -f "$PGDATA/postmaster.pid" ]; then
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate -w stop > /dev/null 2>&1 || true
fi

rm -rf "$PGDATA"
"$PGBIN/initdb" -D "$PGDATA" -U khent --locale=en_PH.UTF-8 --encoding=UTF8 \
  > /tmp/opencode/initdb.log 2>&1

"$PGBIN/pg_ctl" -D "$PGDATA" -l "$LOG" -o "-p $PGPORT -k /tmp/opencode -c listen_addresses=''" -w start \
  > /dev/null

psql -h /tmp/opencode -p "$PGPORT" -U khent -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
-- Supabase's three request roles.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create database gdcmas;
SQL

psql -h /tmp/opencode -p "$PGPORT" -U khent -d "$DB" -v ON_ERROR_STOP=1 -q <<'SQL'
-- Minimal stand-in for GoTrue's table. Only the columns the trigger reads.
create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase exposes the JWT subject to Postgres as a GUC, and auth.uid() reads
-- it. A placeholder GUC is enough for the smoke test to impersonate a user.
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant all on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
SQL

echo "cluster ready on port $PGPORT (db $DB)"
