// Testes de validação (Zod) de Projetos e Serviços
// (src/lib/validations/projects-services.ts, supabase/migrations/0059).
// time_entries é apontamento OPERACIONAL — não há campo de RH em
// nenhum schema aqui.
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0059, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_guard_project_task_hierarchy/fn_guard_project_task_dependency_cycle:
//     prevenção de ciclo (árvore e grafo)
//   - fn_transition_service_order_status: mapa de transições válidas
//   - fn_consume_project_service_material/fn_add_project_service_cost/
//     fn_project_service_cost_summary: integração real com estoque/custos
//   - fn_create_sales_quote_from_project/_service_order: nunca duplica
//     workflow comercial, nunca gera fatura automaticamente
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id; bloqueio de status via update direto)
// Ver docs/PROJECTS_SERVICES.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  projectSchema,
  projectTaskSchema,
  projectTaskDependencySchema,
  timeEntrySchema,
  serviceOrderSchema,
  transitionServiceOrderSchema,
  consumeProjectServiceMaterialSchema,
  addProjectServiceCostSchema,
  createSalesQuoteFromSourceSchema,
} from "@/lib/validations/projects-services";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("projectSchema / projectTaskSchema", () => {
  test("projectSchema exige name", () => {
    assert.equal(projectSchema.safeParse({}).success, false);
  });
  test("projectTaskSchema exige projectId e name", () => {
    assert.equal(projectTaskSchema.safeParse({}).success, false);
    assert.equal(projectTaskSchema.safeParse({ projectId: uuid1, name: "Levantamento de requisitos" }).success, true);
  });
});

describe("projectTaskDependencySchema", () => {
  test("exige taskId e dependsOnTaskId", () => {
    assert.equal(projectTaskDependencySchema.safeParse({}).success, false);
    assert.equal(projectTaskDependencySchema.safeParse({ taskId: uuid1, dependsOnTaskId: uuid2 }).success, true);
  });
});

describe("timeEntrySchema — apontamento operacional, não RH", () => {
  test("rejeita sem projectId nem serviceOrderId", () => {
    const result = timeEntrySchema.safeParse({ entryDate: "2025-01-10", durationMinutes: 60 });
    assert.equal(result.success, false);
  });
  test("aceita com projectId", () => {
    assert.equal(timeEntrySchema.safeParse({ projectId: uuid1, entryDate: "2025-01-10", durationMinutes: 60 }).success, true);
  });
  test("aceita com serviceOrderId", () => {
    assert.equal(timeEntrySchema.safeParse({ serviceOrderId: uuid1, entryDate: "2025-01-10", durationMinutes: 30 }).success, true);
  });
  test("rejeita duração não positiva", () => {
    assert.equal(timeEntrySchema.safeParse({ projectId: uuid1, entryDate: "2025-01-10", durationMinutes: 0 }).success, false);
  });
});

describe("serviceOrderSchema / transitionServiceOrderSchema", () => {
  test("exige customerId e title", () => {
    assert.equal(serviceOrderSchema.safeParse({}).success, false);
    assert.equal(serviceOrderSchema.safeParse({ customerId: uuid1, title: "Instalação de equipamento" }).success, true);
  });
  test("transitionServiceOrderSchema rejeita OPEN (não é destino de transição)", () => {
    assert.equal(transitionServiceOrderSchema.safeParse({ newStatus: "OPEN" }).success, false);
  });
  test("transitionServiceOrderSchema aceita destinos válidos", () => {
    for (const newStatus of ["SCHEDULED", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"] as const) {
      assert.equal(transitionServiceOrderSchema.safeParse({ newStatus }).success, true);
    }
  });
});

describe("consumeProjectServiceMaterialSchema / addProjectServiceCostSchema", () => {
  test("consumeProjectServiceMaterialSchema exige sourceType/sourceId/productId/locationId/quantity", () => {
    assert.equal(consumeProjectServiceMaterialSchema.safeParse({}).success, false);
    assert.equal(
      consumeProjectServiceMaterialSchema.safeParse({ sourceType: "project", sourceId: uuid1, productId: uuid1, locationId: uuid1, quantity: 3 }).success,
      true
    );
  });
  test("addProjectServiceCostSchema rejeita costType MATERIAL (só automático via estoque)", () => {
    assert.equal(addProjectServiceCostSchema.safeParse({ sourceType: "service_order", sourceId: uuid1, costType: "MATERIAL", description: "x", amount: 10 }).success, false);
  });
  test("addProjectServiceCostSchema aceita SERVICE/EXPENSE", () => {
    assert.equal(addProjectServiceCostSchema.safeParse({ sourceType: "project", sourceId: uuid1, costType: "SERVICE", description: "Consultoria", amount: 500 }).success, true);
  });
});

describe("createSalesQuoteFromSourceSchema", () => {
  test("exige ao menos um item", () => {
    assert.equal(createSalesQuoteFromSourceSchema.safeParse({ items: [] }).success, false);
  });
  test("aceita payload válido", () => {
    assert.equal(createSalesQuoteFromSourceSchema.safeParse({ items: [{ quantity: 1, unitPrice: 1000 }] }).success, true);
  });
});
