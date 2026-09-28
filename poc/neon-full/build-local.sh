#!/bin/bash
# Constrói um banco PostgreSQL puro a partir de um plano de migrations.
# Uso: build-local.sh <db> <plano: arquivo com um caminho .sql por linha>
# Papel dono = neondb_owner (não-superusuário), como no Neon.
set -u
DB=$1; PLAN=$2; P="psql -h 127.0.0.1 -p ${PGPORT_POC:-55440} -v ON_ERROR_STOP=1 -q"
$P -U postgres -d postgres -c "drop database if exists $DB" -c "do \$\$begin if not exists (select 1 from pg_roles where rolname='neondb_owner') then create role neondb_owner login createrole; end if; end\$\$" -c "create database $DB owner neondb_owner" >/dev/null
$P -U postgres -d $DB -c "alter schema public owner to neondb_owner" >/dev/null
$P -U postgres -d $DB -f "$(dirname "$0")/sql/00_supabase_compat.sql" >/dev/null 2>&1 || { echo "FAIL compat"; exit 1; }
$P -U postgres -d $DB -c "alter schema auth owner to neondb_owner; alter table auth.users owner to neondb_owner; alter function auth.uid() owner to neondb_owner; alter function auth.jwt() owner to neondb_owner; alter function auth.role() owner to neondb_owner; grant anon, authenticated, service_role to neondb_owner" >/dev/null
$P -U neondb_owner -d $DB -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role; alter default privileges in schema public grant all on sequences to anon, authenticated, service_role; alter default privileges in schema public grant execute on functions to anon, authenticated, service_role" >/dev/null
ok=0; n=0
while read -r f; do
  [ -z "$f" ] && continue; n=$((n+1))
  out=$($P -U neondb_owner -d $DB -1 -f "$f" 2>&1)
  if [ $? -ne 0 ]; then echo "FAIL $(basename "$f")"; echo "$out" | grep -E "ERROR|DETAIL|LINE" | head -3; exit 2; fi
  ok=$((ok+1))
done < "$PLAN"
echo "OK $ok/$n"
