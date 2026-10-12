#!/bin/bash
# Testa docs/homologacao/producao/backup/validar-restauracao-dump.sh com um dump
# SIMULADO (pg_dump de uma cópia LOCAL no estado da produção — não é o
# `supabase db dump` real, que precisa de rede, credencial e imagem Docker).
# Positivo: dump íntegro restaurado num banco vazio → DUMP VALIDADO.
# Negativos: alvo já usado; URL citando o ref de produção; arquivo adulterado;
# inventário divergente; linha faltando no banco restaurado.
# Uso: poc/neon-full/integracao/testar-validacao-dump.sh [banco-0075]
set -uo pipefail
cd "$(dirname "$0")/../../.."
BASE=${1:-crm_base}
PORT=${PGPORT_POC:-55440}
V=docs/homologacao/producao/backup/validar-restauracao-dump.sh
INV=docs/homologacao/producao/backup/inventario-catalogo.sql
D=$(mktemp -d); N=$(mktemp -d); chmod 700 "$D" "$N"
trap 'rm -rf "$D" "$N"' EXIT
FAIL=0
P() { psql -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }
ok() { if [ "$2" = "$3" ]; then echo "  OK    $1"; else echo "  FALHA $1: esperado [$2], obtido [$3]"; FAIL=1; fi; }
alvo() { P -d postgres -qc "drop database if exists dump_alvo" -c "create database dump_alvo template template0" 2>&1 | grep -v NOTICE; }
valida() { TARGET_DB_URL="${2:-postgres://postgres@127.0.0.1:$PORT/dump_alvo}" bash "$V" "$1" 2>&1; }
manifesto() { (cd "$1" && sha256sum roles.sql schema.sql data.sql historico-schema.sql historico-dados.sql inventario-producao.txt > MANIFEST.sha256); }

P -d postgres -qc "drop database if exists dump_origem" -c "create database dump_origem template $BASE" 2>&1 | grep -v NOTICE
P -d dump_origem -qc "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text); insert into supabase_migrations.schema_migrations values ('20260929165645', null, '0075_company_roles_and_user_invites')"
PD="pg_dump -h 127.0.0.1 -p $PORT -U postgres -d dump_origem"
echo "-- papéis já existem no cluster local" > "$D/roles.sql"
$PD -s -N supabase_migrations > "$D/schema.sql" 2>/dev/null
$PD -a -N supabase_migrations > "$D/data.sql" 2>/dev/null
$PD -s -n supabase_migrations > "$D/historico-schema.sql"
$PD -a -n supabase_migrations > "$D/historico-dados.sql"
P -d dump_origem -X -v ON_ERROR_STOP=1 -AtF '|' -f "$INV" > "$D/inventario-producao.txt"
manifesto "$D"

echo "== positivo"
alvo
ok "dump íntegro → DUMP VALIDADO" 1 "$(valida "$D" | grep -c 'DUMP VALIDADO')"
echo "   $(grep -c '' "$D/linhas-esperadas.txt") tabelas com linhas conferidas; $(grep -c '' "$D/inventario-producao.txt") itens de catálogo"

echo "== negativos"
ok "alvo já com tabelas é recusado" 1 "$(valida "$D" | grep -c 'já tem tabelas')"
ok "URL citando o ref de produção é recusada" 1 "$(valida "$D" "postgres://postgres@127.0.0.1:$PORT/dump_alvo?application_name=bshvfsxapwwfntowdxyr" | grep -c 'aponta para o projeto de produção')"
cp -a "$D/." "$N/"; L=$(grep -n '^COPY public.companies' "$N/data.sql" | cut -d: -f1); sed -i "$((L+1))d" "$N/data.sql"; alvo
ok "data.sql adulterado (manifesto antigo)" 1 "$(valida "$N" | grep -c 'MANIFEST.sha256 não confere')"
cp -a "$D/." "$N/"; sed -i 's/^policies|\([0-9]*\)|/policies|9999|/' "$N/inventario-producao.txt"; manifesto "$N"; alvo
ok "catálogo divergente da produção" 1 "$(valida "$N" | grep -c 'inventário do restaurado difere')"
cp -a "$D/." "$N/"; alvo; valida "$N" > /dev/null
P -d dump_alvo -qc "set session_replication_role = replica; delete from public.companies where id = (select id from public.companies limit 1)"
div=0; while IFS='|' read -r t e; do o=$(P -d dump_alvo -Atc "select count(*) from \"${t%%.*}\".\"${t#*.}\""); [ "$o" = "$e" ] || div=$((div+1)); done < "$N/linhas-esperadas.txt"
ok "linha faltando no restaurado é detectada pela conferência do passo 3" 1 "$div"

P -d postgres -qc "drop database if exists dump_alvo" -c "drop database if exists dump_origem" 2>&1 | grep -v NOTICE
echo
[ $FAIL = 0 ] && echo "RESULTADO: todas as verificações passaram" || echo "RESULTADO: HÁ FALHAS"
exit $FAIL
