#!/bin/bash
# Testa a contenção emergencial (docs/homologacao/producao/*.sql) em cópias
# LOCAIS descartáveis de um banco no estado da produção (0075). Nunca produção.
#
# A guarda de identidade do script é trocada pela identidade do banco local
# (system_identifier e nome) só na cópia temporária; o arquivo do repositório
# não muda. O ledger supabase_migrations.schema_migrations (inexistente no
# local) é criado na cópia só com a linha 0075, como em produção.
#
# Executor: neondb_owner — dono das views/função e NÃO superusuário, como o
# papel postgres no Supabase (grants concedidos pelo próprio dono).
#
# Uso: poc/neon-full/integracao/testar-contencao.sh [banco-0075]   (padrão crm_base)
set -euo pipefail
cd "$(dirname "$0")/../../.."
BASE=${1:-crm_base}
PORT=${PGPORT_POC:-55440}
DIR=docs/homologacao/producao
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
PROD_ID=7678069749886157684
FAIL=0

q() { psql -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -Atc "$2"; }
run_as_owner() { # banco arquivo → código de saída do psql
  psql -h 127.0.0.1 -p "$PORT" -U neondb_owner -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" > "$WORK/out.txt" 2>&1 && return 0 || return 1
}
clone() {
  psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qc "drop database if exists $1" -c "create database $1 template $BASE owner neondb_owner" 2>&1 | grep -v NOTICE || true
  q "$1" "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
          insert into supabase_migrations.schema_migrations (version, name) values ('20260929165645', '0075_company_roles_and_user_invites');
          grant usage on schema supabase_migrations to neondb_owner; grant select, insert, delete on supabase_migrations.schema_migrations to neondb_owner" > /dev/null
}
localize() { # banco arquivo-origem → arquivo com a guarda apontando para o banco local
  local id; id=$(q "$1" "select system_identifier from pg_control_system()")
  sed -e "s/<> $PROD_ID/<> $id/" -e "s/current_database() <> 'postgres'/current_database() <> '$1'/" "$2" > "$WORK/$(basename "$2" .sql)-$1.sql"
  grep -q "<> $id" "$WORK/$(basename "$2" .sql)-$1.sql" || { echo "guarda não localizada em $2"; exit 1; }
  echo "$WORK/$(basename "$2" .sql)-$1.sql"
}
verif() { psql -h 127.0.0.1 -p "$PORT" -U neondb_owner -d "$1" -AtF' ' -f "$DIR/verificacao.sql" | cut -d' ' -f2- ; }
snapshot() { # catálogo dos objetos tocados: policies de units, opções/ACL das views, ACL da função
  # (entradas de ACL ordenadas: GRANT/REVOKE não preservam a ordem, só o conteúdo importa)
  q "$1" "select string_agg(x, E'\n' order by x) from (
      select 'policy '||polname||' '||polcmd::text||' '||array_to_string(polroles::regrole[], ',')||' '||coalesce(pg_get_expr(polqual, polrelid), '') x from pg_policy where polrelid = 'public.units'::regclass
      union all select 'view '||relname||' '||coalesce(reloptions::text, '-')||' '||coalesce((select string_agg(e, ',' order by e) from unnest(relacl::text[]) e), '-') from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm')
      union all select 'fn '||proname||' '||coalesce((select string_agg(e, ',' order by e) from unnest(proacl::text[]) e), '-') from pg_proc where proname = 'fn_resolve_applicable_tax_rules') s"
}
aborts() { # descrição arquivo padrão-da-mensagem → exige aborto PELO motivo esperado
  if run_as_owner $DB "$2"; then echo "  FALHA $1: aplicou"; FAIL=1
  elif grep -q "$3" "$WORK/out.txt"; then echo "  OK   $1 — abortou: $(grep -o 'ERROR: .*' "$WORK/out.txt" | head -1)"
  else echo "  FALHA $1: abortou por outro motivo: $(grep -o 'ERROR: .*' "$WORK/out.txt" | head -1)"; FAIL=1; fi
}
check() { # descrição esperado obtido
  if [ "$2" = "$3" ]; then echo "  OK   $1: $3"; else echo "  FALHA $1: esperado [$2], obtido [$3]"; FAIL=1; fi
}
ANTES="f t t f f f f t t"
DEPOIS="t t t t t t t t t"

