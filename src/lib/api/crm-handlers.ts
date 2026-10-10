import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import { toRpcSalesItems } from "@/lib/commercial/rpc-items";
import { classifyCrmRpcError } from "@/lib/crm/errors";
import {
  leadOriginSchema,
  leadSchema,
  updateLeadSchema,
  convertLeadToOpportunitySchema,
  pipelineSchema,
  pipelineStageSchema,
  opportunitySchema,
  updateOpportunitySchema,
  moveOpportunityStageSchema,
  closeOpportunitySchema,
  convertOpportunityToQuoteSchema,
  convertOpportunityToOrderSchema,
  activitySchema,
  updateActivitySchema,
  crmReportQuerySchema,
} from "@/lib/validations/crm";

// Handlers de CRM (supabase/migrations/0054-0055, Fase 15).

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

// Classificação pelo código do PostgreSQL (src/lib/crm/errors.ts). Antes as
// regras de estado (P0001) e os parâmetros inválidos (22023) viravam 500.
function rpcError(error: { message?: string; code?: string }): ApiError {
  const failure = classifyCrmRpcError(error);
  if (failure.status === null) return translatePostgresError(error);
  return new ApiError(failure.code, failure.message, failure.status);
}

type RouteContext = { params: Promise<{ id: string }> };

// As rotas de cadastro usam o cliente administrativo (service_role), que não
// passa pela RLS. As policies de leads/opportunities (0054) só aceitam edição
// direta de lead não convertido e de oportunidade aberta; esta verificação
// aplica a mesma regra na API. Mudanças de estado seguem pelas funções.
async function assertEditableStatus(table: "leads" | "opportunities", id: string, companyId: string) {
  const { data, error } = await createAdminClient().from(table).select("status").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!data) throw notFoundError(table === "leads" ? "Lead" : "Oportunidade");
  const status = (data as { status: string }).status;
  if (table === "leads" && status === "CONVERTED") throw leadConvertedError();
  if (table === "opportunities" && status !== "OPEN") throw opportunityClosedError();
}
const leadConvertedError = () => new ApiError("INVALID_STATUS_TRANSITION", "Lead convertido não pode ser editado. Altere o cliente ou a oportunidade gerada.", 409);
const opportunityClosedError = () => new ApiError("INVALID_STATUS_TRANSITION", "Oportunidade encerrada (ganha ou perdida) não pode ser editada.", 409);

// O registro do caminho (/:id) precisa ser da empresa da sessão ANTES de
// chamar a função do banco: assim outra empresa recebe 404 (como no GET), e
// não "Permissão negada", que revelaria que o ID existe.
async function assertInCompany(table: "leads" | "opportunities", id: string, companyId: string) {
  const { data, error } = await createAdminClient().from(table).select("id").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!data) throw notFoundError(table === "leads" ? "Lead" : "Oportunidade");
}

// Referências do corpo (responsável, origem, cliente, dono, pipeline/estágio).
// O cliente administrativo não passa pela RLS e várias colunas têm FK simples
// (só existência, sem empresa): sem esta checagem, um usuário gravaria o ID de
// um cadastro de OUTRA empresa no seu registro.
type Reference = { table: "users" | "lead_origins" | "customers" | "pipelines" | "pipeline_stages" | "leads"; id: string | null | undefined; label: string; extra?: Record<string, string> };
async function assertReferencesInCompany(companyId: string, refs: Reference[]) {
  for (const ref of refs) {
    if (!ref.id) continue;
    let query = createAdminClient().from(ref.table).select("id").eq("id", ref.id).eq("company_id", companyId);
    for (const [column, value] of Object.entries(ref.extra ?? {})) query = query.eq(column, value);
    const { data, error } = await query.maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw validationError(`${ref.label} informado não existe nesta empresa.`);
  }
}

