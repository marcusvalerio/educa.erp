import { z } from "zod";

// Validação server-side do motor de Workflow + Aprovações (Fase 20,
// supabase/migrations/0060-0061). Mesmo espírito de
// src/lib/validations/{fiscal,projects-services,...}.ts: valida forma
// e tipos antes de chamar a função RPC correspondente — a regra de
// negócio real (concorrência, alçada, quorum, imutabilidade de versão
// publicada) vive no banco.

const uuidField = (message: string) => z.string().trim().uuid(message);

// -------------------------------------------------------------- workflows
export const workflowSchema = z.object({
  code: z.string().trim().min(1, "Informe o código do workflow."),
  name: z.string().trim().min(1, "Informe o nome do workflow."),
  module: z.string().trim().min(1, "Informe o módulo do workflow."),
  entityType: z.string().trim().min(1, "Informe o tipo de entidade (entityType)."),
  description: z.string().trim().optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
});

export const setWorkflowStatusSchema = z.object({
  status: z.enum(["active", "inactive"]),
});

// -------------------------------------------------------- workflow_versions
export const createWorkflowVersionSchema = z.object({
  notes: z.string().trim().optional(),
});

// ------------------------------------------------------------ workflow_steps
export const workflowStepSchema = z.object({
  stepOrder: z.coerce.number().int().positive("A ordem da etapa deve ser maior que zero."),
  name: z.string().trim().min(1, "Informe o nome da etapa."),
  description: z.string().trim().optional(),
  stepType: z.enum(["APPROVAL", "REVIEW", "NOTIFICATION"]).optional(),
  approvalPolicy: z.enum(["ALL", "ANY", "QUORUM"]).optional(),
  quorumCount: z.coerce.number().int().positive().optional(),
  isMandatory: z.boolean().optional(),
  requireJustificationOnReject: z.boolean().optional(),
  slaHours: z.coerce.number().int().positive().optional(),
}).refine((v) => v.approvalPolicy !== "QUORUM" || typeof v.quorumCount === "number", {
  message: "Informe quorumCount quando approvalPolicy for QUORUM.",
  path: ["quorumCount"],
});

export const workflowStepApproverSchema = z.object({
  approverType: z.enum(["USER", "ROLE"]),
  userId: uuidField("userId inválido.").optional(),
  roleId: uuidField("roleId inválido.").optional(),
}).refine((v) => (v.approverType === "USER" ? !!v.userId && !v.roleId : !!v.roleId && !v.userId), {
  message: "Informe userId (para USER) ou roleId (para ROLE), nunca os dois.",
  path: ["userId"],
});

export const workflowRuleSchema = z.object({
  attribute: z.string().trim().min(1, "Informe o atributo avaliado pela regra."),
  operator: z.enum(["eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

// -------------------------------------------------------------- execução
export const startWorkflowSchema = z.object({
  entityType: z.string().trim().min(1, "Informe entityType."),
  entityId: uuidField("entityId inválido."),
  entitySnapshot: z.record(z.string(), z.unknown()).optional(),
  workflowCode: z.string().trim().optional(),
});

export const decideApprovalSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  justification: z.string().trim().optional(),
});

export const cancelWorkflowInstanceSchema = z.object({
  reason: z.string().trim().optional(),
});
