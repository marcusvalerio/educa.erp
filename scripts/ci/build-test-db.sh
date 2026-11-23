#!/bin/bash
# Monta o banco dos testes de banco (tests/*-db.test.ts) num PostgreSQL vazio:
# camada de compatibilidade do Supabase + plano equivalente à produção
# (poc/neon-full/plan-prod-equivalente.txt) + migrations posteriores ao plano
# + dados mínimos (seed-db-tests.sql). Roda como superusuário (a 0098 altera
# privilégios padrão do papel postgres).
# Uso: DATABASE_ADMIN_URL=postgres://postgres@127.0.0.1:5432 build-test-db.sh <banco>
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${1:-educa_ci}
BASE=${DATABASE_ADMIN_URL:-postgres://postgres@127.0.0.1:5432}
psql "$BASE/postgres" -q -v ON_ERROR_STOP=1 -c "set client_min_messages = warning" -c "drop database if exists $DB" -c "create database $DB"
P="psql $BASE/$DB -q -v ON_ERROR_STOP=1"

PLAN=poc/neon-full/plan-prod-equivalente.txt
LAST=$(grep '^supabase/migrations/' "$PLAN" | tail -1 | xargs basename | cut -c1-4)
FILES=(poc/neon-full/sql/00_supabase_compat.sql)
while read -r f; do [ -n "$f" ] && FILES+=("$f"); done < "$PLAN"
for f in supabase/migrations/*.sql; do
  [[ "$(basename "$f" | cut -c1-4)" > "$LAST" ]] && FILES+=("$f")
done
FILES+=(scripts/ci/seed-db-tests.sql)

for f in "${FILES[@]}"; do
  if ! out=$($P -1 -f "$f" 2>&1); then
    echo "FALHA ao aplicar $f"; echo "$out" | grep -E "ERROR|DETAIL|LINE" | head -5; exit 1
  fi
done
echo "Banco $DB pronto: ${#FILES[@]} arquivos aplicados."