echo "== A. cópia de $BASE (estado da produção)"
DB=vc_a; clone $DB
C=$(localize $DB $DIR/contencao-emergencial.sql)
check "verificação antes" "$ANTES" "$(verif $DB)"
S0=$(snapshot $DB)
echo "  exposições antes (privilégios efetivos):"
q $DB "select '    anon SELECT views='||count(*) filter (where has_table_privilege('anon', oid, 'SELECT'))||'/4; authenticated SELECT views='||count(*) filter (where has_table_privilege('authenticated', oid, 'SELECT'))||'/4' from pg_class where relnamespace='public'::regnamespace and relkind='v'"
q $DB "select '    execute fn regras fiscais: anon='||has_function_privilege('anon', p.oid, 'execute')||' authenticated='||has_function_privilege('authenticated', p.oid, 'execute')||' service_role='||has_function_privilege('service_role', p.oid, 'execute') from pg_proc p where proname='fn_resolve_applicable_tax_rules'"
q $DB "select '    policy USING (true) em units: '||count(*) from pg_policy where polrelid='public.units'::regclass and pg_get_expr(polqual, polrelid)='true'"

echo "== B. falha deliberada: script SEM localizar (identidade da produção) num banco que não é a produção"
aborts "identidade" $DIR/contencao-emergencial.sql "banco não é o de produção esperado"
check "nada parcial (catálogo idêntico)" "$(echo "$S0" | md5sum)" "$(snapshot $DB | md5sum)"

echo "== C. falha deliberada: ledger sem a 0075"
q $DB "delete from supabase_migrations.schema_migrations" > /dev/null
aborts "ledger" "$C" "ledger sem 20260929165645"
check "nada parcial" "$(echo "$S0" | md5sum)" "$(snapshot $DB | md5sum)"
q $DB "insert into supabase_migrations.schema_migrations (version, name) values ('20260929165645', '0075_company_roles_and_user_invites')" > /dev/null

echo "== D. falha deliberada na VERIFICAÇÃO FINAL: anon herda SELECT por outro papel (caminho que REVOKE de anon não remove; INHERIT como o anon da produção)"
q $DB "create role vc_leitor_indireto nologin; grant vc_leitor_indireto to anon with inherit true; grant select on public.v_cash_flow_summary to vc_leitor_indireto" > /dev/null
S1=$(snapshot $DB)
aborts "verificação final" "$C" "views ainda expostas: v_cash_flow_summary"
check "nada parcial (policy, views e função como antes)" "$(echo "$S1" | md5sum)" "$(snapshot $DB | md5sum)"
q $DB "revoke select on public.v_cash_flow_summary from vc_leitor_indireto; revoke vc_leitor_indireto from anon; drop role vc_leitor_indireto" > /dev/null
check "estado restaurado após o teste D" "$(echo "$S0" | md5sum)" "$(snapshot $DB | md5sum)"

echo "== E. falha deliberada: chamadora da função que perderia acesso (SECURITY INVOKER)"
q $DB "create function public.vc_chamadora() returns int language sql as \$\$ select count(*)::int from public.fn_resolve_applicable_tax_rules(null, null, null, null, null, null, null, null, null, null, null, current_date) \$\$" > /dev/null
aborts "chamadora" "$C" "perderiam acesso: vc_chamadora()"
q $DB "drop function public.vc_chamadora()" > /dev/null
check "nada parcial" "$(echo "$S0" | md5sum)" "$(snapshot $DB | md5sum)"

echo "== F. aplicação"
if run_as_owner $DB "$C"; then echo "  OK   COMMIT"; else echo "  FALHA: $(cat "$WORK/out.txt")"; FAIL=1; fi
check "verificação depois" "$DEPOIS" "$(verif $DB)"
S2=$(snapshot $DB)
echo "$S2" | sed 's/^/    /'

echo "== G. idempotência (segunda execução)"
if run_as_owner $DB "$C"; then echo "  OK   COMMIT"; else echo "  FALHA: $(cat "$WORK/out.txt")"; FAIL=1; fi
check "catálogo igual ao da 1ª aplicação" "$(echo "$S2" | md5sum)" "$(snapshot $DB | md5sum)"

echo "== H. acesso real depois (papéis do PostgREST)"
for v in v_cash_flow_summary v_cash_flow_projection inventory_valuation v_sales_order_item_margin; do
  a=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $DB -Atc "begin; set local role anon; select count(*) from public.$v; rollback;" 2>&1 | grep -c "permission denied" || true)
  u=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $DB -Atc "begin; set local role authenticated; select count(*) from public.$v; rollback;" 2>&1 | grep -c "permission denied" || true)
  s=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $DB -Atc "begin; set local role service_role; select 'ok' from public.$v limit 0; select 'ok'; rollback;" 2>&1 | grep -c "^ok$" || true)
  check "$v anon negado / authenticated negado / service_role lê" "1 1 1" "$a $u $s"
done
for r in anon authenticated service_role; do
  d=$(psql -h 127.0.0.1 -p "$PORT" -U postgres -d $DB -Atc "begin; set local role $r; select count(*) from public.fn_resolve_applicable_tax_rules(null, null, null, null, null, null, null, null, null, null, null, current_date); rollback;" 2>&1 | grep -c "permission denied" || true)
  check "fn_resolve_applicable_tax_rules negada a $r" "1" "$d"
