#!/usr/bin/env bash
# Teste pela Data API REAL (PostgREST do Supabase) com a chave PÚBLICA (anon /
# publishable), sem login. Passo A6 do plano. Não lê dados de negócio:
#   - views: GET ?select=company_id&limit=0 → nenhuma linha volta, só o status;
#   - função fiscal: chamada só no modo "depois" (antes, a chamada executaria a
#     função como anon); company_id inexistente (uuid zero).
# Só imprime status HTTP e o código de erro do PostgreSQL — nunca o corpo nem a chave.
#
# Uso: testar-data-api.sh antes|depois
#   antes  → esperado 200 nas 4 views (exposição presente)
#   depois → esperado 401/403 nas 4 views e 401/403/404 na função (exposição fechada)
set -euo pipefail
MODO="${1:?antes|depois}"
URL="https://bshvfsxapwwfntowdxyr.supabase.co"
read -rs -p "Chave pública (anon/publishable) do projeto bshvfsxapwwfntowdxyr — Settings → API Keys: " CHAVE; echo
[ -n "$CHAVE" ] || { echo "chave vazia"; exit 1; }
falhas=0
chamar() { # método caminho [corpo] → "status código"
  local tmp; tmp="$(mktemp)"
  local st
  st="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$1" "$URL$2" -H "apikey: $CHAVE" -H "Content-Type: application/json" ${3:+--data "$3"})"
  local cod; cod="$(python3 -c 'import json,sys
try: print(json.load(open(sys.argv[1])).get("code",""))
except Exception: print("")' "$tmp")"
  rm -f "$tmp"; echo "$st $cod"
}
for v in v_cash_flow_summary v_cash_flow_projection inventory_valuation v_sales_order_item_margin; do
  read -r st cod <<<"$(chamar GET "/rest/v1/$v?select=company_id&limit=0")"
  if [ "$MODO" = antes ]; then ok=$([ "$st" = 200 ] && echo sim || echo não); else ok=$([[ "$st" = 401 || "$st" = 403 ]] && echo sim || echo não); fi
  echo "$v: HTTP $st ${cod:+($cod)} — esperado no modo $MODO: $ok"; [ "$ok" = sim ] || falhas=$((falhas+1))
done
if [ "$MODO" = depois ]; then
  corpo='{"p_company_id":"00000000-0000-0000-0000-000000000000","p_product_id":null,"p_ncm_id":null,"p_origin_code":null,"p_cfop_id":null,"p_operation_nature_id":null,"p_origin_uf":null,"p_destination_uf":null,"p_tax_regime":null,"p_customer_id":null,"p_supplier_id":null,"p_reference_date":"2026-01-01"}'
  read -r st cod <<<"$(chamar POST "/rest/v1/rpc/fn_resolve_applicable_tax_rules" "$corpo")"
  ok=$([[ "$st" = 401 || "$st" = 403 || "$st" = 404 ]] && echo sim || echo não)
  echo "rpc fn_resolve_applicable_tax_rules: HTTP $st ${cod:+($cod)} — negado: $ok"; [ "$ok" = sim ] || falhas=$((falhas+1))
fi
unset CHAVE
[ "$falhas" = 0 ] && echo "RESULTADO ($MODO): conforme o esperado" || { echo "RESULTADO ($MODO): $falhas divergência(s) — ver plano, critério de interrupção"; exit 1; }
