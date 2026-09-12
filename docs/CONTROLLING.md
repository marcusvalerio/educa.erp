# Controladoria Gerencial — Fase 11

Camada de controladoria gerencial (`supabase/migrations/0045-0047`), construída sobre Financeiro, Custos, Comercial, Compras, Produção, Logística e Fiscal já existentes.

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. CONTROLADORIA GERENCIAL ≠ CONTABILIDADE SOCIETÁRIA/FISCAL

Esta fase **não** constrói: contabilidade societária completa, plano de contas contábil oficial, escrituração contábil oficial, SPED, ECD, ECF, apuração fiscal completa, integração com contador, razão/diário contábil oficial. O que existe é **controladoria gerencial**: receitas + custos + despesas + centros de custo + competência + rateios + margens + resultado gerencial — informação para decisão interna, não uma peça contábil/fiscal oficial. Qualquer semelhança com termos contábeis (DRE, competência) é conceitual/gerencial, nunca uma substituição da contabilidade societária.

## 1. Princípio de fonte (seção 11.1)

Nenhuma tabela nova duplica dado transacional. Cada número da Controladoria tem uma fonte clara:

| Informação | Fonte |
|---|---|
| Receita | `accounts_receivable` (origin_type='sales_order') |
| Custo (CMV) | `cost_movements` (movement_type='ISSUE', source_type='shipment_item') |
| Despesa | `accounts_payable` / `financial_transactions` |
| Estoque | `stock_movements` / `inventory_valuation` |
| Produção | `production_orders` (material_cost já calculado na Fase 10) |

Não existe uma "tabela gigante" com cópias — DRE/KPIs/margens são sempre **funções calculadas** sobre essas fontes (seção 11.21).

## 2. Período de competência (migration 0045)

`financial_competence_periods`: `company_id`, `code`, `period_start`/`period_end`, `status`. Workflow:

```
OPEN → CLOSING → CLOSED
                    ↓ (fn_reopen_competence_period, exige justificativa)
                 REOPENED → (fn_close_competence_period) → CLOSED
```

Competência aqui é **gerencial**, não um exercício contábil — a janela em que a Controladoria considera receitas/custos/despesas "daquele período" para análise. Não bloqueia a criação de `accounts_payable`/`accounts_receivable`/`financial_transactions` (esses continuam nascendo pelo fluxo normal do Financeiro) — o que o fechamento protege é a camada gerencial construída por cima: `fn_create_cost_allocation`/`fn_cancel_cost_allocation` recusam operar sobre um período `CLOSED` (`fn_assert_competence_period_open`, seção 11.20).

RBAC de período: `controlling.period.manage` (abrir — permissão adicional além da lista sugerida, necessária porque sem uma função para criar o primeiro período não haveria como popular a tabela), `controlling.close`, `controlling.reopen`.

## 3. Rateio (migration 0046, seção 11.10-11.11)

`cost_allocations` (cabeçalho) + `cost_allocation_items`. **Nunca altera** o lançamento original (`accounts_payable`/`financial_transactions`) — `source_type`/`source_id` são só referência polimórfica (sem FK, mesmo padrão de `stock_movements.reference_id`). `fn_create_cost_allocation` valida estruturalmente:

- `criterion = PERCENTAGE`: soma dos percentuais dos itens fecha em exatamente 100 (± 0.01); o valor de cada item é derivado (`total * percentual / 100`), com o **último item absorvendo o arredondamento** (mesmo padrão de parcelamento de `accounts_payable`/`accounts_receivable`) para a soma de `amount` fechar exatamente em `total_amount`.
- Demais critérios (`FIXED_VALUE`/`QUANTITY`/`REVENUE`/`COST`/`HEADCOUNT`/`AREA`): o valor de cada item é informado diretamente (o analista já calculou fora do banco, já que não há dado de headcount/área modelado, seção 11.11 — "não implementar critérios que dependam de dados inexistentes"); a soma ainda precisa fechar exatamente no `total_amount`.

`fn_cancel_cost_allocation` marca `status = 'cancelled'` — nunca apaga, nunca reverte um lançamento financeiro (nunca tocou nele).

## 4. Orçamento (migration 0046, seção 11.12)

