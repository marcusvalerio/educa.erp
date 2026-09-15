import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  projectSchema,
  updateProjectSchema,
  projectTaskSchema,
  updateProjectTaskSchema,
  projectTaskDependencySchema,
  timeEntrySchema,
  serviceOrderSchema,
  updateServiceOrderSchema,
  transitionServiceOrderSchema,
  consumeProjectServiceMaterialSchema,
  addProjectServiceCostSchema,
  createSalesQuoteFromSourceSchema,
  createQualityInspectionFromServiceOrderSchema,
} from "@/lib/validations/projects-services";

// Handlers de Projetos e Serviços (supabase/migrations/0059, Fase 18).
// time_entries é apontamento operacional — nunca tratado como
// ponto/folha de RH nesta camada também.

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
  if (message.includes("permissão negada")) return new ApiError("FORBIDDEN", error.message ?? "", 403);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("inválid") || message.includes("transição") || message.includes("só é possível")) return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------------------ projects
export async function listProjects(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("projects.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("projects").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProject(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("projects.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("projects").select("*, project_tasks(*)").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Projeto");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProject(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("projects.create");
    const body = await parseBody(request, projectSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("projects")
      .insert({
        company_id: companyId,
        name: body.name,
        customer_id: body.customerId ?? null,
        description: body.description ?? null,
        responsible_user_id: body.responsibleUserId ?? null,
        start_date: body.startDate || null,
        forecast_end_date: body.forecastEndDate || null,
        budget: body.budget ?? null,
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

export async function updateProject(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("projects.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateProjectSchema);
    const { data, error } = await createAdminClient()
      .from("projects")
      .update({
        name: body.name,
        customer_id: body.customerId,
        description: body.description,
        responsible_user_id: body.responsibleUserId,
        status: body.status,
        start_date: body.startDate || undefined,
        forecast_end_date: body.forecastEndDate || undefined,
        end_date: body.endDate || undefined,
        budget: body.budget,
        notes: body.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Projeto");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- project_tasks
export async function listProjectTasks(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("project_tasks.view");
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    let query = createAdminClient().from("project_tasks").select("*").eq("company_id", companyId);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.order("created_at");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProjectTask(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("project_tasks.create");
    const body = await parseBody(request, projectTaskSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("project_tasks")
      .insert({
        company_id: companyId,
        project_id: body.projectId,
        parent_task_id: body.parentTaskId ?? null,
        name: body.name,
        priority: body.priority ?? "MEDIUM",
        due_date: body.dueDate || null,
        estimated_hours: body.estimatedHours ?? null,
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

export async function updateProjectTask(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("project_tasks.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateProjectTaskSchema);
    const { data, error } = await createAdminClient()
      .from("project_tasks")
      .update({ name: body.name, priority: body.priority, status: body.status, due_date: body.dueDate || undefined, estimated_hours: body.estimatedHours, notes: body.notes })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Tarefa de projeto");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProjectTaskDependency(request: NextRequest) {
  try {
    await requireAccess("project_tasks.update");
    const body = await parseBody(request, projectTaskDependencySchema);
    const { data, error } = await createAdminClient()
      .from("project_task_dependencies")
      .insert({ task_id: body.taskId, depends_on_task_id: body.dependsOnTaskId })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------- time_entries
export async function listTimeEntries(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("time_entries.view");
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const serviceOrderId = searchParams.get("serviceOrderId");
    let query = createAdminClient().from("time_entries").select("*").eq("company_id", companyId);
    if (projectId) query = query.eq("project_id", projectId);
    if (serviceOrderId) query = query.eq("service_order_id", serviceOrderId);
    const { data, error } = await query.order("entry_date", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createTimeEntry(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("time_entries.create");
    const body = await parseBody(request, timeEntrySchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("time_entries")
      .insert({
        company_id: companyId,
        project_id: body.projectId ?? null,
        task_id: body.taskId ?? null,
        service_order_id: body.serviceOrderId ?? null,
        entry_date: body.entryDate,
        duration_minutes: body.durationMinutes,
        description: body.description ?? null,
        user_id: body.userId ?? ctx?.appUserId ?? null,
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

// ------------------------------------------------------------------- service_orders
export async function listServiceOrders(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("service_orders.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("service_orders").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getServiceOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("service_orders.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("service_orders").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ordem de serviço");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createServiceOrder(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("service_orders.create");
    const body = await parseBody(request, serviceOrderSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("service_orders")
      .insert({
        company_id: companyId,
        customer_id: body.customerId,
        project_id: body.projectId ?? null,
        title: body.title,
        description: body.description ?? null,
        priority: body.priority ?? "MEDIUM",
        scheduled_date: body.scheduledDate || null,
        responsible_user_id: body.responsibleUserId ?? null,
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

export async function updateServiceOrder(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("service_orders.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateServiceOrderSchema);
    const { data, error } = await createAdminClient()
      .from("service_orders")
      .update({
        title: body.title,
        description: body.description,
        priority: body.priority,
        scheduled_date: body.scheduledDate || undefined,
        responsible_user_id: body.responsibleUserId,
        notes: body.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ordem de serviço");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function transitionServiceOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("service_orders.transition");
    const { id } = await context.params;
    const body = await parseBody(request, transitionServiceOrderSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_transition_service_order_status", { p_order_id: id, p_new_status: body.newStatus });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createQualityInspectionFromServiceOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("quality_inspections.create");
    const { id } = await context.params;
    const body = await parseBody(request, createQualityInspectionFromServiceOrderSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_quality_inspection_from_service_order", { p_service_order_id: id, p_checklist_id: body.checklistId ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------- materiais e custos
export async function consumeProjectServiceMaterial(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const body = await parseBody(request, consumeProjectServiceMaterialSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_consume_project_service_material", {
      p_source_type: body.sourceType,
      p_source_id: body.sourceId,
      p_product_id: body.productId,
      p_location_id: body.locationId,
      p_quantity: body.quantity,
      p_lot_id: body.lotId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addProjectServiceCost(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const body = await parseBody(request, addProjectServiceCostSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_project_service_cost", {
      p_source_type: body.sourceType,
      p_source_id: body.sourceId,
      p_cost_type: body.costType,
      p_description: body.description,
      p_amount: body.amount,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProjectServiceCostSummary(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const { searchParams } = new URL(request.url);
    const sourceType = searchParams.get("sourceType");
    const sourceId = searchParams.get("sourceId");
    if (!sourceType || !sourceId) throw validationError("Informe sourceType e sourceId.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_project_service_cost_summary", { p_source_type: sourceType, p_source_id: sourceId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------- integração comercial
export async function createSalesQuoteFromProject(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("projects.convert");
    const { id } = await context.params;
    const body = await parseBody(request, createSalesQuoteFromSourceSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_sales_quote_from_project", { p_project_id: id, p_items: body.items, p_valid_until: body.validUntil || null, p_notes: body.notes ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createSalesQuoteFromServiceOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("service_orders.convert");
    const { id } = await context.params;
    const body = await parseBody(request, createSalesQuoteFromSourceSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_sales_quote_from_service_order", {
      p_service_order_id: id,
      p_items: body.items,
      p_valid_until: body.validUntil || null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
