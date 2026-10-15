#!/usr/bin/env bash
# Aplica as migrations pendentes no Neon de destino, no dia do cutover, e
# CONFERE o catálogo antes e depois (docs/CUTOVER_RUNBOOK.md, sequência atual).
#
#   fase "antes"  : banco na 0073 → aplica 0074 e 0075  (ANTES de copy-data.sh)
#   fase "depois" : banco na 0075 → aplica 0076 … 0095 (DEPOIS da cópia, antes de descongelar)
#
# Cada arquivo roda numa transação própria (ON_ERROR_STOP). Erro = para, e o
# arquivo que falhou fica desfeito. A impressão digital do catálogo
# (impressao-catalogo.sql, só leitura) é comparada com impressoes/<versão>.txt,
# geradas da sequência pura local e conferidas nas branches de homologação.
#
# Uso:
#   TARGET_URL=postgres://<dono>@<host>/educa?sslmode=require \
#   CONFIRM_TARGET=<host do destino> \
#   poc/neon-full/migrate/aplicar-migrations-neon.sh antes|depois
# A URL vem do ambiente (nunca da linha de comando) e não é impressa.
set -euo pipefail
cd "$(dirname "$0")/../../.."
FASE="${1:?informe a fase: antes | depois}"
: "${TARGET_URL:?defina TARGET_URL (dono do banco de destino)}"
: "${CONFIRM_TARGET:?defina CONFIRM_TARGET (host do destino)}"
case "$TARGET_URL" in *"$CONFIRM_TARGET"*) ;; *) echo "TARGET_URL não contém $CONFIRM_TARGET" >&2; exit 2;; esac
case "$TARGET_URL" in *supabase*) echo "destino não pode ser o Supabase" >&2; exit 2;; esac

DIR=poc/neon-full/migrate
case "$FASE" in
  antes)  DE=0073; PARA=0075; FAIXA='^00(74|75)_' ;;
  depois) DE=0075; PARA=0095; FAIXA='^00(7[6-9]|8[0-9]|9[0-5])_' ;;
  *) echo "fase inválida: $FASE (use antes | depois)" >&2; exit 2 ;;
esac

impressao() { psql "$TARGET_URL" -X -v ON_ERROR_STOP=1 -At -f "$DIR/impressao-catalogo.sql"; }
confere() { # versão
  local atual; atual="$(impressao)"
  if diff <(echo "$atual") "$DIR/impressoes/$1.txt" > /dev/null; then
    echo "   ok: catálogo = referência $1 (11 categorias)"
  else
    echo "   DIVERGE da referência $1:" >&2
    diff <(echo "$atual") "$DIR/impressoes/$1.txt" | sed 's/^/     /' >&2
    return 1
  fi
}

echo "== fase $FASE: $DE → $PARA"
echo "== 1. estado inicial"
confere "$DE" || { echo "PARADO: o destino não está na $DE. Nada foi aplicado." >&2; exit 1; }

echo "== 2. migrations"
ARQS=$(ls supabase/migrations | grep -E "$FAIXA" | sort)
[ -n "$ARQS" ] || { echo "nenhum arquivo encontrado" >&2; exit 1; }
for f in $ARQS; do
  printf '   %s … ' "$f"
  if psql "$TARGET_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction -f "supabase/migrations/$f" > /dev/null 2> "$DIR/.erro"; then
    echo ok
  else
    echo FALHOU
    grep -E 'ERROR|FATAL' "$DIR/.erro" | head -3 | sed 's/^/     /' >&2
    rm -f "$DIR/.erro"
    echo "PARADO em $f (desfeito). Os anteriores ficaram aplicados; volte pela branch pre-cutover se preciso." >&2
    exit 1
  fi
  grep -i 'WARNING' "$DIR/.erro" | sed 's/^/     aviso: /' || true
done
rm -f "$DIR/.erro"

echo "== 3. estado final"
confere "$PARA" || { echo "RESULTADO: catálogo final diferente da referência $PARA — não prossiga." >&2; exit 1; }

if [ "$FASE" = depois ]; then
  echo "== 4. segurança"
  psql "$TARGET_URL" -X -v ON_ERROR_STOP=1 -At <<'SQL'
select 'policy aberta em units: ' || case when exists (select 1 from pg_policy where polrelid = 'public.units'::regclass and polname = 'units_select_authenticated') then 'PRESENTE (ERRO)' else 'ausente' end;
select 'views com security_invoker: ' || count(*) || '/4' from pg_class where relname in ('v_cash_flow_summary','v_cash_flow_projection','inventory_valuation','v_sales_order_item_margin') and reloptions::text like '%security_invoker=true%';
select 'views legíveis por anon/authenticated: ' || count(*) from unnest(array['v_cash_flow_summary','v_cash_flow_projection','inventory_valuation','v_sales_order_item_margin']) v, unnest(array['anon','authenticated']) r where has_table_privilege(r, 'public.' || v, 'select');
select 'regras fiscais executáveis por anon/authenticated: ' || count(*) from unnest(array['anon','authenticated']) r where has_function_privilege(r, 'public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)', 'execute');
select 'FKs por empresa validadas: ' || count(*) filter (where convalidated) || '/' || count(*) from pg_constraint where conname like '%same_company_fk';
SQL
  echo "   esperado: ausente · 4/4 · 0 · 0 · 18/18"
fi
echo "RESULTADO: fase $FASE concluída; catálogo = referência $PARA."
