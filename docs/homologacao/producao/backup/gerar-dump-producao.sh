#!/usr/bin/env bash
# Gera o dump LÓGICO da produção (Supabase bshvfsxapwwfntowdxyr) antes da
# contenção / atualização. Só LEITURA na produção (pg_dump via Supabase CLI).
#
# Procedimento oficial: supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
# (roles.sql, schema.sql, data.sql com --use-copy --data-only; CLI ≥ 2.x com Docker).
#
# Segurança:
#   - o ref é fixo e conferido no arquivo de vínculo do CLI — sem URL, alias ou
#     variável de ambiente que possa apontar para outro projeto;
#   - a senha é lida sem eco e passada ao CLI só por SUPABASE_DB_PASSWORD
#     (nunca na linha de comando, no histórico ou no log);
#   - a saída fica FORA de qualquer repositório Git, com umask 077 (pasta 700,
#     arquivos 600). Nunca enviar o dump para GitHub, Vercel ou armazenamento
#     público.
#
# Pré-requisitos: Supabase CLI (testado: 2.120.0), Docker em execução,
# `supabase login` feito (token de acesso da conta dona do projeto) e a senha
# do banco (painel → Database → Settings; se precisar redefinir, isso não
# afeta o app, que usa as chaves da API).
#
# Uso: gerar-dump-producao.sh [pasta-de-saída]
#   padrão: ~/educa-backups/prod-<UTC>
set -euo pipefail
umask 077

REF_ESPERADO="bshvfsxapwwfntowdxyr"
OUT="${1:-$HOME/educa-backups/prod-$(date -u +%Y%m%dT%H%M%SZ)}"

falha() { echo "ERRO: $*" >&2; exit 1; }

# ---------------------------------------------------------------- saída fora do Git
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd -P)"
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  falha "a pasta de saída está dentro de um repositório Git ($OUT). Use uma pasta fora de qualquer repositório."
fi
chmod 700 "$OUT"
[ -z "$(ls -A "$OUT")" ] || falha "a pasta de saída não está vazia: $OUT"

command -v supabase >/dev/null || falha "Supabase CLI não encontrado."
docker info >/dev/null 2>&1 || falha "Docker não está em execução (o CLI roda pg_dump num contêiner)."
LOG="$OUT/dump.log"
{
  echo "início (UTC): $(date -u +%FT%TZ)"
  echo "supabase CLI: $(supabase --version)"
  echo "docker: $(docker version --format '{{.Server.Version}}' 2>/dev/null)"
  echo "psql: $(psql --version 2>/dev/null)"
  echo "projeto: $REF_ESPERADO"
} > "$LOG"

# ---------------------------------------------------------------- senha sem eco
read -rs -p "Senha do banco de $REF_ESPERADO (não será exibida): " SUPABASE_DB_PASSWORD
echo
[ -n "$SUPABASE_DB_PASSWORD" ] || falha "senha vazia."
export SUPABASE_DB_PASSWORD
WORK="$(mktemp -d)"
trap 'unset SUPABASE_DB_PASSWORD; rm -rf "$WORK"' EXIT

# ---------------------------------------------------------------- vínculo fixo ao ref
supabase init --workdir "$WORK" --yes >>"$LOG" 2>&1 || falha "supabase init falhou (ver $LOG)."
supabase link --project-ref "$REF_ESPERADO" --workdir "$WORK" >>"$LOG" 2>&1 || falha "supabase link falhou (ver $LOG)."
VINCULADO="$(cat "$WORK/supabase/.temp/project-ref" 2>/dev/null || true)"
[ "$VINCULADO" = "$REF_ESPERADO" ] || falha "o CLI vinculou '$VINCULADO', esperado '$REF_ESPERADO'."
echo "vínculo conferido: $VINCULADO" | tee -a "$LOG"

