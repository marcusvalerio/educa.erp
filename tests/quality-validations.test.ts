// Testes de validação (Zod) de Qualidade (src/lib/validations/quality.ts,
// supabase/migrations/0058).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0058, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_record_inspection_result: cálculo automático de PASS/FAIL por
//     criteria_type (PASS_FAIL/YES_NO/NUMERIC/RANGE; TEXT nunca calcula)
//   - fn_send_to_quarantine: exigência de purpose='QUARANTINE' no
//     destino, custo do leg de entrada herdado do leg de saída
//   - fn_quality_traceability: junção correta fornecedor->lote->
//     recebimento->inspeção->estoque->produção->expedição
//   - fn_transition_nonconformity_status/fn_transition_quality_action_status:
//     mapas de transição válidos
//   - RBAC via has_permission em cada fn_*
//   - RLS (isolamento por company_id; bloqueio de status via update direto)
// Ver docs/QUALITY.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  qualityChecklistSchema,
  qualityChecklistItemSchema,
  qualityInspectionSchema,
  recordInspectionResultSchema,
  finalizeInspectionSchema,
  sendToQuarantineSchema,
  nonconformitySchema,
  transitionNonconformitySchema,
  qualityActionSchema,
  transitionQualityActionSchema,
} from "@/lib/validations/quality";

const uuid1 = "11111111-1111-4111-8111-111111111111";

describe("qualityChecklistSchema / qualityChecklistItemSchema", () => {
  test("qualityChecklistSchema exige code/name/inspectionType", () => {
    assert.equal(qualityChecklistSchema.safeParse({}).success, false);
  });
  test("qualityChecklistSchema aceita os seis tipos de inspeção", () => {
    for (const inspectionType of ["RECEIVING", "PRODUCTION", "SHIPPING", "RETURN", "PROCESS", "OTHER"] as const) {
      const result = qualityChecklistSchema.safeParse({ code: "CHK1", name: "Checklist", inspectionType });
      assert.equal(result.success, true, `inspectionType ${inspectionType} deveria ser aceito`);
    }
  });
  test("qualityChecklistItemSchema aceita os cinco tipos de critério", () => {
    for (const criteriaType of ["PASS_FAIL", "NUMERIC", "TEXT", "YES_NO", "RANGE"] as const) {
      const result = qualityChecklistItemSchema.safeParse({ checklistId: uuid1, description: "Critério", criteriaType });
      assert.equal(result.success, true, `criteriaType ${criteriaType} deveria ser aceito`);
    }
  });
});

describe("qualityInspectionSchema", () => {
  test("exige inspectionType", () => {
    assert.equal(qualityInspectionSchema.safeParse({}).success, false);
  });
  test("aceita sourceType do vocabulário polimórfico", () => {
    assert.equal(qualityInspectionSchema.safeParse({ inspectionType: "RECEIVING", sourceType: "purchase_receipt", sourceId: uuid1 }).success, true);
  });
  test("rejeita sourceType fora do vocabulário", () => {
    assert.equal(qualityInspectionSchema.safeParse({ inspectionType: "RECEIVING", sourceType: "invoice" }).success, false);
  });
});

describe("recordInspectionResultSchema / finalizeInspectionSchema", () => {
  test("recordInspectionResultSchema exige checklistItemId", () => {
    assert.equal(recordInspectionResultSchema.safeParse({}).success, false);
  });
  test("finalizeInspectionSchema rejeita status fora do vocabulário", () => {
    assert.equal(finalizeInspectionSchema.safeParse({ status: "OK" }).success, false);
  });
  test("finalizeInspectionSchema aceita os três status finais", () => {
    for (const status of ["APPROVED", "REJECTED", "PARTIALLY_APPROVED"] as const) {
      assert.equal(finalizeInspectionSchema.safeParse({ status }).success, true);
    }
  });
});

describe("sendToQuarantineSchema", () => {
  test("exige productId/fromLocationId/quarantineLocationId/quantity positiva", () => {
    assert.equal(sendToQuarantineSchema.safeParse({}).success, false);
    assert.equal(
      sendToQuarantineSchema.safeParse({ productId: uuid1, fromLocationId: uuid1, quarantineLocationId: uuid1, quantity: 5 }).success,
      true
    );
  });
});

describe("nonconformitySchema / transitionNonconformitySchema", () => {
  test("exige description", () => {
    assert.equal(nonconformitySchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo", () => {
    assert.equal(nonconformitySchema.safeParse({ description: "Peça fora de especificação" }).success, true);
  });
  test("transitionNonconformitySchema rejeita OPEN (não é destino de transição)", () => {
    assert.equal(transitionNonconformitySchema.safeParse({ newStatus: "OPEN" }).success, false);
  });
});

describe("qualityActionSchema / transitionQualityActionSchema", () => {
  test("exige actionType/description", () => {
    assert.equal(qualityActionSchema.safeParse({}).success, false);
  });
  test("aceita CORRECTIVE/PREVENTIVE", () => {
    assert.equal(qualityActionSchema.safeParse({ actionType: "CORRECTIVE", description: "Recalibrar máquina" }).success, true);
    assert.equal(qualityActionSchema.safeParse({ actionType: "PREVENTIVE", description: "Treinar equipe" }).success, true);
  });
  test("transitionQualityActionSchema aceita os três destinos válidos", () => {
    for (const newStatus of ["IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) {
      assert.equal(transitionQualityActionSchema.safeParse({ newStatus }).success, true);
    }
  });
});
