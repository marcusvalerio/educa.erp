#!/usr/bin/env bash
# Restaura o dump gerado por gerar-dump-producao.sh num PostgreSQL ISOLADO e prova
# que ele é utilizável. Código de saída zero do pg_dump NÃO basta. Conferências:
#   0. alvo: não é produção, está vazio, tem os papéis do Supabase, PostgreSQL ≥ 17;
#   1. integridade dos arquivos (MANIFEST.sha256);
#   2. restauração completa sem erro, numa transação (procedimento oficial:
#      psql --single-transaction, ON_ERROR_STOP, session_replication_role=replica);
#   3. contagem de linhas de CADA tabela do data.sql = contagem no restaurado;
#   4. inventário do catálogo (resumo por categoria) restaurado = produção;
#   5. inventário DETALHADO (um item por tabela, constraint, índice, view,
#      função, policy, RLS, gatilho, grant, sequência, migration) = produção.
# As etapas 3–5 rodam todas e cada divergência é registrada em
# relatorio-validacao.txt — nada é ignorado nem afrouxado. Só com zero
# divergências o resultado é "DUMP VALIDADO".
#
# Privacidade: o terminal e o relatório mostram só nomes de objetos, contagens
# e hashes. Em erro de restauração, só a mensagem do PostgreSQL (sem as linhas
# de dados que o psql cita no CONTEXT); o log completo fica em restauracao.log,
# dentro da pasta protegida do dump.
#
# Alvo recomendado: pilha local do Supabase (`supabase start`, PostgreSQL 17,
# 127.0.0.1:54322). A URL vem de TARGET_DB_URL (nunca da linha de comando).
#
# Uso: TARGET_DB_URL=... validar-restauracao-dump.sh <pasta-do-dump>
set -euo pipefail
umask 077
DUMP="${1:?pasta do dump}"
DUMP="$(cd "$DUMP" && pwd -P)"
REF_PRODUCAO="bshvfsxapwwfntowdxyr"
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd -P)"
: "${TARGET_DB_URL:?defina TARGET_DB_URL (banco isolado)}"
REL="$DUMP/relatorio-validacao.txt"
DIVERGENCIAS=0
falha() { echo "FALHA: $*" | tee -a "$REL" >&2; echo "RESULTADO: DUMP NÃO VALIDADO" | tee -a "$REL" >&2; exit 1; }
diverge() { echo "   DIVERGE $*" | tee -a "$REL"; DIVERGENCIAS=$((DIVERGENCIAS+1)); }
q() { psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 -At "$@"; }
erro_seguro() { # só as linhas ERROR do psql, sem CONTEXT/DETAIL (que podem citar dados)
  grep -E '^psql:.*(ERROR|FATAL)' "$1" | sed -E 's/^psql:[^:]*:[0-9]+: //' | cut -c1-200 | head -5
}

: > "$REL"
chmod 600 "$REL"
{
  echo "validação do dump — início (UTC): $(date -u +%FT%TZ)"
  echo "pasta: $DUMP"
  echo "psql cliente: $(psql --version)"
} | tee -a "$REL"

echo "== 0. alvo" | tee -a "$REL"
case "$TARGET_DB_URL" in *"$REF_PRODUCAO"*|*supabase.co*|*pooler.supabase.com*)
  falha "TARGET_DB_URL aponta para o projeto de produção ou para a nuvem do Supabase. Use um PostgreSQL isolado." ;; esac
VERSAO="$(q -c "show server_version_num")" || falha "não foi possível conectar ao alvo."
# VERSAO_MINIMA_ALVO só existe para o teste automatizado deste script num PostgreSQL
# local mais antigo; alterada, o resultado é marcado como TESTE e nunca "DUMP VALIDADO".
VERSAO_MINIMA="${VERSAO_MINIMA_ALVO:-170000}"
[ "$VERSAO_MINIMA" = 170000 ] || echo "   ATENÇÃO: versão mínima alterada para $VERSAO_MINIMA — execução de TESTE, não vale como backup validado" | tee -a "$REL"
[ "$VERSAO" -ge "$VERSAO_MINIMA" ] || falha "alvo é PostgreSQL $VERSAO; a produção é 17 — use um alvo PostgreSQL 17."
[ "$(q -c "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p')")" = "0" ] \
  || falha "o banco alvo já tem tabelas em public — use um banco vazio."
q -c "select 1 from pg_roles where rolname in ('anon','authenticated','service_role') having count(*) = 3" | grep -q 1 \
  || falha "o alvo não tem os papéis do Supabase (anon/authenticated/service_role). Use a pilha local do Supabase."
echo "   ok: PostgreSQL $VERSAO, vazio, com papéis do Supabase" | tee -a "$REL"

echo "== 1. integridade dos arquivos" | tee -a "$REL"
for f in roles.sql schema.sql data.sql historico-schema.sql historico-dados.sql inventario-producao.txt inventario-detalhe-producao.txt MANIFEST.sha256; do
  [ -s "$DUMP/$f" ] || falha "arquivo ausente ou vazio: $f"
done
( cd "$DUMP" && sha256sum -c MANIFEST.sha256 ) | tee -a "$REL" || falha "MANIFEST.sha256 não confere."

echo "== 2. restauração (uma transação)" | tee -a "$REL"
if ! psql "$TARGET_DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 -q \
    --file "$DUMP/roles.sql" --file "$DUMP/schema.sql" \
    --command 'SET session_replication_role = replica' \
    --file "$DUMP/data.sql" > "$DUMP/restauracao.log" 2>&1; then
  erro_seguro "$DUMP/restauracao.log" | tee -a "$REL"
  falha "restauração com erro (log completo em restauracao.log, na pasta protegida)."
fi
if ! psql "$TARGET_DB_URL" -X --single-transaction -v ON_ERROR_STOP=1 -q \
    --file "$DUMP/historico-schema.sql" --file "$DUMP/historico-dados.sql" >> "$DUMP/restauracao.log" 2>&1; then
  erro_seguro "$DUMP/restauracao.log" | tee -a "$REL"
  falha "restauração do ledger com erro."
fi
chmod 600 "$DUMP/restauracao.log"
echo "   ok" | tee -a "$REL"

echo "== 3. linhas por tabela (data.sql × restaurado)" | tee -a "$REL"
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
TABELAS=0
while IFS='|' read -r tabela esperado; do
  esquema="${tabela%%.*}"; nome="${tabela#*.}"
  obtido="$(q -c "select count(*) from \"$esquema\".\"$nome\"" 2>/dev/null || echo "erro")"
  TABELAS=$((TABELAS+1))
  [ "$obtido" = "$esperado" ] || diverge "linhas $tabela: dump=$esperado restaurado=$obtido"
