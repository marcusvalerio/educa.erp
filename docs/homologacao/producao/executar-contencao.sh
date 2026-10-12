#!/usr/bin/env bash
# Execução ASSISTIDA da contenção em produção (parte A do plano, passos A2–A4).
# NÃO roda sem autorização: exige backup confirmado, ref conferido no painel e
# confirmação digitada. Cada etapa grava a saída em $SAIDA (fora do Git).
#
# Conexão: Session pooler do Supabase, montada por variáveis (nada de URL com
# senha): o usuário postgres.<ref> faz o pooler rotear para ESTE projeto; o SQL
# ainda confere o system_identifier. A senha é pedida sem eco.
#   export PGHOST='<host do Session pooler, copiado do painel → Connect>'
#   export PGPORT=5432 PGDATABASE=postgres PGUSER=postgres.bshvfsxapwwfntowdxyr PGSSLMODE=require
#   docs/homologacao/producao/executar-contencao.sh [pasta-de-saída]
set -euo pipefail
umask 077

REF="bshvfsxapwwfntowdxyr"
SHA_ESPERADO="84d174bc336a4a1653001bd5b85fa17d66fead740366719f99c98ca0cf0ef03a"
ID_ESPERADO="7678069749886157684/postgres"
DIR="$(cd "$(dirname "$0")" && pwd -P)"
SQL="$DIR/contencao-emergencial.sql"
SAIDA="${1:-$HOME/educa-contencao/$(date -u +%Y%m%dT%H%M%SZ)}"
pare() { echo; echo "PARADO: $*" >&2; echo "Nada foi aplicado por este script após este ponto." >&2; exit 1; }

# ---------------------------------------------------------------- 0. ambiente
mkdir -p "$SAIDA"; SAIDA="$(cd "$SAIDA" && pwd -P)"; chmod 700 "$SAIDA"
git -C "$SAIDA" rev-parse --is-inside-work-tree >/dev/null 2>&1 && pare "a pasta de saída está dentro de um repositório Git."
[ "${PGUSER:-}" = "postgres.$REF" ] || pare "PGUSER deve ser postgres.$REF (Session pooler deste projeto)."
[ "${PGDATABASE:-}" = "postgres" ] || pare "PGDATABASE deve ser postgres."
[ -n "${PGHOST:-}" ] || pare "defina PGHOST (host do Session pooler copiado do painel)."
case "${PGHOST}" in *supabase*) ;; *) pare "PGHOST não parece um host do Supabase." ;; esac
command -v psql >/dev/null || pare "psql não encontrado."
LOG="$SAIDA/execucao.log"
echo "início (UTC): $(date -u +%FT%TZ) · operador: ${USER:-?} · projeto: $REF" | tee "$LOG"

# ---------------------------------------------------------------- 1. hash do SQL
SHA="$(sha256sum "$SQL" | cut -d' ' -f1)"
echo "SHA-256 do SQL: $SHA" | tee -a "$LOG"
[ "$SHA" = "$SHA_ESPERADO" ] || pare "hash divergente (esperado $SHA_ESPERADO). Não executar; gerar nova revisão documentada."

# ---------------------------------------------------------------- 2. confirmações humanas
for pergunta in \
  "Backup: o dump de hoje foi gerado E validado por validar-restauracao-dump.sh (DUMP VALIDADO)?" \
  "Painel: Project Settings → General mostra Project ID = $REF, nome educa.erp, região sa-east-1?" \
  "Janela e responsáveis definidos (quem executa, quem confere, contato para interrupção)?"; do
  read -r -p "$pergunta [digite sim] " r; [ "$r" = "sim" ] || pare "pré-requisito não confirmado: $pergunta"
  echo "confirmado: $pergunta" >> "$LOG"
done

read -rs -p "Senha do banco (não será exibida): " PGPASSWORD; echo
[ -n "$PGPASSWORD" ] || pare "senha vazia."
export PGPASSWORD
trap 'unset PGPASSWORD' EXIT
# Somente leitura na própria sessão (não depende de o pooler repassar "options").
ro() { psql -X -v ON_ERROR_STOP=1 -q -c "set session characteristics as transaction read only" "$@"; }

# ---------------------------------------------------------------- 3. identidade e estado (somente leitura)
echo "== verificação ANTES" | tee -a "$LOG"
ro -AtF' ' -f "$DIR/verificacao.sql" | tee "$SAIDA/verificacao-antes.txt" | tee -a "$LOG"
read -r BANCO ANTES <<<"$(cat "$SAIDA/verificacao-antes.txt")"
[ "$BANCO" = "$ID_ESPERADO" ] || pare "banco conectado ($BANCO) não é o de produção esperado ($ID_ESPERADO)."
case "$ANTES" in
  "f t t f f f f t t") echo "estado vulnerável esperado" | tee -a "$LOG" ;;
  "t t t t t t t t t") pare "a contenção JÁ está aplicada (nada a fazer). Registrar e encerrar." ;;
  *) pare "estado inesperado ($ANTES). Investigar antes de qualquer alteração." ;;
esac

echo "== pré-condições" | tee -a "$LOG"
ro -AtF' ' -f "$DIR/precondicoes.sql" | tee "$SAIDA/precondicoes.txt" | tee -a "$LOG"
[ "$(cut -d' ' -f1-7 "$SAIDA/precondicoes.txt")" = "t t t t t t t" ] || pare "pré-condição falsa (ver precondicoes.txt)."
[ "$(cut -d' ' -f9 "$SAIDA/precondicoes.txt")" = "f" ] || pare "executor é superusuário — conectar como postgres do projeto."

# ---------------------------------------------------------------- 4. confirmação final e execução transacional
read -r -p "Digite exatamente 'APLICAR $REF' para executar a contenção: " r
[ "$r" = "APLICAR $REF" ] || pare "confirmação final não recebida."
echo "== execução (uma transação; aborta sozinha em falha)" | tee -a "$LOG"
if psql -X -v ON_ERROR_STOP=1 -f "$SQL" > "$SAIDA/contencao.out" 2>&1; then
  cat "$SAIDA/contencao.out" >> "$LOG"; echo "COMMIT" | tee -a "$LOG"
else
  cat "$SAIDA/contencao.out" | tee -a "$LOG"
  echo "== verificação após a falha" | tee -a "$LOG"
  ro -AtF' ' -f "$DIR/verificacao.sql" | tee "$SAIDA/verificacao-pos-falha.txt" | tee -a "$LOG"
  pare "a contenção abortou (transação desfeita). Não repetir sem entender a mensagem 'Contenção: …'."
fi

# ---------------------------------------------------------------- 5. validação imediata
echo "== verificação DEPOIS" | tee -a "$LOG"
ro -AtF' ' -f "$DIR/verificacao.sql" | tee "$SAIDA/verificacao-depois.txt" | tee -a "$LOG"
read -r BANCO DEPOIS <<<"$(cat "$SAIDA/verificacao-depois.txt")"
[ "$DEPOIS" = "t t t t t t t t t" ] || pare "verificação pós-execução diferente do esperado ($DEPOIS). Acionar o responsável — NÃO aplicar rollback automaticamente."
echo "fim (UTC): $(date -u +%FT%TZ) — contenção aplicada e verificada. Seguir com A5–A7 do plano." | tee -a "$LOG"
( cd "$SAIDA" && sha256sum ./*.txt ./*.out ./*.log > MANIFEST.sha256 )