`budget_headers` (`draft → approved → closed`) + `budget_items` (`cost_center_id`/`financial_category_id` opcionais + `planned_amount`). Nunca gera `accounts_payable`/`accounts_receivable`/`financial_transactions` — é só a base do ORÇADO. `fn_get_budget_vs_actual(budget_header_id)` compara com o REALIZADO: soma de `accounts_payable` (categorias `EXPENSE`) e `accounts_receivable` (categorias `INCOME`) dentro do período do orçamento, por combinação `cost_center_id`/`financial_category_id`.

## 5. Forecast (seção 11.13)

`fn_controlling_forecast` — nunca IA. Quatro buckets, claramente separados: `REALIZED_REVENUE`/`REALIZED_EXPENSE` (já reconhecidos, via `issue_date`) e `COMMITTED_REVENUE`/`COMMITTED_EXPENSE` (parcelas ainda em aberto com vencimento no período) — o chamador soma como quiser, mas o realizado nunca é confundido com o comprometido.

## 6. DRE Gerencial (migration 0047, seção 11.4)

`fn_get_dre_gerencial(company_id, period_start, period_end)`:

```
RECEITA BRUTA           (accounts_receivable, origin_type='sales_order', issue_date no período)
(-) DEDUÇÕES            = 0 — limitação documentada (seção 8)
= RECEITA LÍQUIDA
(-) CMV                 (cost_movements, ISSUE de shipment_item — Fase 10, nunca recalculado)
= LUCRO BRUTO
(-) DESPESAS OPERACIONAIS (accounts_payable, categoria EXPENSE, issue_date no período)
= RESULTADO OPERACIONAL
(+/-) RESULTADO FINANCEIRO (financial_transactions manuais — reference_type='MANUAL')
= RESULTADO GERENCIAL
```

Não é uma DRE societária oficial — é uma DRE gerencial, sujeita às limitações da seção 8.

## 7. Receita — pedido ≠ faturamento ≠ recebimento (seção 11.5)

A Controladoria usa `accounts_receivable.original_amount` (a OBRIGAÇÃO reconhecida, por `issue_date`) como receita — nunca `sales_orders.total_amount` diretamente (um pedido pode nunca virar título; um título pode ter parcelas ainda não recebidas). `accounts_receivable_installments.received_amount`/`receipts` são o regime de CAIXA (seção 8), uma dimensão diferente, disponível via `fn_report_finance` (Fase 12) e `fn_controlling_kpis`.

## 8. Limitações documentadas (honestidade sobre a base disponível)

- **Deduções de receita = 0**: não há tributo sobre venda modelado como uma dedução separada do CMV/despesas — `fiscal_documents.taxes_amount` mistura ICMS/IPI/PIS/COFINS/outros sem uma flag "é dedução de receita". Documentado, nunca inventado.
- **Resultado financeiro aproximado**: usa `financial_transactions` com `reference_type='MANUAL'` (tarifas/juros bancários lançados manualmente, `fn_create_manual_financial_transaction`, Financeiro 0034) como proxy — `financial_categories` não tem uma flag "operacional vs. financeiro", então despesas operacionais e financeiras não são perfeitamente segregáveis por categoria hoje.
- **Custo logístico**: não há campo de custo em `shipments`/`vehicles`/`carriers` — o único jeito honesto de ver custo logístico é via `fn_result_by_cost_center` filtrado ao centro de custo que a empresa rotula como Logística (se existir) — nada foi estimado sem fonte (seção 11.18).
- **CMV/margem** só existem quando o item de pedido já foi expedido (`fn_ship_shipment` gerando `cost_movements`) — um item ainda não expedido aparece com custo/CMV zero (reflete a realidade: a saída de estoque ainda não aconteceu), nunca um valor inventado.

## 9. Custo industrial e centro de custo (seções 11.16-11.17)

`fn_industrial_cost_summary` — só `production_orders.material_cost`/`produced_quantity` (Fase 10); nenhuma mão de obra/rateio indireto foi inventado (não há infraestrutura própria ainda). `fn_result_by_cost_center` reaproveita `cost_centers` (Financeiro 0031, nunca duplicado) e soma receita (`accounts_receivable.cost_center_id`) - despesa (`accounts_payable.cost_center_id`) - custo rateado (`cost_allocation_items`, seção 3) por centro.

