#!/bin/bash
# Valida a sequência integrada de migrations SEM fazer merge de branches.
# Lê 0076–0088 da outra linha de trabalho por `git show` e as soma às
# migrations desta branch (0089+). Só bancos LOCAIS descartáveis (prefixo vi_).
#
# Cenários:
#   vi_branch       vazio → 0001–0075 (equivalente à produção) + 0089+     (só esta linha)
#   vi_int          vazio → 0001–0075 + 0076–0088 (outra linha) + 0089+    (sequência integrada)
#   vi_incr         cópia de um banco no estado da produção (0075) → 0076+ (incremental)
#   vi_upd          cópia de um banco que já tem 0076–0088 → 0089+          (já atualizado; opcional)
# Depois: reaplica as migrations desta branch (idempotência) e compara o
# esquema (pg_dump --schema-only) e o catálogo de permissões entre cenários.
#
# Uso: poc/neon-full/integracao/validar-sequencia.sh [ref-da-outra-linha] [banco-0075] [banco-0088]
#   ref padrão: origin/claude/e2e-empresa-nova-correcoes
#   banco-0075: banco local no estado da produção (ex.: crm_base); vazio = pula vi_incr
#   banco-0088: banco local com 0076–0088 aplicadas (ex.: educa_poc); vazio = pula vi_upd
set -euo pipefail
cd "$(dirname "$0")/../../.."
REF=${1:-origin/claude/e2e-empresa-nova-correcoes}
BASE0075=${2:-}
BASE0088=${3:-}
PORT=${PGPORT_POC:-55440}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/outra"

for f in $(git ls-tree --name-only "$REF" supabase/migrations/ | grep -E '/00(7[6-9]|8[0-8])_'); do
  git show "$REF:$f" > "$WORK/outra/$(basename "$f")"
done
ls "$WORK/outra" | sed 's/^/outra linha: /'
mine=$(ls supabase/migrations/*.sql | awk -F/ '{n=substr($NF,1,4)+0; if (n>=89) print}')
echo "$mine" | sed 's#^#esta branch: #'

head -93 poc/neon-full/plan-prod-equivalente.txt | sed "s#^#$PWD/#" > "$WORK/plan-0075.txt"
tail -1 "$WORK/plan-0075.txt" | grep -q 0075_ || { echo "plano até a 0075 inesperado"; exit 1; }
{ cat "$WORK/plan-0075.txt"; for f in $mine; do echo "$PWD/$f"; done; } > "$WORK/plan-branch.txt"
{ cat "$WORK/plan-0075.txt"; ls "$WORK"/outra/*.sql | sort; for f in $mine; do echo "$PWD/$f"; done; } > "$WORK/plan-int.txt"

apply() { # banco arquivos...
  local db=$1; shift
  for f in "$@"; do
    psql -h 127.0.0.1 -p "$PORT" -U neondb_owner -d "$db" -v ON_ERROR_STOP=1 -q -1 -f "$f" 2>&1 | grep -iE "warning|error" || true
  done
}
clone() { # novo origem
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qc "drop database if exists $1" -c "create database $1 template $2 owner neondb_owner" 2>&1 | grep -v NOTICE || true
}
dump() {
  pg_dump -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" --schema-only --no-owner -n public | grep -v '^--' | grep -v '^\\\(un\)\?restrict' | sed '/^$/d' > "$WORK/schema-$1.sql"
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -Atc "select code||'|'||module||'|'||action from permissions order by 1" > "$WORK/perm-$1.txt"
}

echo "== vi_branch (vazio → só esta linha)"; poc/neon-full/build-local.sh vi_branch "$WORK/plan-branch.txt" | grep -v NOTICE
echo "== vi_int (vazio → sequência integrada)"; poc/neon-full/build-local.sh vi_int "$WORK/plan-int.txt" | grep -v NOTICE
echo "== idempotência: reaplica as migrations desta branch em vi_int"; apply vi_int $mine; echo ok
dump vi_branch; dump vi_int

if [ -n "$BASE0075" ]; then
  echo "== vi_incr ($BASE0075 → 0076+)"; clone vi_incr "$BASE0075"; apply vi_incr $(ls "$WORK"/outra/*.sql | sort) $mine; dump vi_incr
  echo "vi_int × vi_incr: esquema $(diff "$WORK/schema-vi_int.sql" "$WORK/schema-vi_incr.sql" | grep -c '^[<>]') linha(s) diferentes; permissões $(diff "$WORK/perm-vi_int.txt" "$WORK/perm-vi_incr.txt" | grep -c '^[<>]')"
fi
if [ -n "$BASE0088" ]; then
  echo "== vi_upd ($BASE0088 → 0089+)"; clone vi_upd "$BASE0088"; apply vi_upd $mine; dump vi_upd
  echo "vi_int × vi_upd: esquema $(diff "$WORK/schema-vi_int.sql" "$WORK/schema-vi_upd.sql" | grep -c '^[<>]') linha(s) diferentes; permissões $(diff "$WORK/perm-vi_int.txt" "$WORK/perm-vi_upd.txt" | grep -c '^[<>]')"
fi
for db in vi_branch vi_int; do
  echo "$db: policy units_select_authenticated=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $db -Atc "select count(*) from pg_policy where polname='units_select_authenticated'") \
FKs por empresa validadas=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $db -Atc "select count(*) filter (where convalidated)||'/'||count(*) from pg_constraint where conname like '%same_company_fk'") \
views security_invoker=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $db -Atc "select count(*) from pg_class where relname in ('v_cash_flow_summary','v_cash_flow_projection','inventory_valuation','v_sales_order_item_margin') and reloptions::text like '%security_invoker=true%'")/4"
done