done < "$DUMP/linhas-esperadas.txt"
[ "$TABELAS" -gt 0 ] || diverge "data.sql sem nenhum bloco COPY"
echo "   $TABELAS tabelas conferidas" | tee -a "$REL"

echo "== 4. inventário do catálogo — resumo (produção × restaurado)" | tee -a "$REL"
q -F '|' -f "$DIR_SCRIPT/inventario-catalogo.sql" > "$DUMP/inventario-restaurado.txt"
if diff <(grep -v '^extensoes|' "$DUMP/inventario-producao.txt") <(grep -v '^extensoes|' "$DUMP/inventario-restaurado.txt") > "$DUMP/inventario-diff.txt"; then
  echo "   idêntico ($(grep -c '' "$DUMP/inventario-restaurado.txt") categorias)" | tee -a "$REL"
else
  while IFS= read -r l; do diverge "categoria $l"; done < <(grep '^[<>]' "$DUMP/inventario-diff.txt" | sed 's/^</produção:/; s/^>/restaurado:/')
  echo "   inventário do restaurado difere da produção (ver inventario-diff.txt)" | tee -a "$REL"
fi
diff <(grep '^extensoes|' "$DUMP/inventario-producao.txt") <(grep '^extensoes|' "$DUMP/inventario-restaurado.txt") >/dev/null \
  || diverge "extensões: conjunto difere (habilitar no alvo as mesmas extensões da produção e repetir)"

echo "== 5. inventário detalhado — objeto a objeto (produção × restaurado)" | tee -a "$REL"
q -f "$DIR_SCRIPT/inventario-detalhe.sql" > "$DUMP/inventario-detalhe-restaurado.txt"
# Compara linhas inteiras (categoria|objeto|assinatura), robusto a nomes repetidos.
sort "$DUMP/inventario-detalhe-producao.txt" > "$DUMP/.det-p"; sort "$DUMP/inventario-detalhe-restaurado.txt" > "$DUMP/.det-r"
comm -23 "$DUMP/.det-p" "$DUMP/.det-r" > "$DUMP/.so-p"; comm -13 "$DUMP/.det-p" "$DUMP/.det-r" > "$DUMP/.so-r"
cut -d'|' -f1,2 "$DUMP/.so-p" | sort -u > "$DUMP/.k-p"; cut -d'|' -f1,2 "$DUMP/.so-r" | sort -u > "$DUMP/.k-r"
while IFS= read -r k; do diverge "definição/grant diferente: $k"; done < <(comm -12 "$DUMP/.k-p" "$DUMP/.k-r")
while IFS= read -r k; do diverge "ausente no restaurado: $k"; done < <(comm -23 "$DUMP/.k-p" "$DUMP/.k-r")
while IFS= read -r k; do diverge "só no restaurado: $k"; done < <(comm -13 "$DUMP/.k-p" "$DUMP/.k-r")
diff "$DUMP/.det-p" "$DUMP/.det-r" > "$DUMP/inventario-detalhe-diff.txt" || true
rm -f "$DUMP"/.det-p "$DUMP"/.det-r "$DUMP"/.so-p "$DUMP"/.so-r "$DUMP"/.k-p "$DUMP"/.k-r
echo "   $(grep -c '' "$DUMP/inventario-detalhe-producao.txt") objetos conferidos" | tee -a "$REL"

echo | tee -a "$REL"
echo "fim (UTC): $(date -u +%FT%TZ) · divergências: $DIVERGENCIAS" | tee -a "$REL"
if [ "$DIVERGENCIAS" = 0 ] && [ "$VERSAO_MINIMA" != 170000 ]; then
  echo "TESTE LOCAL OK (alvo abaixo do PostgreSQL 17): NÃO vale como backup validado." | tee -a "$REL"
elif [ "$DIVERGENCIAS" = 0 ]; then
  echo "DUMP VALIDADO: restauração completa; linhas, catálogo e objetos idênticos à produção." | tee -a "$REL"
else
  echo "RESULTADO: DUMP NÃO VALIDADO — $DIVERGENCIAS divergência(s) registradas em relatorio-validacao.txt." | tee -a "$REL"
  echo "Documente cada uma (causa e decisão) no registro de divergências; não ajuste as conferências." | tee -a "$REL"
  exit 1
fi
