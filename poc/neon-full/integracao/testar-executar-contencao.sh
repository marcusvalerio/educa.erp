#!/bin/bash
# Testa docs/homologacao/producao/executar-contencao.sh contra cópias LOCAIS
# descartáveis de um banco no estado da produção (0075). Nunca produção.
#
# Gera uma cópia do wrapper em pasta temporária trocando SÓ as constantes de
# ambiente (ref, hash, identidade, PGUSER/PGDATABASE/PGHOST esperados) e os SQL
# pela versão com a guarda localizada; confere que o resto do wrapper é idêntico.
# Caminhos: sucesso; já aplicada; hash divergente; backup não confirmado;
# confirmação final errada; banco errado; falha dentro da transação (catálogo
# intacto); somente leitura de fato nas consultas de conferência.
#
# Uso: poc/neon-full/integracao/testar-executar-contencao.sh [banco-0075]   (padrão crm_base)
set -uo pipefail
cd "$(dirname "$0")/../../.."
BASE=${1:-crm_base}
PORT=${PGPORT_POC:-55440}
SRC=docs/homologacao/producao
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
FAIL=0
P() { psql -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }
ok() { if [ "$2" = "$3" ]; then echo "  OK    $1"; else echo "  FALHA $1: esperado [$2], obtido [$3]"; FAIL=1; fi; }
clone() {
  P -d postgres -qc "drop database if exists vx_exec" -c "create database vx_exec template $BASE owner neondb_owner" 2>&1 | grep -v NOTICE
  P -d vx_exec -qc "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations values ('20260929165645', null, '0075_company_roles_and_user_invites');
    grant usage on schema supabase_migrations to neondb_owner; grant select on supabase_migrations.schema_migrations to neondb_owner"
}
snap() { P -d vx_exec -Atc "select md5(string_agg(x, ',' order by x)) from (
  select polname x from pg_policy where polrelid = 'public.units'::regclass
  union all select relname || coalesce(reloptions::text, '') || relacl::text from pg_class where relkind = 'v' and relnamespace = 'public'::regnamespace
  union all select proacl::text from pg_proc where proname = 'fn_resolve_applicable_tax_rules') s"; }
roda() { printf "$1" | bash "$T/executar-contencao.sh" "$T/out-$2" 2>&1; }

clone
ID=$(P -d vx_exec -Atc "select system_identifier from pg_control_system()")
for f in contencao-emergencial.sql precondicoes.sql verificacao.sql; do
  sed -e "s/7678069749886157684/$ID/" -e "s/current_database() = 'postgres'/current_database() = 'vx_exec'/" \
      -e "s/current_database() <> 'postgres'/current_database() <> 'vx_exec'/" "$SRC/$f" > "$T/$f"
done
NSHA=$(sha256sum "$T/contencao-emergencial.sql" | cut -d' ' -f1)
sed -e "s/^REF=.*/REF=\"localteste\"/" -e "s/^SHA_ESPERADO=.*/SHA_ESPERADO=\"$NSHA\"/" -e "s#^ID_ESPERADO=.*#ID_ESPERADO=\"$ID/vx_exec\"#" \
    -e 's/\[ "${PGUSER:-}" = "postgres.$REF" \]/[ "${PGUSER:-}" = "neondb_owner" ]/' \
    -e 's/\[ "${PGDATABASE:-}" = "postgres" \]/[ "${PGDATABASE:-}" = "vx_exec" ]/' \
    -e 's/\*supabase\*) ;;/*127.0.0.1*) ;;/' "$SRC/executar-contencao.sh" > "$T/executar-contencao.sh"
ok "cópia de teste difere do wrapper só nas 3 checagens de ambiente" 6 \
  "$(diff <(grep -vE '^(REF|SHA_ESPERADO|ID_ESPERADO)=' "$SRC/executar-contencao.sh") <(grep -vE '^(REF|SHA_ESPERADO|ID_ESPERADO)=' "$T/executar-contencao.sh") | grep -c '^[<>]')"
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=neondb_owner PGDATABASE=vx_exec

echo "== somente leitura de fato nas conferências"
ok "escrita recusada após 'set session characteristics … read only'" 1 \
  "$(psql -X -q -c 'set session characteristics as transaction read only' -c 'create temp table zz (x int)' 2>&1 | grep -c 'read-only transaction')"

echo "== interrupções antes de qualquer alteração"
S0=$(snap)
cp "$T/contencao-emergencial.sql" "$T/c.bak"; echo "-- alterado" >> "$T/contencao-emergencial.sql"
ok "hash divergente" 1 "$(roda 'sim\nsim\nsim\nx\nAPLICAR localteste\n' h | grep -c 'PARADO: hash divergente')"
mv "$T/c.bak" "$T/contencao-emergencial.sql"
ok "backup não confirmado" 1 "$(roda 'nao\n' b | grep -c 'PARADO: pré-requisito não confirmado: Backup')"
ok "confirmação final errada" 1 "$(roda 'sim\nsim\nsim\nx\naplicar\n' c | grep -c 'PARADO: confirmação final não recebida')"
sed -i "s#^ID_ESPERADO=.*#ID_ESPERADO=\"0/outro\"#" "$T/executar-contencao.sh"
ok "banco errado" 1 "$(roda 'sim\nsim\nsim\nx\n' i | grep -c 'PARADO: banco conectado')"
sed -i "s#^ID_ESPERADO=.*#ID_ESPERADO=\"$ID/vx_exec\"#" "$T/executar-contencao.sh"
ok "catálogo intacto após as interrupções" "$S0" "$(snap)"

echo "== falha dentro da transação (anon herda SELECT de outro papel)"
P -d vx_exec -qc "create role vx_ind nologin; grant vx_ind to anon with inherit true; grant select on public.v_cash_flow_summary to vx_ind"
S1=$(snap)
ok "abortou e registrou verificação pós-falha" 1 "$(roda 'sim\nsim\nsim\nx\nAPLICAR localteste\n' f | grep -c 'PARADO: a contenção abortou')"
ok "catálogo intacto após a falha" "$S1" "$(snap)"
[ -s "$T/out-f/verificacao-pos-falha.txt" ] && ok "verificacao-pos-falha.txt gravada" 1 1 || ok "verificacao-pos-falha.txt gravada" 1 0
P -d vx_exec -qc "revoke select on public.v_cash_flow_summary from vx_ind; revoke vx_ind from anon; drop role vx_ind"

echo "== sucesso e segunda execução"
SAIDA=$(roda 'sim\nsim\nsim\nx\nAPLICAR localteste\n' s)
ok "COMMIT e verificação depois t…t" 1 "$(printf '%s' "$SAIDA" | grep -c 'contenção aplicada e verificada')"
ok "antes registrado" "f t t f f f f t t" "$(cut -d' ' -f2- "$T/out-s/verificacao-antes.txt")"
ok "pré-condições" "t t t t t t t neondb_owner f" "$(cat "$T/out-s/precondicoes.txt")"
ok "depois registrado" "t t t t t t t t t" "$(cut -d' ' -f2- "$T/out-s/verificacao-depois.txt")"
ok "permissões da pasta de saída" "700" "$(stat -c %a "$T/out-s")"
ok "senha fora do log" 0 "$(grep -c '^x$' "$T/out-s/execucao.log")"
ok "segunda execução: já aplicada" 1 "$(roda 'sim\nsim\nsim\nx\n' s2 | grep -c 'JÁ está aplicada')"

echo
[ $FAIL = 0 ] && echo "RESULTADO: todas as verificações passaram" || echo "RESULTADO: HÁ FALHAS"
exit $FAIL
