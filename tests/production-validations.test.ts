// Testes de validação (Zod) do domínio de Produção/PCP
// (src/lib/validations/production.ts). Cobrem a camada de forma/tipo —
// a primeira barreira antes de qualquer chamada RPC.
//
// IMPORTANTE — o que NÃO está coberto aqui (28 cenários pedidos na
// etapa, a maioria regra de negócio real vivendo em
// supabase/migrations/0026-0030, só verificável contra um Postgres
// real — nenhum Supabase real foi tocado, por instrução explícita):
//   - fn_create_bom incrementar version corretamente por produto
//   - fn_activate_bom exigir ao menos 1 componente e tornar obsolete
//     qualquer outra BOM ativa do mesmo produto na mesma transação
//   - índice único parcial garantindo só 1 BOM active por produto
//   - fn_add_bom_item/fn_remove_bom_item bloqueados fora de draft
//   - fn_create_production_order: snapshot correto dos componentes,
//     aplicação de scrap_percentage, conversão de unidade via
//     unit_conversions quando item.unit_id != component.unit_id, erro
//     claro quando não há conversão cadastrada
//   - fn_create_production_order exigir production_type
//     manufactured/both
//   - fn_release_production_order: reserva parcial sem overbooking,
//     top-up em chamadas repetidas, cálculo de disponibilidade no
//     grão exato (produto+local+lote) de stock_balances
//   - fn_start_production_order exigir materials_reserved
//   - fn_consume_production_material: bloqueio de consumo acima do
//     reservado, geração de ISSUE+RELEASE parciais, validação de
//     contagem de números de série
//   - fn_return_production_material: geração de RELEASE, bloqueio
//     acima do ainda-não-utilizado
//   - invariante estrutural consumed+returned+scrapped <= reserved
//   - fn_register_production_output: produção parcial acumulada,
//     exigência de lote para batch_controlled, validação de série para
//     serial_controlled, PRODUCTION_IN gerado só para produced_quantity
//   - fn_register_production_scrap: ISSUE+RELEASE só quando material_id
//     presente, nenhum movimento quando ausente (refugo de acabado)
//   - fn_complete_production_order idempotente (segunda chamada falha)
//   - fn_cancel_production_order liberando reservas ativas
//   - idempotency_key com short-circuit ANTES de qualquer efeito
//     colateral (não só dentro de fn_post_stock_movement)
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id) em todas as 9 tabelas novas
//   - vocabulário ampliado de audit_logs.action e
//     product_serial_numbers.status
//   - rastreabilidade ponta a ponta (produto acabado -> ordem ->
//     matéria-prima -> lote de origem) via as FKs estruturadas
// Ver docs/PRODUCTION.md (aviso no topo, §20) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  workCenterSchema,
  productionRoutingSchema,
  productionRoutingOperationSchema,
  createBomSchema,
  addBomItemSchema,
  createProductionOrderSchema,
  planProductionOrderSchema,
  registerProductionOutputSchema,
  consumeProductionMaterialSchema,
  returnProductionMaterialSchema,
  registerProductionScrapSchema,
  logProductionOperationSchema,
} from "@/lib/validations/production";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";
const uuid3 = "33333333-3333-4333-8333-333333333333";
const uuid4 = "44444444-4444-4444-8444-444444444444";

describe("workCenterSchema", () => {
  test("exige código e nome", () => {
    const result = workCenterSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita centro de trabalho mínimo válido, type default sector", () => {
    const result = workCenterSchema.safeParse({ code: "CORTE-01", name: "Corte" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.type, "sector");
  });

  test("rejeita type fora do enum", () => {
    const result = workCenterSchema.safeParse({ code: "X", name: "X", type: "robot" });
    assert.equal(result.success, false);
  });
});

describe("productionRoutingSchema", () => {
  test("aceita roteiro sem produto vinculado", () => {
    const result = productionRoutingSchema.safeParse({ name: "Roteiro padrão" });
    assert.equal(result.success, true);
  });

  test("productId vazio é tratado como ausente", () => {
    const result = productionRoutingSchema.safeParse({ name: "Roteiro", productId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.productId, undefined);
  });

  test("rejeita status fora do enum", () => {
    const result = productionRoutingSchema.safeParse({ name: "Roteiro", status: "finalizado" });
    assert.equal(result.success, false);
  });
});

describe("productionRoutingOperationSchema", () => {
  test("exige routingId e sequence positiva", () => {
    const result = productionRoutingOperationSchema.safeParse({ routingId: uuid1, sequence: 0, name: "Corte" });
    assert.equal(result.success, false);
  });

  test("aceita operação mínima válida sem centro de trabalho", () => {
    const result = productionRoutingOperationSchema.safeParse({ routingId: uuid1, sequence: 10, name: "Corte" });
    assert.equal(result.success, true);
  });
});

describe("createBomSchema", () => {
  test("exige productId e unitId", () => {
    const result = createBomSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita BOM mínima, referenceQuantity default 1", () => {
    const result = createBomSchema.safeParse({ productId: uuid1, unitId: uuid2 });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.referenceQuantity, 1);
  });

  test("rejeita referenceQuantity zero ou negativa", () => {
    const result = createBomSchema.safeParse({ productId: uuid1, unitId: uuid2, referenceQuantity: 0 });
    assert.equal(result.success, false);
  });
});

describe("addBomItemSchema", () => {
  test("exige componentProductId/quantity/unitId", () => {
    const result = addBomItemSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita item mínimo, defaults de scrapPercentage/sequence/isOptional", () => {
    const result = addBomItemSchema.safeParse({ componentProductId: uuid1, quantity: 4, unitId: uuid2 });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.scrapPercentage, 0);
      assert.equal(result.data.sequence, 10);
      assert.equal(result.data.isOptional, false);
    }
  });

  test("rejeita scrapPercentage >= 100", () => {
    const result = addBomItemSchema.safeParse({ componentProductId: uuid1, quantity: 1, unitId: uuid2, scrapPercentage: 100 });
    assert.equal(result.success, false);
  });

  test("rejeita quantity zero ou negativa", () => {
    const result = addBomItemSchema.safeParse({ componentProductId: uuid1, quantity: 0, unitId: uuid2 });
    assert.equal(result.success, false);
  });
});

