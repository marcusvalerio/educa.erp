#!/bin/bash
# Testa docs/homologacao/producao/backup/validar-restauracao-dump.sh com um dump
# SIMULADO (pg_dump de uma cópia LOCAL no estado da produção — não é o
# `supabase db dump` real, que precisa de rede, credencial e imagem Docker).
# O PostgreSQL local é 16: os casos usam VERSAO_MINIMA_ALVO=160000, e o
# validador marca o resultado como TESTE (nunca "DUMP VALIDADO").
# Casos: positivo; alvo < 17 recusado sem a variável de teste; alvo já usado;
# URL de produção; arquivo adulterado; resumo do catálogo divergente; objeto
# divergente (policy removida) apontado pelo nome; várias divergências
# registradas de uma vez; erro de restauração sem dados no terminal.
# Uso: poc/neon-full/integracao/testar-validacao-dump.sh [banco-0075]
set -uo pipefail
cd "$(dirname "$0")/../../.."
BASE=${1:-crm_base}
PORT=${PGPORT_POC:-55440}
V=docs/homologacao/producao/backup/validar-restauracao-dump.sh
INV=docs/homologacao/producao/backup/inventario-catalogo.sql
DET=docs/homologacao/producao/backup/inventario-detalhe.sql
D=$(mktemp -d); N=$(mktemp -d); chmod 700 "$D" "$N"
trap 'rm -rf "$D" "$N"' EXIT
FAIL=0
P() { psql -h 127.0.0.1 -p "$PORT" -U postgres "$@"; }
ok() { if [ "$2" = "$3" ]; then echo "  OK    $1"; else echo "  FALHA $1: esperado [$2], obtido [$3]"; FAIL=1; fi; }
alvo() { P -d postgres -qc "drop database if exists dump_alvo" -c "create database dump_alvo template template0" 2>&1 | grep -v NOTICE; }
URL_ALVO="postgres://postgres@127.0.0.1:$PORT/dump_alvo"
valida() { VERSAO_MINIMA_ALVO=160000 TARGET_DB_URL="${2:-$URL_ALVO}" bash "$V" "$1" 2>&1; }
manifesto() { (cd "$1" && sha256sum roles.sql schema.sql data.sql historico-schema.sql historico-dados.sql inventario-producao.txt inventario-detalhe-producao.txt > MANIFEST.sha256); }
copia() { rm -rf "${N:?}"/*; cp -a "$D/." "$N/"; rm -f "$N"/relatorio-validacao.txt "$N"/restauracao.log; }

P -d postgres -qc "drop database if exists dump_origem" -c "create database dump_origem template $BASE" 2>&1 | grep -v NOTICE
P -d dump_origem -qc "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text); insert into supabase_migrations.schema_migrations values ('20260929165645', null, '0075_company_roles_and_user_invites')"
PD="pg_dump -h 127.0.0.1 -p $PORT -U postgres -d dump_origem"
echo "-- papéis já existem no cluster local" > "$D/roles.sql"
$PD -s -N supabase_migrations > "$D/schema.sql" 2>/dev/null
$PD -a -N supabase_migrations > "$D/data.sql" 2>/dev/null
$PD -s -n supabase_migrations > "$D/historico-schema.sql"
$PD -a -n supabase_migrations > "$D/historico-dados.sql"
P -d dump_origem -X -v ON_ERROR_STOP=1 -AtF '|' -f "$INV" > "$D/inventario-producao.txt"
P -d dump_origem -X -v ON_ERROR_STOP=1 -At -f "$DET" > "$D/inventario-detalhe-producao.txt"
manifesto "$D"

echo "== positivo"
copia; alvo; SAIDA=$(valida "$N")
ok "dump íntegro → TESTE LOCAL OK (0 divergências)" 1 "$(printf '%s' "$SAIDA" | grep -c 'TESTE LOCAL OK')"
ok "nunca 'DUMP VALIDADO' com a variável de teste" 0 "$(printf '%s' "$SAIDA" | grep -c 'DUMP VALIDADO')"
ok "relatório gravado com permissão 600" 600 "$(stat -c %a "$N/relatorio-validacao.txt")"
echo "   $(grep -c '' "$N/linhas-esperadas.txt") tabelas com linhas; $(grep -c '' "$D/inventario-detalhe-producao.txt") objetos no inventário detalhado"

echo "== alvo e integridade"
copia; alvo
ok "PostgreSQL < 17 recusado sem a variável de teste" 1 "$(TARGET_DB_URL=$URL_ALVO bash "$V" "$N" 2>&1 | grep -c 'a produção é 17')"
copia; valida "$N" > /dev/null
ok "alvo já com tabelas é recusado" 1 "$(valida "$N" | grep -c 'já tem tabelas')"
ok "URL citando o ref de produção é recusada" 1 "$(valida "$N" "$URL_ALVO?application_name=bshvfsxapwwfntowdxyr" | grep -c 'aponta para o projeto de produção')"
copia; L=$(grep -n '^COPY public.companies' "$N/data.sql" | cut -d: -f1); sed -i "$((L+1))d" "$N/data.sql"; alvo
ok "data.sql adulterado (manifesto antigo)" 1 "$(valida "$N" | grep -c 'MANIFEST.sha256 não confere')"

echo "== divergências registradas, não ignoradas"
copia; sed -i 's/^policies|\([0-9]*\)|/policies|9999|/' "$N/inventario-producao.txt"; manifesto "$N"; alvo
SAIDA=$(valida "$N")
ok "resumo do catálogo divergente" 1 "$(printf '%s' "$SAIDA" | grep -c 'inventário do restaurado difere')"
ok "resultado: DUMP NÃO VALIDADO" 1 "$(printf '%s' "$SAIDA" | grep -c 'DUMP NÃO VALIDADO')"
copia; grep -v '^policy|units\.units_select_authenticated|' "$D/inventario-detalhe-producao.txt" > "$N/inventario-detalhe-producao.txt"
sed -i 's/^tabelas|\([0-9]*\)|/tabelas|0|/' "$N/inventario-producao.txt"; manifesto "$N"; alvo
SAIDA=$(valida "$N")
ok "objeto a mais apontado pelo nome (policy units_select_authenticated)" 1 "$(printf '%s' "$SAIDA" | grep -c 'só no restaurado: policy|units.units_select_authenticated')"
ok "várias divergências na mesma execução (catálogo + objeto)" 1 "$(printf '%s' "$SAIDA" | grep -cE 'divergências: [2-9]')"
ok "divergências gravadas no relatório" 1 "$( [ "$(grep -c 'DIVERGE' "$N/relatorio-validacao.txt")" -ge 2 ] && echo 1 || echo 0)"

echo "== erro de restauração sem dados no terminal"
copia; L=$(grep -n '^COPY public.companies' "$N/data.sql" | cut -d: -f1)
sed -i "$((L+1))s/^/DADO-SENSIVEL-NAO-EXIBIR\t/" "$N/data.sql"; manifesto "$N"; alvo
SAIDA=$(valida "$N")
ok "restauração com erro detectada" 1 "$(printf '%s' "$SAIDA" | grep -c 'restauração com erro')"
ok "linha de dados não aparece no terminal" 0 "$(printf '%s' "$SAIDA" | grep -c 'DADO-SENSIVEL-NAO-EXIBIR')"
ok "linha de dados não aparece no relatório" 0 "$(grep -c 'DADO-SENSIVEL-NAO-EXIBIR' "$N/relatorio-validacao.txt")"

P -d postgres -qc "drop database if exists dump_alvo" -c "drop database if exists dump_origem" 2>&1 | grep -v NOTICE
echo
[ $FAIL = 0 ] && echo "RESULTADO: todas as verificações passaram" || echo "RESULTADO: HÁ FALHAS"
exit $FAIL
