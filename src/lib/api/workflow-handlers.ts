import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
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

// Handlers do motor de Workflow + Aprovações (supabase/migrations/
// 0060-0061, Fase 20). Genérico e reutilizável por qualquer módulo —
// esta camada nunca conhece Sales Order/Purchase Order/etc., só
// entity_type/entity_id polimórficos.

async function requireAccess(permissionCode: string): Promise<{ companyId: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  const allowed = await hasPermission(ctx.companyId, permissionCode);
  if (!allowed) throw forbiddenError(permissionCode);
  return { companyId: ctx.companyId };
}

function firstIssueMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

async function parseBody<T>(request: NextRequest, schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { message: string }[] } } }): Promise<T> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw validationError("Corpo da requisição inválido.");
  const parsed = schema.safeParse(body);
  if (!parsed.success || !parsed.data) throw validationError(firstIssueMessage(parsed.error!));
  return parsed.data;
}

function rpcError(error: { message?: string; code?: string }): ApiError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("permissão negada") || message.includes("não é um aprovador elegível")) {
    return new ApiError("FORBIDDEN", error.message ?? "", 403);
  }
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (
    message.includes("só é possível") ||
    message.includes("já foi decidida") ||
    message.includes("não está aguardando") ||
    message.includes("não possui") ||
    message.includes("rascunho") ||
    message.includes("obrigatória") ||
    message.includes("nenhuma etapa aplicável") ||
    message.includes("mais de um workflow") ||
    message.includes("nenhum workflow ativo") ||
    message.includes("não possui versão publicada")
  ) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------------------ workflows
export async function listWorkflows(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("workflow.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const entityType = searchParams.get("entityType");
    let query = createAdminClient().from("workflows").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (entityType) query = query.eq("entity_type", entityType);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getWorkflow(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("workflow.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient()
      .from("workflows")
      .select("*, workflow_versions(*, workflow_steps(*, workflow_step_approvers(*), workflow_rules(*)))")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Workflow");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createWorkflow(request: NextRequest) {
  try {
    await requireAccess("workflow.create");
    const body = await parseBody(request, workflowSchema);
    const ctx = await getAuthContext();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_workflow", {
      p_company_id: ctx!.companyId,
      p_code: body.code,
      p_name: body.name,
      p_module: body.module,
      p_entity_type: body.entityType,
      p_description: body.description ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateWorkflow(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateWorkflowSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_workflow", {
      p_workflow_id: id,
      p_name: body.name ?? null,
      p_description: body.description ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setWorkflowStatus(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.activate");
    const { id } = await context.params;
    const body = await parseBody(request, setWorkflowStatusSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_workflow_status", { p_workflow_id: id, p_status: body.status });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- workflow_versions
export async function createWorkflowVersion(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.admin");
    const { id } = await context.params;
    const body = await parseBody(request, createWorkflowVersionSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_workflow_version", { p_workflow_id: id, p_notes: body.notes ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function publishWorkflowVersion(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.admin");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_publish_workflow_version", { p_workflow_version_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------------- workflow_steps
export async function addWorkflowStep(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.admin");
    const { id } = await context.params;
    const body = await parseBody(request, workflowStepSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_workflow_step", {
      p_workflow_version_id: id,
      p_step_order: body.stepOrder,
      p_name: body.name,
      p_description: body.description ?? null,
      p_step_type: body.stepType ?? "APPROVAL",
      p_approval_policy: body.approvalPolicy ?? "ALL",
      p_quorum_count: body.quorumCount ?? null,
      p_is_mandatory: body.isMandatory ?? true,
      p_require_justification_on_reject: body.requireJustificationOnReject ?? true,
      p_sla_hours: body.slaHours ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addWorkflowStepApprover(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.admin");
    const { id } = await context.params;
    const body = await parseBody(request, workflowStepApproverSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_workflow_step_approver", {
      p_workflow_step_id: id,
      p_approver_type: body.approverType,
      p_user_id: body.userId ?? null,
      p_role_id: body.roleId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addWorkflowRule(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.admin");
    const { id } = await context.params;
    const body = await parseBody(request, workflowRuleSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_workflow_rule", {
      p_workflow_step_id: id,
      p_attribute: body.attribute,
      p_operator: body.operator,
      p_value: JSON.stringify(body.value),
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- workflow_instances
export async function listWorkflowInstances(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("workflow.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    let query = createAdminClient().from("workflow_instances").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (entityType) query = query.eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);
    const { data, error } = await query.order("started_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getWorkflowInstance(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("workflow.view");
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("workflow_instances")
      .select("*, workflow_instance_steps(*, approvals(*))")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Instância de workflow");

    const { data: history, error: historyError } = await admin
      .from("approval_history")
      .select("*")
      .eq("company_id", companyId)
      .eq("workflow_instance_id", id)
      .order("occurred_at", { ascending: true });
    if (historyError) throw translatePostgresError(historyError);

    return NextResponse.json({ success: true, data: { ...data, history: history ?? [] } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function startWorkflowInstance(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("workflow.execute");
    const body = await parseBody(request, startWorkflowSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_start_workflow", {
      p_company_id: companyId,
      p_entity_type: body.entityType,
      p_entity_id: body.entityId,
      p_entity_snapshot: body.entitySnapshot ?? {},
      p_workflow_code: body.workflowCode ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelWorkflowInstance(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("workflow.cancel");
    const { id } = await context.params;
    const body = await parseBody(request, cancelWorkflowInstanceSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_workflow_instance", { p_workflow_instance_id: id, p_reason: body.reason ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- approvals
export async function decideApproval(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const { id } = await context.params;
    const body = await parseBody(request, decideApprovalSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_decide_approval", {
      p_approval_id: id,
      p_decision: body.decision,
      p_justification: body.justification ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listPendingApprovals() {
  try {
    const { companyId } = await requireAccess("workflow.view");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_workflow_pending_approvals", { p_company_id: companyId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