// ------------------------------------------------------------ lead_origins
export async function listLeadOrigins() {
  try {
    const { companyId } = await requireAccess("lead_origins.view");
    const { data, error } = await createAdminClient().from("lead_origins").select("*").eq("company_id", companyId).order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createLeadOrigin(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("lead_origins.create");
    const body = await parseBody(request, leadOriginSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("lead_origins")
      .insert({ company_id: companyId, code: body.code, name: body.name, description: body.description ?? null, created_by: ctx?.appUserId ?? null })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateLeadOrigin(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("lead_origins.update");
    const { id } = await context.params;
    const body = await parseBody(request, leadOriginSchema.partial());
    const { data, error } = await createAdminClient()
      .from("lead_origins")
      .update({ code: body.code, name: body.name, description: body.description, status: body.status })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Origem de lead");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ leads
export async function listLeads(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("leads.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("leads").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getLead(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("leads.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("leads").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Lead");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createLead(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("leads.create");
    const body = await parseBody(request, leadSchema);
    await assertReferencesInCompany(companyId, [
      { table: "users", id: body.responsibleUserId, label: "Responsável" },
      { table: "lead_origins", id: body.originId, label: "Origem" },
    ]);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("leads")
      .insert({
        company_id: companyId,
        name: body.name,
        company_name: body.companyName ?? null,
        document: body.document ?? null,
        email: body.email || null,
        phone: body.phone ?? null,
        origin_id: body.originId ?? null,
        responsible_user_id: body.responsibleUserId ?? null,
        qualification: body.qualification ?? null,
        notes: body.notes ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateLead(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("leads.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateLeadSchema);
    await assertEditableStatus("leads", id, companyId);
    await assertReferencesInCompany(companyId, [
      { table: "users", id: body.responsibleUserId, label: "Responsável" },
      { table: "lead_origins", id: body.originId, label: "Origem" },
    ]);
    const { data, error } = await createAdminClient()
      .from("leads")
      .update({
        name: body.name,
        company_name: body.companyName,
        document: body.document,
        email: body.email || undefined,
        phone: body.phone,
        origin_id: body.originId,
        responsible_user_id: body.responsibleUserId,
        qualification: body.qualification,
        status: body.status,
        disqualify_reason: body.disqualifyReason,
        notes: body.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      // condição no próprio UPDATE: uma conversão entre a checagem acima e a
      // gravação não é sobrescrita (o lead convertido fica como está).
      .neq("status", "CONVERTED")
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) {
      await assertEditableStatus("leads", id, companyId);
      throw notFoundError("Lead");
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function convertLeadToCustomer(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("leads.convert");
    const { id } = await context.params;
    await assertInCompany("leads", id, companyId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_convert_lead_to_customer", { p_lead_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function convertLeadToOpportunity(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("leads.convert");
    const { id } = await context.params;
    const body = await parseBody(request, convertLeadToOpportunitySchema);
    await assertInCompany("leads", id, companyId);
    await assertReferencesInCompany(companyId, [
      { table: "pipelines", id: body.pipelineId, label: "Pipeline" },
      { table: "pipeline_stages", id: body.stageId, label: "Estágio", extra: { pipeline_id: body.pipelineId } },
    ]);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_convert_lead_to_opportunity", {
      p_lead_id: id,
      p_pipeline_id: body.pipelineId,
      p_stage_id: body.stageId,
      p_title: body.title ?? null,
      p_estimated_value: body.estimatedValue ?? 0,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- pipelines
export async function listPipelines() {
  try {
    const { companyId } = await requireAccess("pipelines.view");
    const { data, error } = await createAdminClient()
      .from("pipelines")
      .select("*, pipeline_stages(*)")
      .eq("company_id", companyId)
      .order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPipeline(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("pipelines.create");
    const body = await parseBody(request, pipelineSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("pipelines")
      .insert({ company_id: companyId, code: body.code, name: body.name, created_by: ctx?.appUserId ?? null })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePipeline(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("pipelines.update");
    const { id } = await context.params;
    const body = await parseBody(request, pipelineSchema.partial());
    const { data, error } = await createAdminClient().from("pipelines").update(body).eq("id", id).eq("company_id", companyId).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Pipeline");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPipelineStage(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("pipelines.create");
    const body = await parseBody(request, pipelineStageSchema);
    const { data, error } = await createAdminClient()
      .from("pipeline_stages")
      .insert({
        company_id: companyId,
        pipeline_id: body.pipelineId,
        code: body.code,
        name: body.name,
        sequence: body.sequence ?? 0,
        probability_default: body.probabilityDefault ?? 0,
        is_won: body.isWon ?? false,
        is_lost: body.isLost ?? false,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePipelineStage(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("pipelines.update");
    const { id } = await context.params;
    const body = await parseBody(request, pipelineStageSchema.partial());
    const { data, error } = await createAdminClient()
      .from("pipeline_stages")
      .update({ code: body.code, name: body.name, sequence: body.sequence, probability_default: body.probabilityDefault, is_won: body.isWon, is_lost: body.isLost, status: body.status })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Estágio de pipeline");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------- opportunities
export async function listOpportunities(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("opportunities.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const pipelineId = searchParams.get("pipelineId");
    let query = createAdminClient().from("opportunities").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (pipelineId) query = query.eq("pipeline_id", pipelineId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getOpportunity(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("opportunities").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Oportunidade");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createOpportunity(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("opportunities.create");
    const body = await parseBody(request, opportunitySchema);
    await assertReferencesInCompany(companyId, [
      { table: "customers", id: body.customerId, label: "Cliente" },
      { table: "leads", id: body.leadId, label: "Lead" },
      { table: "pipelines", id: body.pipelineId, label: "Pipeline" },
      { table: "pipeline_stages", id: body.stageId, label: "Estágio", extra: { pipeline_id: body.pipelineId } },
      { table: "users", id: body.ownerUserId, label: "Responsável" },
      { table: "lead_origins", id: body.originId, label: "Origem" },
    ]);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("opportunities")
      .insert({
        company_id: companyId,
        title: body.title,
        customer_id: body.customerId ?? null,
        lead_id: body.leadId ?? null,
        pipeline_id: body.pipelineId,
        stage_id: body.stageId,
        estimated_value: body.estimatedValue ?? 0,
        probability: body.probability ?? 0,
        owner_user_id: body.ownerUserId ?? null,
        expected_close_date: body.expectedCloseDate || null,
        origin_id: body.originId ?? null,
        notes: body.notes ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateOpportunity(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateOpportunitySchema);
    await assertEditableStatus("opportunities", id, companyId);
    await assertReferencesInCompany(companyId, [
      { table: "customers", id: body.customerId, label: "Cliente" },
      { table: "users", id: body.ownerUserId, label: "Responsável" },
    ]);
    const { data, error } = await createAdminClient()
      .from("opportunities")
      .update({
        title: body.title,
        customer_id: body.customerId,
        estimated_value: body.estimatedValue,
        probability: body.probability,
        owner_user_id: body.ownerUserId,
        expected_close_date: body.expectedCloseDate || undefined,
        notes: body.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      // condição no próprio UPDATE: um fechamento entre a checagem e a
      // gravação não é desfeito por esta edição.
      .eq("status", "OPEN")
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) {
      await assertEditableStatus("opportunities", id, companyId);
      throw notFoundError("Oportunidade");
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function moveOpportunityStage(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.move_stage");
    const { id } = await context.params;
    await assertInCompany("opportunities", id, companyId);
    const body = await parseBody(request, moveOpportunityStageSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_move_opportunity_stage", { p_opportunity_id: id, p_stage_id: body.stageId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function closeOpportunity(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.close");
    const { id } = await context.params;
    await assertInCompany("opportunities", id, companyId);
    const body = await parseBody(request, closeOpportunitySchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_close_opportunity", { p_opportunity_id: id, p_outcome: body.outcome, p_lost_reason: body.lostReason ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function convertOpportunityToQuote(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.convert");
    const { id } = await context.params;
    await assertInCompany("opportunities", id, companyId);
    const body = await parseBody(request, convertOpportunityToQuoteSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_convert_opportunity_to_sales_quote", {
      p_opportunity_id: id,
      p_items: toRpcSalesItems(body.items),
      p_valid_until: body.validUntil || null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function convertOpportunityToOrder(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("opportunities.convert");
    const { id } = await context.params;
    await assertInCompany("opportunities", id, companyId);
    const body = await parseBody(request, convertOpportunityToOrderSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_convert_opportunity_to_sales_order", {
      p_opportunity_id: id,
      p_items: body.items ? toRpcSalesItems(body.items) : null,
      p_sales_quote_id: body.salesQuoteId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------------- activities
export async function listActivities(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("activities.view");
    const { searchParams } = new URL(request.url);
    const relatedType = searchParams.get("relatedType");
    const relatedId = searchParams.get("relatedId");
    let query = createAdminClient().from("activities").select("*").eq("company_id", companyId);
    if (relatedType) query = query.eq("related_type", relatedType);
    if (relatedId) query = query.eq("related_id", relatedId);
    const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createActivity(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("activities.create");
    const body = await parseBody(request, activitySchema);
    await assertReferencesInCompany(companyId, [{ table: "users", id: body.ownerUserId, label: "Responsável" }]);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("activities")
      .insert({
        company_id: companyId,
        activity_type: body.activityType,
        subject: body.subject,
        description: body.description ?? null,
        related_type: body.relatedType,
        related_id: body.relatedId,
        due_date: body.dueDate || null,
        owner_user_id: body.ownerUserId ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateActivity(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("activities.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateActivitySchema);
    await assertReferencesInCompany(companyId, [{ table: "users", id: body.ownerUserId, label: "Responsável" }]);
    const { data, error } = await createAdminClient()
      .from("activities")
      .update({
        subject: body.subject,
        description: body.description,
        due_date: body.dueDate || undefined,
        status: body.status,
        completed_at: body.status === "DONE" ? new Date().toISOString() : undefined,
        owner_user_id: body.ownerUserId,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Atividade");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ reports
function parseReportQuery(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = crmReportQuerySchema.safeParse({
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    pipelineId: searchParams.get("pipelineId") ?? "",
  });
  if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
  return parsed.data;
}

// fn_crm_leads_by_origin/fn_crm_lead_conversion_rate/fn_crm_sales_by_rep/
// fn_crm_activities_summary/fn_crm_won_lost_opportunities recebem
// (company_id, date_from, date_to); fn_crm_opportunities_by_stage/
// fn_crm_pipeline_summary/fn_crm_avg_time_per_stage recebem (company_id,
// pipeline_id) — duas assinaturas diferentes, nunca misturadas na mesma
// chamada RPC (PostgREST rejeita parâmetro nomeado que a função não tem).
async function callReportByDate(request: NextRequest, fnName: string) {
  const { companyId } = await requireAccess("crm_reports.view");
  const query = parseReportQuery(request);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fnName, {
    p_company_id: companyId,
    p_date_from: query.dateFrom || null,
    p_date_to: query.dateTo || null,
  });
  if (error) throw rpcError(error);
  return data ?? [];
}

async function callReportByPipeline(request: NextRequest, fnName: string) {
  const { companyId } = await requireAccess("crm_reports.view");
  const query = parseReportQuery(request);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fnName, {
    p_company_id: companyId,
    p_pipeline_id: query.pipelineId || null,
  });
  if (error) throw rpcError(error);
  return data ?? [];
}

export async function getLeadsByOriginReport(request: NextRequest) {
  try {
    return NextResponse.json({ success: true, data: await callReportByDate(request, "fn_crm_leads_by_origin") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getLeadConversionRateReport(request: NextRequest) {
  try {
    const data = await callReportByDate(request, "fn_crm_lead_conversion_rate");
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getOpportunitiesByStageReport(request: NextRequest) {
  try {
    return NextResponse.json({ success: true, data: await callReportByPipeline(request, "fn_crm_opportunities_by_stage") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPipelineSummaryReport(request: NextRequest) {
  try {
    const data = await callReportByPipeline(request, "fn_crm_pipeline_summary");
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getSalesByRepReport(request: NextRequest) {
  try {
    return NextResponse.json({ success: true, data: await callReportByDate(request, "fn_crm_sales_by_rep") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getActivitiesSummaryReport(request: NextRequest) {
  try {
    return NextResponse.json({ success: true, data: await callReportByDate(request, "fn_crm_activities_summary") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getWonLostOpportunitiesReport(request: NextRequest) {
  try {
    const data = await callReportByDate(request, "fn_crm_won_lost_opportunities");
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getAvgTimePerStageReport(request: NextRequest) {
  try {
    return NextResponse.json({ success: true, data: await callReportByPipeline(request, "fn_crm_avg_time_per_stage") });
  } catch (error) {
    return jsonError(error);
  }
}