done

echo "== I. rollback técnico (R1–R4, padrão) numa cópia do estado contido"
DBR=vc_r; psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qc "drop database if exists $DBR" -c "create database $DBR template $DB owner neondb_owner" 2>&1 | grep -v NOTICE || true
R=$(localize $DBR $DIR/rollback-contencao.sql)
if run_as_owner $DBR "$R"; then echo "  OK   COMMIT"; else echo "  FALHA: $(cat "$WORK/out.txt")"; FAIL=1; fi
check "verificação após rollback técnico (reabre E1; E2 para logados; anon segue fechado)" "f t t t f f f t t" "$(verif $DBR)"
check "falha deliberada do rollback fora da produção" "abortou" "$(run_as_owner $DBR $DIR/rollback-contencao.sql && echo aplicou || { grep -q 'Rollback: banco não é o de produção esperado' "$WORK/out.txt" && echo abortou || echo outro-motivo; })"
C2=$(localize $DBR $DIR/contencao-emergencial.sql)
if run_as_owner $DBR "$C2"; then echo "  OK   reaplicação da contenção após rollback: COMMIT"; else echo "  FALHA: $(cat "$WORK/out.txt")"; FAIL=1; fi
check "verificação após reaplicar" "$DEPOIS" "$(verif $DBR)"
check "catálogo igual ao da 1ª aplicação" "$(echo "$S2" | md5sum)" "$(snapshot $DBR | md5sum)"

echo "== J. rollback INTEGRAL (R5 descomentada) reproduz exatamente o estado anterior"
DBF=vc_f; psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qc "drop database if exists $DBF" -c "create database $DBF template $DB owner neondb_owner" 2>&1 | grep -v NOTICE || true
RF=$(localize $DBF $DIR/rollback-contencao.sql)
# Descomenta R5 e remove a 1ª checagem da conferência (como o cabeçalho manda).
python3 - "$RF" <<'PY'
import sys, re
p = sys.argv[1]; s = open(p).read()
a = s.index("-- ------------------------------------------------------------------ R5")
b = s.index("-- ------------------------------------------------------------------ conferência")
r5 = "\n".join(l[3:] if l.startswith("-- ") and not l.startswith("-- ---") else l for l in s[a:b].splitlines()) + "\n"
s = s[:a] + r5 + s[b:]
s = re.sub(r"  if exists \(select 1 from pg_class c, aclexplode.*?end if;\n", "", s, count=1, flags=re.S)
open(p, "w").write(s)
PY
if run_as_owner $DBF "$RF"; then echo "  OK   COMMIT"; else echo "  FALHA: $(cat "$WORK/out.txt")"; FAIL=1; fi
check "verificação = estado vulnerável original" "$ANTES" "$(verif $DBF)"
check "catálogo idêntico ao original" "$(echo "$S0" | md5sum)" "$(snapshot $DBF | md5sum)"

echo "== K. sequência completa 0076…0094 sobre o banco contido (contenção não conflita)"
mkdir -p "$WORK/outra"
for f in $(git ls-tree --name-only origin/claude/e2e-empresa-nova-correcoes supabase/migrations/ | grep -E '/00(7[6-9]|8[0-8])_'); do git show "origin/claude/e2e-empresa-nova-correcoes:$f" > "$WORK/outra/$(basename "$f")"; done
mine=$(ls supabase/migrations/*.sql | awk -F/ '{n=substr($NF,1,4)+0; if (n>=89) print}')
DBK=vc_k; psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qc "drop database if exists $DBK" -c "create database $DBK template $DB owner neondb_owner" 2>&1 | grep -v NOTICE || true
ok=1
for f in $(ls "$WORK"/outra/*.sql | sort) $mine; do
  psql -h 127.0.0.1 -p "$PORT" -U neondb_owner -d $DBK -v ON_ERROR_STOP=1 -q -1 -f "$f" > "$WORK/k.txt" 2>&1 || { echo "  FALHA em $(basename "$f"): $(grep -i error "$WORK/k.txt" | head -2)"; ok=0; FAIL=1; break; }
done
[ $ok = 1 ] && echo "  OK   $(ls "$WORK"/outra/*.sql $mine | wc -l) migrations aplicadas"
check "verificação após a sequência" "$DEPOIS" "$(verif $DBK)"

echo
[ $FAIL = 0 ] && echo "RESULTADO: todas as verificações passaram" || echo "RESULTADO: HÁ FALHAS"
echo "Bancos mantidos para os testes de aplicação: $DB (contido), $DBR (rollback+reaplicação), $DBF (rollback integral), $DBK (contido + 0076…0094)"
exit $FAIL