dump() { # arquivo, flags…
  local arq="$1"; shift
  echo "== $arq ($*)" >>"$LOG"
  supabase db dump --linked --workdir "$WORK" -f "$OUT/$arq" "$@" >>"$LOG" 2>&1 || falha "dump de $arq terminou com erro (ver $LOG)."
  [ -s "$OUT/$arq" ] || falha "$arq vazio."
  chmod 600 "$OUT/$arq"
}
dump roles.sql --role-only
dump schema.sql
dump data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
dump historico-schema.sql --schema supabase_migrations
dump historico-dados.sql --use-copy --data-only --schema supabase_migrations

# ---------------------------------------------------------------- conteúdo mínimo esperado
exige() { grep -qE "$2" "$OUT/$1" || falha "$1 sem o conteúdo esperado: $2"; }
exige schema.sql 'CREATE TABLE (IF NOT EXISTS )?"?public"?\."?units"?'
exige schema.sql 'v_cash_flow_summary'
exige schema.sql 'fn_resolve_applicable_tax_rules'
exige schema.sql 'units_select_authenticated'
exige data.sql 'COPY "?public"?\."?companies"?'
exige data.sql 'COPY "?auth"?\."?users"?'
exige historico-dados.sql '20260929165645'
grep -qiE 'password|senha' "$LOG" && falha "o log contém a palavra password/senha — revisar antes de guardar." || true

# ---------------------------------------------------------------- inventário da produção (somente leitura)
# A URL do pooler gravada pelo vínculo não contém senha; a senha vai por
# PGPASSWORD só para este processo; a sessão é forçada a somente leitura.
DIR_SCRIPT="$(cd "$(dirname "$0")" && pwd -P)"
POOLER="$(cat "$WORK/supabase/.temp/pooler-url" 2>/dev/null || true)"
if [ -n "$POOLER" ] && command -v psql >/dev/null && printf '%s' "$POOLER" | grep -q "$REF_ESPERADO"; then
  PGPASSWORD="$SUPABASE_DB_PASSWORD" \
    psql "$POOLER" -X -v ON_ERROR_STOP=1 -q -AtF '|' -c "set session characteristics as transaction read only" -f "$DIR_SCRIPT/inventario-catalogo.sql" > "$OUT/inventario-producao.txt" 2>>"$LOG" \
    || falha "inventário da produção falhou (ver $LOG)."
  [ -s "$OUT/inventario-producao.txt" ] || falha "inventário da produção vazio."
  PGPASSWORD="$SUPABASE_DB_PASSWORD" \
    psql "$POOLER" -X -v ON_ERROR_STOP=1 -q -At -c "set session characteristics as transaction read only" -f "$DIR_SCRIPT/inventario-detalhe.sql" > "$OUT/inventario-detalhe-producao.txt" 2>>"$LOG" \
    || falha "inventário detalhado da produção falhou (ver $LOG)."
  [ -s "$OUT/inventario-detalhe-producao.txt" ] || falha "inventário detalhado da produção vazio."
  echo "inventário da produção: $(wc -l < "$OUT/inventario-producao.txt") itens" | tee -a "$LOG"
else
  echo "AVISO: sem URL do pooler vinculada ao ref ou sem psql. Rode inventario-catalogo.sql e inventario-detalhe.sql"
  echo "       no SQL Editor da produção e salve as saídas (colunas separadas por '|') em"
  echo "       $OUT/inventario-producao.txt e $OUT/inventario-detalhe-producao.txt." | tee -a "$LOG"
fi

# ---------------------------------------------------------------- manifesto
( cd "$OUT" && sha256sum roles.sql schema.sql data.sql historico-schema.sql historico-dados.sql $(for f in inventario-producao.txt inventario-detalhe-producao.txt; do [ -s "$f" ] && echo "$f"; done) > MANIFEST.sha256 )
chmod 600 "$OUT/MANIFEST.sha256" "$LOG"
{
  echo "fim (UTC): $(date -u +%FT%TZ)"
  echo "tamanhos:"; ( cd "$OUT" && ls -l roles.sql schema.sql data.sql historico-*.sql )
} >>"$LOG"
echo
echo "Dump gerado em $OUT (pasta 700, arquivos 600)."
echo "Ainda NÃO está validado: rode validar-restauracao-dump.sh contra um banco ISOLADO."
cat "$OUT/MANIFEST.sha256"
