// Testes de validação (Zod) do motor de Workflow + Aprovações
// (src/lib/validations/workflow.ts, supabase/migrations/0060-0061).
//
// IMPORTANTE — o que NÃO está coberto aqui (regra de negócio real
// vivendo em supabase/migrations/0060-0061, só verificável contra um
// Postgres real — nenhum Supabase real foi tocado, por instrução
// explícita):
//   - fn_start_workflow: resolução do workflow ativo por entity_type,
//     idempotência por entidade em aberto, filtragem de etapas por
//     workflow_rules (fn_evaluate_workflow_rule)
//   - fn_decide_approval: concorrência (FOR UPDATE em
//     workflow_instance_steps), elegibilidade de aprovador (USER
//     direto ou via ROLE em user_roles), políticas ALL/ANY/QUORUM,
//     avanço para a próxima etapa aplicável, justificativa obrigatória
//     em REJECTED quando configurado
//   - fn_publish_workflow_version: congelamento da versão, arquivamento
//     da versão PUBLISHED anterior
//   - RBAC via has_permission em cada fn_* (workflow.create/update/
//     activate/admin/execute/approve/reject/cancel/view)
//   - RLS (isolamento por company_id; escrita exclusiva via função)
// Ver docs/WORKFLOWS.md (aviso no topo) para o mesmo ponto.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  workflowSchema,
  updateWorkflowSchema,
  setWorkflowStatusSchema,
  createWorkflowVersionSchema,
  workflowStepSchema,
  workflowStepApproverSchema,
  workflowRuleSchema,
  startWorkflowSchema,
  decideApprovalSchema,
  cancelWorkflowInstanceSchema,
} from "@/lib/validations/workflow";

const uuid1 = "11111111-1111-4111-8111-111111111111";
const uuid2 = "22222222-2222-4222-8222-222222222222";

describe("workflowSchema", () => {
  test("exige code/name/module/entityType", () => {
    assert.equal(workflowSchema.safeParse({}).success, false);
  });
  test("aceita payload mínimo válido", () => {
    const result = workflowSchema.safeParse({ code: "SALES_ORDER_APPROVAL", name: "Aprovação de Pedido de Venda", module: "comercial", entityType: "sales_order" });
    assert.equal(result.success, true);
  });
});

describe("updateWorkflowSchema / setWorkflowStatusSchema", () => {
  test("updateWorkflowSchema aceita objeto vazio (patch parcial)", () => {
    assert.equal(updateWorkflowSchema.safeParse({}).success, true);
  });
  test("setWorkflowStatusSchema só aceita active/inactive", () => {
    assert.equal(setWorkflowStatusSchema.safeParse({ status: "active" }).success, true);
    assert.equal(setWorkflowStatusSchema.safeParse({ status: "archived" }).success, false);
  });
});

describe("createWorkflowVersionSchema", () => {
  test("aceita objeto vazio (notes é opcional)", () => {
    assert.equal(createWorkflowVersionSchema.safeParse({}).success, true);
  });
});

describe("workflowStepSchema", () => {
  test("exige stepOrder/name", () => {
    assert.equal(workflowStepSchema.safeParse({}).success, false);
  });
  test("rejeita stepOrder <= 0", () => {
    const result = workflowStepSchema.safeParse({ stepOrder: 0, name: "Aprovação financeira" });
    assert.equal(result.success, false);
  });
  test("exige quorumCount quando approvalPolicy=QUORUM", () => {
    const withoutQuorum = workflowStepSchema.safeParse({ stepOrder: 1, name: "Comitê", approvalPolicy: "QUORUM" });
    assert.equal(withoutQuorum.success, false);
    const withQuorum = workflowStepSchema.safeParse({ stepOrder: 1, name: "Comitê", approvalPolicy: "QUORUM", quorumCount: 2 });
    assert.equal(withQuorum.success, true);
  });
  test("aceita as três políticas de aprovação múltipla", () => {
    for (const approvalPolicy of ["ALL", "ANY"] as const) {
      const result = workflowStepSchema.safeParse({ stepOrder: 1, name: "Etapa", approvalPolicy });
      assert.equal(result.success, true, `approvalPolicy ${approvalPolicy} deveria ser aceita`);
    }
  });
});

describe("workflowStepApproverSchema", () => {
  test("USER exige userId e rejeita roleId junto", () => {
    assert.equal(workflowStepApproverSchema.safeParse({ approverType: "USER", userId: uuid1 }).success, true);
    assert.equal(workflowStepApproverSchema.safeParse({ approverType: "USER", userId: uuid1, roleId: uuid2 }).success, false);
    assert.equal(workflowStepApproverSchema.safeParse({ approverType: "USER" }).success, false);
  });
  test("ROLE exige roleId e rejeita userId junto", () => {
    assert.equal(workflowStepApproverSchema.safeParse({ approverType: "ROLE", roleId: uuid2 }).success, true);
    assert.equal(workflowStepApproverSchema.safeParse({ approverType: "ROLE", roleId: uuid2, userId: uuid1 }).success, false);
  });
});

describe("workflowRuleSchema", () => {
  test("aceita valor numérico, texto e array (in/not_in)", () => {
    assert.equal(workflowRuleSchema.safeParse({ attribute: "amount", operator: "lte", value: 1000 }).success, true);
    assert.equal(workflowRuleSchema.safeParse({ attribute: "documentType", operator: "eq", value: "NFE" }).success, true);
    assert.equal(workflowRuleSchema.safeParse({ attribute: "costCenterId", operator: "in", value: [uuid1, uuid2] }).success, true);
  });
  test("rejeita operador desconhecido", () => {
    const result = workflowRuleSchema.safeParse({ attribute: "amount", operator: "between", value: 1 });
    assert.equal(result.success, false);
  });
});

describe("startWorkflowSchema", () => {
  test("exige entityType/entityId válidos", () => {
    assert.equal(startWorkflowSchema.safeParse({ entityType: "sales_order", entityId: "not-a-uuid" }).success, false);
    assert.equal(startWorkflowSchema.safeParse({ entityType: "sales_order", entityId: uuid1 }).success, true);
  });
  test("aceita entitySnapshot e workflowCode opcionais", () => {
    const result = startWorkflowSchema.safeParse({ entityType: "sales_order", entityId: uuid1, entitySnapshot: { amount: 5000 }, workflowCode: "SALES_ORDER_APPROVAL" });
    assert.equal(result.success, true);
  });
});

describe("decideApprovalSchema", () => {
  test("só aceita APPROVED/REJECTED/RETURNED", () => {
    assert.equal(decideApprovalSchema.safeParse({ decision: "APPROVED" }).success, true);
    assert.equal(decideApprovalSchema.safeParse({ decision: "MAYBE" }).success, false);
  });
  test("justification é opcional na validação de forma (obrigatoriedade condicional é regra de negócio no banco)", () => {
    assert.equal(decideApprovalSchema.safeParse({ decision: "REJECTED" }).success, true);
  });
});

describe("cancelWorkflowInstanceSchema", () => {
  test("aceita objeto vazio (reason é opcional)", () => {
    assert.equal(cancelWorkflowInstanceSchema.safeParse({}).success, true);
  });
});
