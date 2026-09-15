// Testes de validação (Zod) de CRM (src/lib/validations/crm.ts,
// supabase/migrations/0054-0055).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0054-0055, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_convert_lead_to_customer: nunca duplica cliente (reaproveita
//     por documento), idempotência
//   - fn_move_opportunity_stage/fn_close_opportunity: histórico de
//     estágio, travas de concorrência (FOR UPDATE)
//   - fn_crm_*: cálculo correto de cada indicador
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id; bloqueio de status transacional
//     via update direto)
// Ver docs/CRM.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  leadOriginSchema,
  leadSchema,
  convertLeadToOpportunitySchema,
  pipelineStageSchema,
  opportunitySchema,
  moveOpportunityStageSchema,
  closeOpportunitySchema,
  convertOpportunityToQuoteSchema,
  activitySchema,
  updateActivitySchema,
} from "@/lib/validations/crm";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("leadOriginSchema", () => {
  test("exige code e name", () => {
    assert.equal(leadOriginSchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(leadOriginSchema.safeParse({ code: "SITE", name: "Site institucional" }).success, true);
  });
});

describe("leadSchema", () => {
  test("exige name", () => {
    assert.equal(leadSchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(leadSchema.safeParse({ name: "Maria Silva" }).success, true);
  });
  test("rejeita e-mail inválido", () => {
    assert.equal(leadSchema.safeParse({ name: "Maria Silva", email: "invalido" }).success, false);
  });
  test("rejeita qualification fora do vocabulário", () => {
    assert.equal(leadSchema.safeParse({ name: "Maria Silva", qualification: "BOILING" }).success, false);
  });
});

describe("convertLeadToOpportunitySchema", () => {
  test("exige pipelineId e stageId", () => {
    assert.equal(convertLeadToOpportunitySchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(convertLeadToOpportunitySchema.safeParse({ pipelineId: uuid1, stageId: uuid2 }).success, true);
  });
});

describe("pipelineStageSchema", () => {
  test("rejeita probabilityDefault fora de 0-100", () => {
    assert.equal(pipelineStageSchema.safeParse({ pipelineId: uuid1, code: "NEW", name: "Novo", probabilityDefault: 150 }).success, false);
  });
  test("aceita payload válido", () => {
    assert.equal(pipelineStageSchema.safeParse({ pipelineId: uuid1, code: "NEW", name: "Novo", probabilityDefault: 10 }).success, true);
  });
});

describe("opportunitySchema", () => {
  test("exige title, pipelineId e stageId", () => {
    assert.equal(opportunitySchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(opportunitySchema.safeParse({ title: "Venda de licenças", pipelineId: uuid1, stageId: uuid2 }).success, true);
  });
});

describe("moveOpportunityStageSchema / closeOpportunitySchema", () => {
  test("moveOpportunityStageSchema exige stageId", () => {
    assert.equal(moveOpportunityStageSchema.safeParse({}).success, false);
  });
  test("closeOpportunitySchema rejeita outcome fora do vocabulário", () => {
    assert.equal(closeOpportunitySchema.safeParse({ outcome: "MAYBE" }).success, false);
  });
  test("closeOpportunitySchema aceita WON/LOST", () => {
    assert.equal(closeOpportunitySchema.safeParse({ outcome: "WON" }).success, true);
    assert.equal(closeOpportunitySchema.safeParse({ outcome: "LOST", lostReason: "Preço" }).success, true);
  });
});

describe("convertOpportunityToQuoteSchema", () => {
  test("exige ao menos um item", () => {
    assert.equal(convertOpportunityToQuoteSchema.safeParse({ items: [] }).success, false);
  });
  test("aceita payload válido", () => {
    const result = convertOpportunityToQuoteSchema.safeParse({ items: [{ quantity: 2, unitPrice: 150 }] });
    assert.equal(result.success, true);
  });
});

describe("activitySchema / updateActivitySchema", () => {
  test("exige activityType/subject/relatedType/relatedId", () => {
    assert.equal(activitySchema.safeParse({}).success, false);
  });
  test("aceita os seis tipos de atividade", () => {
    for (const activityType of ["CALL", "MEETING", "TASK", "CONTACT", "FOLLOW_UP", "NOTE"] as const) {
      const result = activitySchema.safeParse({ activityType, subject: "Ligar para cliente", relatedType: "lead", relatedId: uuid1 });
      assert.equal(result.success, true, `activityType ${activityType} deveria ser aceito`);
    }
  });
  test("updateActivitySchema aceita apenas status", () => {
    assert.equal(updateActivitySchema.safeParse({ status: "DONE" }).success, true);
  });
});
