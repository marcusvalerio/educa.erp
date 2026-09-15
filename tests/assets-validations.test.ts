// Testes de validação (Zod) de Ativos e Manutenção (src/lib/validations/
// assets.ts, supabase/migrations/0056-0057).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0056-0057, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_guard_asset_hierarchy/fn_guard_asset_location_hierarchy:
//     prevenção de ciclo profundo
//   - fn_transition_maintenance_order_status: mapa de transições válidas
//   - fn_consume_maintenance_order_part: integração real com
//     fn_post_stock_movement/fn_register_cost_movement (ATIVO NÃO É
//     ESTOQUE, mas o consumo de peça passa por lá)
//   - fn_maintenance_order_cost_summary/fn_asset_history: agregação
//     correta entre cost_movements e maintenance_order_costs
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id; bloqueio de status via update direto)
// Ver docs/ASSETS.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assetCategorySchema,
  assetLocationSchema,
  assetSchema,
  maintenancePlanSchema,
  maintenanceOrderSchema,
  transitionMaintenanceOrderSchema,
  consumeMaintenanceOrderPartSchema,
  addMaintenanceOrderCostSchema,
} from "@/lib/validations/assets";

const uuid1 = "11111111-1111-4111-8111-111111111111";

describe("assetCategorySchema / assetLocationSchema", () => {
  test("assetCategorySchema exige code e name", () => {
    assert.equal(assetCategorySchema.safeParse({}).success, false);
  });
  test("assetLocationSchema aceita parentId opcional", () => {
    assert.equal(assetLocationSchema.safeParse({ code: "PLT1", name: "Planta 1" }).success, true);
    assert.equal(assetLocationSchema.safeParse({ code: "SET1", name: "Setor A", parentId: uuid1 }).success, true);
  });
});

describe("assetSchema", () => {
  test("exige description", () => {
    assert.equal(assetSchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(assetSchema.safeParse({ description: "Compressor de ar" }).success, true);
  });
  test("rejeita acquisitionCost negativo", () => {
    assert.equal(assetSchema.safeParse({ description: "Compressor", acquisitionCost: -10 }).success, false);
  });
});

describe("maintenancePlanSchema", () => {
  test("exige code/planType/periodicityType/description", () => {
    assert.equal(maintenancePlanSchema.safeParse({}).success, false);
  });
  test("aceita os três tipos de plano e cinco de periodicidade", () => {
    for (const planType of ["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"] as const) {
      for (const periodicityType of ["TIME", "HOURS", "CYCLES", "MILEAGE", "OTHER"] as const) {
        const result = maintenancePlanSchema.safeParse({ code: "PM1", planType, periodicityType, description: "Troca de óleo" });
        assert.equal(result.success, true, `${planType}/${periodicityType} deveria ser aceito`);
      }
    }
  });
});

describe("maintenanceOrderSchema / transitionMaintenanceOrderSchema", () => {
  test("exige assetId/orderType/description", () => {
    assert.equal(maintenanceOrderSchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(maintenanceOrderSchema.safeParse({ assetId: uuid1, orderType: "CORRECTIVE", description: "Vazamento no motor" }).success, true);
  });
  test("transitionMaintenanceOrderSchema rejeita status fora do vocabulário", () => {
    assert.equal(transitionMaintenanceOrderSchema.safeParse({ newStatus: "DONE" }).success, false);
  });
  test("transitionMaintenanceOrderSchema aceita status válido", () => {
    assert.equal(transitionMaintenanceOrderSchema.safeParse({ newStatus: "IN_PROGRESS" }).success, true);
  });
});

describe("consumeMaintenanceOrderPartSchema / addMaintenanceOrderCostSchema", () => {
  test("consumeMaintenanceOrderPartSchema exige productId/locationId/quantity positiva", () => {
    assert.equal(consumeMaintenanceOrderPartSchema.safeParse({ productId: uuid1, locationId: uuid1, quantity: 0 }).success, false);
    assert.equal(consumeMaintenanceOrderPartSchema.safeParse({ productId: uuid1, locationId: uuid1, quantity: 2 }).success, true);
  });
  test("addMaintenanceOrderCostSchema rejeita costType PART (só automático via estoque)", () => {
    assert.equal(addMaintenanceOrderCostSchema.safeParse({ costType: "PART", description: "x", amount: 10 }).success, false);
  });
  test("addMaintenanceOrderCostSchema aceita SERVICE/EXPENSE", () => {
    assert.equal(addMaintenanceOrderCostSchema.safeParse({ costType: "SERVICE", description: "Mão de obra", amount: 200 }).success, true);
  });
});