## 10. Margem e rentabilidade (seções 11.14-11.15)

`v_sales_order_item_margin` (view granular, por item de pedido): receita = `sales_order_items.line_total`; custo = soma de `cost_movements` dos `shipment_items` gerados para aquele item (via `fn_ship_shipment`, Fase 10) — nunca recalcula custo, só agrega o que a Fase 10 já produziu. `fn_margin_by_product`/`fn_margin_by_customer`/`fn_margin_by_order` agregam essa view por período. Margem por vendedor é possível filtrando por `sales_representative_id` (já exposto na view); margem por canal fica preparada para quando um canal existir no cadastro comercial.

## 11. KPIs financeiros (seção 11.19)

`fn_controlling_kpis` reaproveita `fn_get_dre_gerencial` (nunca recalcula a mesma coisa duas vezes) e acrescenta: `accounts_receivable_open`/`accounts_payable_open` (soma de parcelas em aberto), `cash_balance` (soma de `financial_accounts.current_balance` ativas), `overdue_receivable`, `average_ticket` (receita bruta / número de pedidos não-draft/cancelados no período, só quando há pedidos).

## 12. RBAC

| Código | Uso |
|---|---|
| `controlling.view` | DRE, KPIs, resultado por centro, margens, custo industrial, consulta de períodos/rateios |
| `controlling.period.manage` | abrir período de competência |
| `controlling.close` | iniciar/concluir fechamento de período |
| `controlling.reopen` | reabrir período fechado (exige justificativa) |
| `controlling.allocate` | criar/cancelar rateio |
| `controlling.budget.view/create/update` | orçamento — `.update` cobre aprovar e encerrar |
| `controlling.forecast.view` | forecast |

`controlling.period.manage` não estava na lista literal sugerida (seção 11.22) — adicionada porque o domínio genuinamente precisa dela (mesmo espírito de `product_fiscal_profiles.*` na Fase 8): sem ela não haveria como criar o primeiro período.

## 13. RLS, auditoria, concorrência

- **RLS**: todas as tabelas novas (`financial_competence_periods`, `cost_allocations`, `cost_allocation_items`, `budget_headers`, `budget_items`) têm `company_id` + RLS select-only — toda escrita via função `SECURITY DEFINER`.
- **Auditoria**: fechamento/reabertura de período, criação/cancelamento de rateio e aprovação de orçamento gravam `audit_logs` (reaproveitado, nenhuma tabela de auditoria paralela).
- **Concorrência**: `fn_close_competence_period`/`fn_reopen_competence_period`/`fn_cancel_cost_allocation` travam a linha (`for update`) antes de validar e alterar — mesma técnica usada em todo o sistema desde `fn_post_stock_movement` (0009).
- **Precisão monetária**: todo valor é `NUMERIC` — nunca `FLOAT`.

## 14. API

`/api/controlling/competence-periods` (+`/[id]`, `/[id]/start-closing`, `/[id]/close`, `/[id]/reopen`), `/api/controlling/cost-allocations` (+`/[id]`, `/[id]/cancel`), `/api/controlling/budgets` (+`/[id]`, `/[id]/approve`, `/[id]/close`, `/[id]/vs-actual`), `/api/controlling/dre`, `/api/controlling/kpis`, `/api/controlling/result-by-cost-center`, `/api/controlling/industrial-cost-summary`, `/api/controlling/forecast`, `/api/controlling/margin-by-product`, `/api/controlling/margin-by-customer`, `/api/controlling/margin-by-order` (as últimas 8 rotas exigem `?periodStart=&periodEnd=`).

## 15. Testes e frontend

Testes desta etapa cobrem a camada de validação Zod (`src/lib/validations/controlling.ts`) — `tests/controlling-validations.test.ts`. A lógica transacional real (fechamento/reabertura, soma de rateio fechando em 100%/valor total, DRE, CMV puxado da Fase 10, orçado x realizado, resultado por centro considerando rateios, RBAC, RLS, isolamento por empresa, auditoria) vive nas funções SQL e só é verificável contra um Postgres real, fora do alcance desta etapa. Nenhuma tela nova.
