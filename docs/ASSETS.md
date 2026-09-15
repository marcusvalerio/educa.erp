# Ativos e Manutenção — Fase 16

Camada de Ativos e Manutenção (`supabase/migrations/0056-0057`), construída sobre Estoque/WMS (`stock_movements`/`fn_post_stock_movement`, 0009), Custos (`cost_movements`/`fn_register_cost_movement`, 0043), `cost_centers` (0031) e `suppliers` (0002).

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 0. ATIVO NÃO É ESTOQUE

Princípio levado ao pé da letra em todo o desenho: nenhuma tabela desta fase representa saldo/quantidade de um ativo em um local de armazenagem. `assets` descreve o ativo físico; `asset_locations` é a localização de **instalação** (planta/setor/linha) — não confundir com `warehouse_locations` (endereço de estoque). A única ponte com estoque é o **consumo de peças** em uma manutenção, e ela passa estritamente por `fn_post_stock_movement`/`fn_register_cost_movement` — nunca uma alteração direta de saldo.

## 1. Cadastro de ativos

`asset_categories` e `asset_locations` são cadastros simples; `asset_locations` é hierárquica (mesma técnica anticiclo de `product_categories`, 0049). `assets` tem código automático (`AST-0001`), categoria, localização, fabricante/modelo/série, fornecedor, custo de aquisição, garantia, centro de custo (reaproveitado de 0031) e **hierarquia pai/sub-ativo** (`parent_asset_id`, ex.: Máquina → Motor/Painel/Bomba), com o mesmo guard anticiclo.

## 2. Planos e ordens de manutenção

`maintenance_plans`: preventiva/corretiva/preditiva, periodicidade por tempo/horas/ciclos/km/outro — vinculado a um ativo específico ou a uma categoria inteira. `maintenance_orders`: workflow `OPEN → PLANNED → IN_PROGRESS → WAITING_PARTS → COMPLETED`, com `CANCELLED` a partir de qualquer estado não terminal. Transição sempre via `fn_transition_maintenance_order_status` (trava a linha, valida o mapa de transições, grava auditoria) — update direto nunca muda `status` (RLS).

## 3. Consumo de peças — decisão de desenho

**Não existe uma tabela `maintenance_order_parts`.** O consumo de peça já fica totalmente representado em `stock_movements` (`reference_type='maintenance_order'`) e `cost_movements` (`source_type='maintenance_order'`) — exatamente como Recebimento/Produção já fazem (0018/0028). Criar uma tabela paralela duplicaria a mesma informação. `fn_consume_maintenance_order_part` é o único caminho: posta `ISSUE` via `fn_post_stock_movement` e registra o custo via `fn_register_cost_movement`, na mesma transação.

## 4. Custos (peças/serviços/despesas/total)

- **Peças**: sempre em `cost_movements` (já existente) — nunca duplicado.
- **Serviços/despesas**: `maintenance_order_costs` (só `cost_type in ('SERVICE','EXPENSE')` — peça não pode ser lançada manualmente aqui), via `fn_add_maintenance_order_cost`.
- **Total**: `fn_maintenance_order_cost_summary(order_id)` soma as duas fontes em uma única chamada (`parts_cost`/`services_cost`/`expenses_cost`/`total_cost`).

## 5. Histórico do ativo

`fn_asset_history(asset_id)` une, sem nenhuma tabela nova, as ordens de manutenção do ativo, o consumo de peças (via `cost_movements.source_id`), os custos manuais e a auditoria (`audit_logs.entity='assets'`) em uma única linha do tempo ordenada por data.

## 6. RBAC

| Código | Uso |
|---|---|
| `asset_categories.view/create/update`, `asset_locations.view/create/update`, `assets.view/create/update` | cadastros |
| `maintenance_plans.view/create/update` | planos |
| `maintenance_orders.view/create/update` | dados descritivos da ordem |
| `maintenance_orders.transition` | mudar status |
| `maintenance_orders.consume_parts` | consumir peça de estoque |
| `maintenance_orders.manage_costs` | lançar serviço/despesa |

## 7. RLS e auditoria

Cadastros (`asset_categories`/`asset_locations`/`assets`): CRUD direto via `has_permission`. `maintenance_orders`: create/update de campos descritivos direto; `status` só via função. `maintenance_order_costs`: **select-only** — escrita exclusiva via `fn_add_maintenance_order_cost` (mesmo padrão de `cost_movements`: ledger-like, nunca editado por update direto).

## 8. API

`/api/asset-categories`, `/api/asset-locations`, `/api/assets` (+`/[id]/history`), `/api/maintenance-plans`, `/api/maintenance-orders` (+`/[id]/transition`, `/consume-part`, `/costs`, `/cost-summary`).

## 9. Testes e frontend

`tests/assets-validations.test.ts` cobre a validação Zod. RBAC/RLS/concorrência/anticiclo/integração com estoque são só verificáveis contra um Postgres real. Nenhuma tela dedicada nesta rodada.
