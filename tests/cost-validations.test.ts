// Testes de validação (Zod) do domínio de Custos e Formação de Custo
// (src/lib/validations/costs.ts). Cobrem a camada de forma/tipo — a
// primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (a maior parte é regra de
// negócio real vivendo em supabase/migrations/0043-0044, só
// verificável contra um Postgres real — nenhum Supabase real foi
// tocado, por instrução explícita):
//   - fn_register_cost_movement: cálculo de custo médio móvel
//     (entrada/saída), idempotência por stock_movement_id, concorrência
//     via FOR UPDATE, RESERVATION/RELEASE nunca gerando cost_movement
//   - Entrada de compra: custo derivado do RECEBIMENTO confirmado
//     (fn_confirm_purchase_receipt), nunca do pedido isolado
//   - Transferência: unit_cost_snapshot capturado na saída e reutilizado
//     na entrada — nenhum lucro/perda criado pela transferência
//   - Saída de venda: ISSUE gerando COGS ao custo médio atual; RELEASE
//     nunca gerando custo
//   - Produção: consumo de material acumulando
//     production_order_materials.consumed_cost/production_orders.material_cost;
//     produto acabado recebendo unit_cost derivado do custo acumulado
//   - Scrap: perda de matéria-prima rastreável via cost_movements
//   - Ajuste/contagem: ADJUSTMENT_IN/OUT com consequência econômica
//   - fn_reprocess_product_cost: nunca silencioso (exige motivo),
//     recalcula a partir do próprio ledger, idempotente, auditado
//   - fn_set_product_standard_cost: versionamento (só 1 'active' por
//     produto, anterior vira 'obsolete' na mesma transação)
//   - inventory_valuation: quantidade de stock_balances, custo de
//     product_cost_balances — nunca duplicando a quantidade física
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em cost_movements/
//     product_cost_balances/product_standard_costs
//   - precisão monetária real (numeric no banco)
// Ver docs/COSTS.md (aviso no topo, §29) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  reprocessProductCostSchema,
  setProductStandardCostSchema,
  updateProductStandardCostNotesSchema,
} from "@/lib/validations/costs";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("reprocessProductCostSchema", () => {
  test("exige productId, locationId e reason", () => {
    const result = reprocessProductCostSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita reason vazio", () => {
    const result = reprocessProductCostSchema.safeParse({ productId: uuid1, locationId: uuid2, reason: "" });
    assert.equal(result.success, false);
  });

  test("aceita payload mínimo válido", () => {
    const result = reprocessProductCostSchema.safeParse({ productId: uuid1, locationId: uuid2, reason: "Divergência detectada na auditoria mensal." });
    assert.equal(result.success, true);
  });

  test("aceita lotId opcional", () => {
    const result = reprocessProductCostSchema.safeParse({ productId: uuid1, locationId: uuid2, lotId: uuid2, reason: "Reprocessamento de lote." });
    assert.equal(result.success, true);
  });

  test("rejeita lotId inválido", () => {
    const result = reprocessProductCostSchema.safeParse({ productId: uuid1, locationId: uuid2, lotId: "not-a-uuid", reason: "motivo" });
    assert.equal(result.success, false);
  });
});

describe("setProductStandardCostSchema", () => {
  test("exige productId e cost", () => {
    const result = setProductStandardCostSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("rejeita custo negativo", () => {
    const result = setProductStandardCostSchema.safeParse({ productId: uuid1, cost: -1 });
    assert.equal(result.success, false);
  });

  test("aceita custo zero (produto sem custo padrão definido ainda)", () => {
    const result = setProductStandardCostSchema.safeParse({ productId: uuid1, cost: 0 });
    assert.equal(result.success, true);
  });

  test("aceita payload completo válido", () => {
    const result = setProductStandardCostSchema.safeParse({
      productId: uuid1, cost: 12.5, validFrom: "2026-01-01", notes: "Custo padrão inicial",
    });
    assert.equal(result.success, true);
  });
});

describe("updateProductStandardCostNotesSchema", () => {
  test("aceita corpo vazio (notes default para string vazia)", () => {
    const result = updateProductStandardCostNotesSchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.notes, "");
  });

  test("aceita notes explícito", () => {
    const result = updateProductStandardCostNotesSchema.safeParse({ notes: "Revisado em conjunto com Compras." });
    assert.equal(result.success, true);
  });
});
