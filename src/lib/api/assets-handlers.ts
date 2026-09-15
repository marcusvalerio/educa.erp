import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  assetCategorySchema,
  assetLocationSchema,
  assetSchema,
  updateAssetSchema,
  maintenancePlanSchema,
  maintenanceOrderSchema,
  updateMaintenanceOrderSchema,
  transitionMaintenanceOrderSchema,
  consumeMaintenanceOrderPartSchema,
  addMaintenanceOrderCostSchema,
} from "@/lib/validations/assets";

// Handlers de Ativos e Manutenção (supabase/migrations/0056-0057, Fase 16).

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

// -------------------------------------------------------------- asset_categories
export async function listAssetCategories() {
  try {
    const { companyId } = await requireAccess("asset_categories.view");
    const { data, error } = await createAdminClient().from("asset_categories").select("*").eq("company_id", companyId).order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAssetCategory(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("asset_categories.create");
    const body = await parseBody(request, assetCategorySchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("asset_categories")
      .insert({ company_id: companyId, code: body.code, name: body.name, description: body.description ?? null, created_by: ctx?.appUserId ?? null })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAssetCategory(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("asset_categories.update");
    const { id } = await context.params;
    const body = await parseBody(request, assetCategorySchema.partial());
    const { data, error } = await createAdminClient().from("asset_categories").update(body).eq("id", id).eq("company_id", companyId).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Categoria de ativo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- asset_locations
export async function listAssetLocations() {
  try {
    const { companyId } = await requireAccess("asset_locations.view");
    const { data, error } = await createAdminClient().from("asset_locations").select("*").eq("company_id", companyId).order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAssetLocation(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("asset_locations.create");
    const body = await parseBody(request, assetLocationSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("asset_locations")
      .insert({ company_id: companyId, code: body.code, name: body.name, parent_id: body.parentId ?? null, description: body.description ?? null, created_by: ctx?.appUserId ?? null })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAssetLocation(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("asset_locations.update");
    const { id } = await context.params;
    const body = await parseBody(request, assetLocationSchema.partial());
    const { data, error } = await createAdminClient()
      .from("asset_locations")
      .update({ code: body.code, name: body.name, parent_id: body.parentId, description: body.description, status: body.status })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Local de ativo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------------ assets
export async function listAssets(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("assets.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("assets").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getAsset(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("assets.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("assets").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ativo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAsset(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("assets.create");
    const body = await parseBody(request, assetSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("assets")
      .insert({
        company_id: companyId,
        description: body.description,
        category_id: body.categoryId ?? null,
        manufacturer: body.manufacturer ?? null,
        model: body.model ?? null,
        serial_number: body.serialNumber ?? null,
        location_id: body.locationId ?? null,
        parent_asset_id: body.parentAssetId ?? null,
        acquisition_date: body.acquisitionDate || null,
        acquisition_cost: body.acquisitionCost ?? null,
        supplier_id: body.supplierId ?? null,
        warranty_expiration: body.warrantyExpiration || null,
        cost_center_id: body.costCenterId ?? null,
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

export async function updateAsset(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("assets.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateAssetSchema);
    const { data, error } = await createAdminClient()
      .from("assets")
      .update({
        description: body.description,
        category_id: body.categoryId,
        manufacturer: body.manufacturer,
        model: body.model,
        serial_number: body.serialNumber,
        location_id: body.locationId,
        parent_asset_id: body.parentAssetId,
        status: body.status,
        warranty_expiration: body.warrantyExpiration || undefined,
        cost_center_id: body.costCenterId,
        notes: body.notes,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ativo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getAssetHistory(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("assets.view");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_asset_history", { p_asset_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ maintenance_plans
export async function listMaintenancePlans(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("maintenance_plans.view");
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("assetId");
    let query = createAdminClient().from("maintenance_plans").select("*").eq("company_id", companyId);
    if (assetId) query = query.eq("asset_id", assetId);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createMaintenancePlan(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("maintenance_plans.create");
    const body = await parseBody(request, maintenancePlanSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("maintenance_plans")
      .insert({
        company_id: companyId,
        code: body.code,
        asset_id: body.assetId ?? null,
        asset_category_id: body.assetCategoryId ?? null,
        plan_type: body.planType,
        periodicity_type: body.periodicityType,
        periodicity_value: body.periodicityValue ?? null,
        periodicity_unit: body.periodicityUnit ?? null,
        description: body.description,
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

export async function updateMaintenancePlan(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("maintenance_plans.update");
    const { id } = await context.params;
    const body = await parseBody(request, maintenancePlanSchema.partial());
    const { data, error } = await createAdminClient()
      .from("maintenance_plans")
      .update({
        description: body.description,
        periodicity_value: body.periodicityValue,
        periodicity_unit: body.periodicityUnit,
        notes: body.notes,
        status: body.status,
      })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Plano de manutenção");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- maintenance_orders
export async function listMaintenanceOrders(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("maintenance_orders.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const assetId = searchParams.get("assetId");
    let query = createAdminClient().from("maintenance_orders").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (assetId) query = query.eq("asset_id", assetId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getMaintenanceOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("maintenance_orders.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("maintenance_orders").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ordem de manutenção");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createMaintenanceOrder(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("maintenance_orders.create");
    const body = await parseBody(request, maintenanceOrderSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("maintenance_orders")
      .insert({
        company_id: companyId,
        asset_id: body.assetId,
        plan_id: body.planId ?? null,
        order_type: body.orderType,
        priority: body.priority ?? "MEDIUM",
        description: body.description,
        scheduled_date: body.scheduledDate || null,
        requested_by: body.requestedBy ?? ctx?.appUserId ?? null,
        assigned_to: body.assignedTo ?? null,
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

export async function updateMaintenanceOrder(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("maintenance_orders.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateMaintenanceOrderSchema);
    const { data, error } = await createAdminClient()
      .from("maintenance_orders")
      .update({ cause: body.cause, solution: body.solution, priority: body.priority, scheduled_date: body.scheduledDate || undefined, assigned_to: body.assignedTo, notes: body.notes })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Ordem de manutenção");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function transitionMaintenanceOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("maintenance_orders.transition");
    const { id } = await context.params;
    const body = await parseBody(request, transitionMaintenanceOrderSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_transition_maintenance_order_status", { p_order_id: id, p_new_status: body.newStatus });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function consumeMaintenanceOrderPart(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("maintenance_orders.consume_parts");
    const { id } = await context.params;
    const body = await parseBody(request, consumeMaintenanceOrderPartSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_consume_maintenance_order_part", {
      p_order_id: id,
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

export async function addMaintenanceOrderCost(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("maintenance_orders.manage_costs");
    const { id } = await context.params;
    const body = await parseBody(request, addMaintenanceOrderCostSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_maintenance_order_cost", {
      p_order_id: id,
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

export async function getMaintenanceOrderCostSummary(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("maintenance_orders.view");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_maintenance_order_cost_summary", { p_order_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}
