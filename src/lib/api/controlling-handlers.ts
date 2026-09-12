import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  periodRangeQuerySchema,
  openCompetencePeriodSchema,
  reopenCompetencePeriodSchema,
  createCostAllocationSchema,
  cancelCostAllocationSchema,
  createBudgetSchema,
} from "@/lib/validations/controlling";

// Handlers do domínio de Controladoria Gerencial (supabase/migrations/
// 0045-0047). Controladoria GERENCIAL, não contabilidade societária/
// fiscal — ver docs/CONTROLLING.md. Toda leitura agregada (DRE, KPIs,
// margens, resultado por centro) é uma função parametrizada (período)
// chamada via RPC com o cliente de sessão — permissão checada DENTRO
// da função SQL (mesmo padrão de fn_resolve_applicable_tax_rules),
// diferente das views simples (v_cash_flow_summary) lidas com o
// cliente admin.

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

function parsePeriodRange(request: NextRequest): { periodStart: string; periodEnd: string } {
  const { searchParams } = new URL(request.url);
  const parsed = periodRangeQuerySchema.safeParse({
    periodStart: searchParams.get("periodStart") ?? "",
    periodEnd: searchParams.get("periodEnd") ?? "",
  });
  if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
  return parsed.data;
}

function rpcError(error: { message?: string; code?: string }): ApiError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("permissão negada")) return new ApiError("FORBIDDEN", error.message ?? "", 403);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("só é possível") || message.includes("não pode") || message.includes("já cancelado") || message.includes("precisa fechar") || message.includes("precisa de ao menos")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------ financial_competence_periods
export async function listCompetencePeriods(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("controlling.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("financial_competence_periods").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("period_start", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getCompetencePeriod(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("controlling.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("financial_competence_periods").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Período de competência");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function openCompetencePeriod(request: NextRequest) {
  try {
    await requireAccess("controlling.period.manage");
    const body = await parseBody(request, openCompetencePeriodSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_open_competence_period", {
      p_company_id: ctx.companyId,
      p_code: body.code,
      p_period_start: body.periodStart,
      p_period_end: body.periodEnd,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function startClosingCompetencePeriod(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.close");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_start_closing_competence_period", { p_period_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function closeCompetencePeriod(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.close");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_close_competence_period", { p_period_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function reopenCompetencePeriod(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.reopen");
    const { id } = await context.params;
    const body = await parseBody(request, reopenCompetencePeriodSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reopen_competence_period", { p_period_id: id, p_reason: body.reason });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------- cost_allocations
export async function listCostAllocations(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("controlling.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("cost_allocations").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getCostAllocation(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("controlling.view");
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: header, error } = await admin.from("cost_allocations").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!header) throw notFoundError("Rateio");
    const { data: items, error: itemsError } = await admin.from("cost_allocation_items").select("*").eq("allocation_id", id);
    if (itemsError) throw translatePostgresError(itemsError);
    return NextResponse.json({ success: true, data: { ...header, items: items ?? [] } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createCostAllocation(request: NextRequest) {
  try {
    await requireAccess("controlling.allocate");
    const body = await parseBody(request, createCostAllocationSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_cost_allocation", {
      p_company_id: ctx.companyId,
      p_total_amount: body.totalAmount,
      p_criterion: body.criterion,
      p_items: body.items.map((item) => ({
        cost_center_id: item.costCenterId,
        percentage: item.percentage ?? null,
        amount: item.amount ?? null,
        notes: item.notes ?? null,
      })),
      p_source_type: body.sourceType ?? "manual",
      p_source_id: body.sourceId ?? null,
      p_competence_period_id: body.competencePeriodId ?? null,
      p_description: body.description ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelCostAllocation(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.allocate");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelCostAllocationSchema.safeParse(body ?? {});
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_cost_allocation", {
      p_allocation_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- budget
export async function listBudgets(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("controlling.budget.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("budget_headers").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("period_start", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getBudget(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("controlling.budget.view");
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: header, error } = await admin.from("budget_headers").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!header) throw notFoundError("Orçamento");
    const { data: items, error: itemsError } = await admin.from("budget_items").select("*").eq("budget_header_id", id);
    if (itemsError) throw translatePostgresError(itemsError);
    return NextResponse.json({ success: true, data: { ...header, items: items ?? [] } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createBudget(request: NextRequest) {
  try {
    await requireAccess("controlling.budget.create");
    const body = await parseBody(request, createBudgetSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_budget", {
      p_company_id: ctx.companyId,
      p_name: body.name,
      p_period_start: body.periodStart,
      p_period_end: body.periodEnd,
      p_items: body.items.map((item) => ({
        cost_center_id: item.costCenterId ?? null,
        financial_category_id: item.financialCategoryId ?? null,
        planned_amount: item.plannedAmount,
        notes: item.notes ?? null,
      })),
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function approveBudget(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.budget.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_approve_budget", { p_budget_header_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function closeBudget(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.budget.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_close_budget", { p_budget_header_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getBudgetVsActual(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("controlling.budget.view");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_get_budget_vs_actual", { p_budget_header_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------- DRE / KPIs / margens
export async function getDreGerencial(request: NextRequest) {
  try {
    await requireAccess("controlling.view");
    const { periodStart, periodEnd } = parsePeriodRange(request);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_get_dre_gerencial", {
      p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getControllingKpis(request: NextRequest) {
  try {
    await requireAccess("controlling.view");
    const { periodStart, periodEnd } = parsePeriodRange(request);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_controlling_kpis", {
      p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getResultByCostCenter(request: NextRequest) {
  try {
    await requireAccess("controlling.view");
    const { periodStart, periodEnd } = parsePeriodRange(request);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_result_by_cost_center", {
      p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getIndustrialCostSummary(request: NextRequest) {
  try {
    await requireAccess("controlling.view");
    const { periodStart, periodEnd } = parsePeriodRange(request);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_industrial_cost_summary", {
      p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getControllingForecast(request: NextRequest) {
  try {
    await requireAccess("controlling.forecast.view");
    const { periodStart, periodEnd } = parsePeriodRange(request);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_controlling_forecast", {
      p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

function marginHandlerFactory(rpcName: string) {
  return async function handler(request: NextRequest) {
    try {
      await requireAccess("controlling.view");
      const { periodStart, periodEnd } = parsePeriodRange(request);
      const ctx = await getAuthContext();
      if (!ctx) throw unauthorizedError();
      const supabase = await createClient();
      const { data, error } = await supabase.rpc(rpcName, {
        p_company_id: ctx.companyId, p_period_start: periodStart, p_period_end: periodEnd,
      });
      if (error) throw rpcError(error);
      return NextResponse.json({ success: true, data: data ?? [] });
    } catch (error) {
      return jsonError(error);
    }
  };
}

export const getMarginByProduct = marginHandlerFactory("fn_margin_by_product");
export const getMarginByCustomer = marginHandlerFactory("fn_margin_by_customer");
export const getMarginByOrder = marginHandlerFactory("fn_margin_by_order");
