# Qualidade — Fase 17

Camada de Qualidade (`supabase/migrations/0058`), construída sobre `warehouse_locations.purpose='QUARANTINE'` (0013), `product_lots` (0008), `stock_movements`/`fn_post_stock_movement` (0009), `cost_movements`/`fn_register_cost_movement` (0043) e os itens com `lot_id` de Recebimento/Produção/Expedição (0018/0028/0024).

**Aviso — escopo desta etapa:** como em todas as fases anteriores, estas migrations foram escritas e revisadas estaticamente, mas **não foram aplicadas nem testadas contra um banco Postgres real**.

## 1. Checklists e critérios

`quality_checklists` (RECEIVING/PRODUCTION/SHIPPING/RETURN/PROCESS/OTHER) + `quality_checklist_items`, um critério por linha com `criteria_type` (PASS_FAIL/NUMERIC/TEXT/YES_NO/RANGE) — `min_value`/`max_value`/`expected_value` conforme o tipo.

## 2. Inspeções

`quality_inspections` é polimórfica por `source_type`/`source_id` (purchase_receipt/production_order/production_operation/shipment/delivery_event/asset/maintenance_order/service_order/other) — mesmo padrão de `cost_movements`/`fiscal_documents`, nenhuma FK real possível por natureza diferente das origens. `quality_inspection_results` registra, por item do checklist, o valor encontrado e o resultado (`fn_record_inspection_result` calcula PASS/FAIL automaticamente para PASS_FAIL/YES_NO/NUMERIC/RANGE; TEXT nunca calcula automático). `fn_finalize_inspection` fecha com APPROVED/REJECTED/PARTIALLY_APPROVED — update direto nunca sai de PENDING/IN_PROGRESS (RLS).

## 3. Não conformidades e ações

`nonconformities` (severidade/causa/status OPEN→IN_ANALYSIS→IN_TREATMENT→CLOSED, sequencial via `fn_transition_nonconformity_status`) pode nascer de uma inspeção (`fn_create_nonconformity_from_inspection`, sempre explícito — nunca automático ao rejeitar uma inspeção) ou ser aberta direto. `quality_actions` unifica corretivas e preventivas em **uma** tabela com `action_type` (mesmo princípio de `document_sequences`, 0053: não duplicar estrutura quase idêntica), workflow OPEN→IN_PROGRESS→COMPLETED/CANCELLED.

## 4. Quarentena — reaproveitamento, nunca uma segunda infraestrutura

`fn_send_to_quarantine` exige explicitamente que o local de destino tenha `purpose='QUARANTINE'` (0013) — nunca escolhido implicitamente. Internamente é só um `TRANSFER_OUT`/`TRANSFER_IN` via `fn_post_stock_movement` + `fn_register_cost_movement` (o custo do leg de entrada usa o `unit_cost` apurado no leg de saída, mesmo padrão de `fn_receive_transfer`, 0044 — uma transferência nunca gera lucro/perda). Nenhuma tabela de "produto em quarentena" — o próprio `stock_balances` na location QUARANTINE já representa isso.

## 5. Rastreabilidade

`fn_quality_traceability(lot_id)` une, só leitura, `purchase_receipt_items`/`purchase_receipts`/`suppliers` → `quality_inspections` → `stock_movements` → `production_order_materials`/`production_orders` → `shipment_items`/`shipments`, todos já existentes e já carregando `lot_id` — nenhum ledger de rastreabilidade paralelo.

## 6. RBAC

| Código | Uso |
|---|---|
| `quality_checklists.view/create/update` | checklists e itens |
| `quality_inspections.view/create/update` | inspeção (dados descritivos) |
| `quality_inspections.record_result` | registrar resultado de item |
| `quality_inspections.finalize` | aprovar/reprovar |
| `quality_inspections.quarantine` | enviar para quarentena |
| `nonconformities.view/create/update` | não conformidades |
| `quality_actions.view/create/update` | ações corretivas/preventivas |
| `quality_reports.view` | rastreabilidade |

## 7. RLS e auditoria

Cadastros (`quality_checklists`/`quality_checklist_items`): CRUD direto. `quality_inspections`: create + update descritivo direto; finalizar só via função. `quality_inspection_results`: select-only (escrita via `fn_record_inspection_result`). `nonconformities`/`quality_actions`: CRUD direto + transição via função (grava `audit_logs`).

## 8. API

`/api/quality-checklists` (+`/[id]`), `/api/quality-checklist-items`, `/api/quality-inspections` (+`/[id]`, `/record-result`, `/finalize`, `/quarantine`, `/nonconformity`), `/api/nonconformities` (+`/[id]/transition`), `/api/quality-actions` (+`/[id]/transition`), `/api/quality/traceability`.

## 9. Testes e frontend

`tests/quality-validations.test.ts` cobre a validação Zod. Cálculo automático de resultado, guarda de quarentena, rastreabilidade e RLS só são verificáveis contra um Postgres real. Nenhuma tela dedicada nesta rodada.
