#!/usr/bin/env bash
# Restaura o dump gerado por gerar-dump-producao.sh num banco ISOLADO e prova
# que ele é utilizável. Código de saída zero do pg_dump NÃO basta; aqui se exige:
#   1. integridade dos arquivos (MANIFEST.sha256);
#   2. restauração completa sem erro, numa transação (procedimento oficial:
#      psql --single-transaction, ON_ERROR_STOP, session_replication_role=replica);
#   3. contagem de linhas de CADA tabela do data.sql = contagem no banco restaurado;
#   4. inventário do catálogo (inventario-catalogo.sql) do banco restaurado =
#      inventário da produção (inventario-producao.txt), item a item: tabelas,
#      colunas, constraints, índices, views, funções, policies, RLS, gatilhos,
#      ACLs, sequências e ledger.
#
# Alvo: um banco descartável com os papéis e schemas do Supabase — de
# preferência a pilha local (`supabase start` com major_version = 17, banco
# em 127.0.0.1:54322) ou um projeto Supabase NOVO criado só para o teste.
# A URL vem de TARGET_DB_URL (nunca da linha de comando). O script recusa
# qualquer URL que cite o projeto de produção e recusa alvo que já tenha
# tabelas em public.
#
# Uso: TARGET_DB_URL=... validar-restauracao-dump.sh <pasta-do-dump>
set -euo pipefail
umask 077
DUMP="${1:?pasta do dump}"
REF_PRODUCAO="bshvfsxapwwfntowdxyr"
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd -P)"
: "${TARGET_DB_URL:?defina TARGET_DB_URL (banco isolado)}"
falha() { echo "FALHA: $*" >&2; exit 1; }
q() { psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 -At "$@"; }

case "$TARGET_DB_URL" in *"$REF_PRODUCAO"*) falha "TARGET_DB_URL aponta para o projeto de produção. Use um banco isolado." ;; esac
[ "$(q -c "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p')")" = "0" ] \
  || falha "o banco alvo já tem tabelas em public — use um banco vazio."
q -c "select 1 from pg_roles where rolname in ('anon','authenticated','service_role') having count(*) = 3" | grep -q 1 \
  || falha "o alvo não tem os papéis do Supabase (anon/authenticated/service_role). Use a pilha local do Supabase ou um projeto novo."

echo "== 1. integridade dos arquivos"
( cd "$DUMP" && sha256sum -c MANIFEST.sha256 ) || falha "MANIFEST.sha256 não confere."

echo "== 2. restauração (uma transação)"
psql "$TARGET_DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 -q \
  --file "$DUMP/roles.sql" \
  --file "$DUMP/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$DUMP/data.sql" > "$DUMP/restauracao.log" 2>&1 || { tail -5 "$DUMP/restauracao.log"; falha "restauração com erro (ver restauracao.log)."; }
psql "$TARGET_DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 -q \
  --file "$DUMP/historico-schema.sql" --file "$DUMP/historico-dados.sql" >> "$DUMP/restauracao.log" 2>&1 \
  || { tail -5 "$DUMP/restauracao.log"; falha "restauração do ledger com erro."; }
echo "   ok"

echo "== 3. linhas por tabela (data.sql × banco restaurado)"
python3 - "$DUMP/data.sql" > "$DUMP/linhas-esperadas.txt" <<'PY'
import re, sys
cont, atual = {}, None
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for linha in f:
        if atual is None:
            m = re.match(r'^COPY ("?[\w$]+"?\.)?("?[\w$]+"?) ', linha)
            if m:
                esquema = (m.group(1) or "public.").rstrip(".").strip('"')
                atual = f"{esquema}.{m.group(2).strip(chr(34))}"
                cont[atual] = 0
        elif linha.rstrip("\n") == "\\.":
            atual = None
        else:
            cont[atual] += 1
for t in sorted(cont):
    print(f"{t}|{cont[t]}")
PY
divergentes=0
while IFS='|' read -r tabela esperado; do
  esquema="${tabela%%.*}"; nome="${tabela#*.}"
  obtido="$(q -c "select count(*) from \"$esquema\".\"$nome\"")"
  if [ "$obtido" != "$esperado" ]; then echo "   DIVERGE $tabela: dump=$esperado restaurado=$obtido"; divergentes=$((divergentes+1)); fi
done < "$DUMP/linhas-esperadas.txt"
echo "   $(wc -l < "$DUMP/linhas-esperadas.txt") tabelas conferidas; divergências: $divergentes"
[ "$divergentes" = 0 ] || falha "contagem de linhas divergente."

echo "== 4. inventário do catálogo (produção × restaurado)"
q -F '|' -f "$DIR_SCRIPT/inventario-catalogo.sql" > "$DUMP/inventario-restaurado.txt"
if [ -s "$DUMP/inventario-producao.txt" ]; then
  if diff <(grep -v '^extensoes|' "$DUMP/inventario-producao.txt") <(grep -v '^extensoes|' "$DUMP/inventario-restaurado.txt") > "$DUMP/inventario-diff.txt"; then
    echo "   idêntico ($(wc -l < "$DUMP/inventario-restaurado.txt") itens; extensões comparadas à parte)"
  else
    cat "$DUMP/inventario-diff.txt"; falha "inventário do restaurado difere da produção (ver inventario-diff.txt)."
  fi
  diff <(grep '^extensoes|' "$DUMP/inventario-producao.txt") <(grep '^extensoes|' "$DUMP/inventario-restaurado.txt") >/dev/null \
    || echo "   aviso: conjunto de extensões difere (depende do alvo; habilitar as mesmas extensões no projeto restaurado)"
else
  falha "inventario-producao.txt ausente — gere-o (ver gerar-dump-producao.sh) antes de declarar o dump validado."
fi

echo
echo "DUMP VALIDADO: restauração completa, linhas e catálogo conferem. Registre data/hora, operador e o MANIFEST.sha256."