describe("createProductionOrderSchema", () => {
  const base = {
    productId: uuid1,
    plannedQuantity: 100,
    unitId: uuid2,
    sourceWarehouseId: uuid3,
    consumptionLocationId: uuid4,
    targetWarehouseId: uuid3,
    outputLocationId: uuid4,
  };

  test("aceita ordem mínima válida, priority default medium, bomId opcional", () => {
    const result = createProductionOrderSchema.safeParse(base);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.priority, "medium");
      assert.equal(result.data.bomId, undefined);
    }
  });

  test("rejeita plannedQuantity zero ou negativa", () => {
    const result = createProductionOrderSchema.safeParse({ ...base, plannedQuantity: 0 });
    assert.equal(result.success, false);
  });

  test("rejeita priority fora do enum", () => {
    const result = createProductionOrderSchema.safeParse({ ...base, priority: "critica" });
    assert.equal(result.success, false);
  });

  test("aceita bomId explícito", () => {
    const result = createProductionOrderSchema.safeParse({ ...base, bomId: uuid2 });
    assert.equal(result.success, true);
  });

  test("exige todos os locais/depósitos", () => {
    const result = createProductionOrderSchema.safeParse({
      productId: uuid1, plannedQuantity: 10, unitId: uuid2, sourceWarehouseId: uuid3,
    });
    assert.equal(result.success, false);
  });
});

describe("planProductionOrderSchema", () => {
  test("aceita corpo vazio", () => {
    const result = planProductionOrderSchema.safeParse({});
    assert.equal(result.success, true);
  });
});

describe("registerProductionOutputSchema", () => {
  test("aceita corpo vazio com defaults zero", () => {
    const result = registerProductionOutputSchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.producedQuantity, 0);
      assert.equal(result.data.rejectedQuantity, 0);
    }
  });

  test("rejeita producedQuantity negativa", () => {
    const result = registerProductionOutputSchema.safeParse({ producedQuantity: -1 });
    assert.equal(result.success, false);
  });

  test("aceita lote e séries produzidas", () => {
    const result = registerProductionOutputSchema.safeParse({
      producedQuantity: 2, lotNumber: "LOTE-001", serialNumbers: ["SN-1", "SN-2"],
    });
    assert.equal(result.success, true);
  });
});

describe("consumeProductionMaterialSchema", () => {
  test("exige quantity positiva", () => {
    const result = consumeProductionMaterialSchema.safeParse({ quantity: 0 });
    assert.equal(result.success, false);
  });

  test("aceita consumo mínimo válido", () => {
    const result = consumeProductionMaterialSchema.safeParse({ quantity: 5 });
    assert.equal(result.success, true);
  });

  test("lotId vazio é tratado como ausente", () => {
    const result = consumeProductionMaterialSchema.safeParse({ quantity: 5, lotId: "" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.lotId, undefined);
  });
});

describe("returnProductionMaterialSchema", () => {
  test("exige quantity positiva", () => {
    const result = returnProductionMaterialSchema.safeParse({ quantity: -1 });
    assert.equal(result.success, false);
  });

  test("aceita devolução mínima válida", () => {
    const result = returnProductionMaterialSchema.safeParse({ quantity: 2 });
    assert.equal(result.success, true);
  });
});

describe("registerProductionScrapSchema", () => {
  test("exige motivo não vazio", () => {
    const result = registerProductionScrapSchema.safeParse({
      productionOrderId: uuid1, productId: uuid2, quantity: 1, unitId: uuid3, reason: "",
    });
    assert.equal(result.success, false);
  });

  test("aceita refugo de matéria-prima com materialId", () => {
    const result = registerProductionScrapSchema.safeParse({
      productionOrderId: uuid1, productId: uuid2, quantity: 1, unitId: uuid3, reason: "Quebra no manuseio", materialId: uuid4,
    });
    assert.equal(result.success, true);
  });

  test("aceita refugo de produto acabado sem materialId", () => {
    const result = registerProductionScrapSchema.safeParse({
      productionOrderId: uuid1, productId: uuid2, quantity: 1, unitId: uuid3, reason: "Defeito de pintura",
    });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.materialId, undefined);
  });
});

describe("logProductionOperationSchema", () => {
  test("exige productionOrderId", () => {
    const result = logProductionOperationSchema.safeParse({});
    assert.equal(result.success, false);
  });

  test("aceita apontamento mínimo válido, defaults zero", () => {
    const result = logProductionOperationSchema.safeParse({ productionOrderId: uuid1 });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.producedQuantity, 0);
      assert.equal(result.data.rejectedQuantity, 0);
    }
  });

  test("aceita apontamento completo", () => {
    const result = logProductionOperationSchema.safeParse({
      productionOrderId: uuid1,
      routingOperationId: uuid2,
      workCenterId: uuid3,
      operatorUserId: uuid4,
      startedAt: "2026-01-01T08:00:00Z",
      finishedAt: "2026-01-01T12:00:00Z",
      producedQuantity: 50,
      rejectedQuantity: 2,
      notes: "Turno da manhã",
    });
    assert.equal(result.success, true);
  });
});
