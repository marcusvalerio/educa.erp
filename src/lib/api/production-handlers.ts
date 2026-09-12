import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  workCenterSchema,
  productionRoutingSchema,
  productionRoutingOperationSchema,
  createBomSchema,
  addBomItemSchema,
  createProductionOrderSchema,
  planProductionOrderSchema,
  registerProductionOutputSchema,
  consumeProductionMaterialSchema,
  returnProductionMaterialSchema,
  registerProductionScrapSchema,
  logProductionOperationSchema,
} from "@/lib/validations/production";

// Handlers do domínio Produção/PCP (supabase/migrations/0026-0030).
// Duas famílias de entidade, mesma distinção já usada em Estoque/
// Compras/Comercial/Logística:
//   - "cadastro" (work_centers/production_routings/
//     production_routing_operations): sem função RPC, leitura E escrita
//     via cliente admin após checagem de permissão na API — RLS no
//     banco é defesa em profundidade, não o caminho real de escrita
//     (mesmo padrão de src/lib/database/table.ts). Permissão
//     compartilhada production_operations.{view,create,update} — sem
//     granularidade por tabela, pedido explícito desta etapa.
//   - "transacional" (product_boms/production_orders e tudo que deriva
//     deles): escrita exclusiva via função RPC chamada com o cliente de
//     sessão do usuário (fn_* fazem sua própria checagem de
//     has_permission() via auth.uid()).
//
// Produção não cria um segundo estoque: nenhuma linha deste arquivo
// toca em stock_balances/stock_movements/stock_reservations — isso só
// acontece dentro das fn_* chamadas aqui como qualquer outra RPC.

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
  if (message.includes("excede") || message.includes("saldo")) return new ApiError("EXCEEDS_AVAILABLE", error.message ?? "", 409);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("só é possível") || message.includes("não pode ser") || message.includes("não está marcado")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------- work_centers
export async function listWorkCenters(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("work_centers").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createWorkCenter(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.create");
    const body = await parseBody(request, workCenterSchema);
    const admin = createAdminClient();
    const { data, error } = await admin.from("work_centers").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      type: body.type,
      description: body.description ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getWorkCenter(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("work_centers").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Centro de trabalho");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateWorkCenter(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.update");
    const { id } = await context.params;
    const body = await parseBody(request, workCenterSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const admin = createAdminClient();
    const { data, error } = await admin.from("work_centers").update(body).eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Centro de trabalho");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------- production_routings
export async function listProductionRoutings(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const productId = searchParams.get("productId");
    let query = createAdminClient().from("production_routings").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProductionRouting(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.create");
    const body = await parseBody(request, productionRoutingSchema);
    const ctx = await getAuthContext();
    const admin = createAdminClient();
    const { data, error } = await admin.from("production_routings").insert({
      company_id: companyId,
      product_id: body.productId ?? null,
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? "draft",
      notes: body.notes ?? null,
      created_by: ctx?.appUserId ?? null,
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProductionRouting(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: header, error } = await admin.from("production_routings").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!header) throw notFoundError("Roteiro de produção");
    const { data: operations, error: opError } = await admin.from("production_routing_operations").select("*").eq("routing_id", id).order("sequence");
    if (opError) throw translatePostgresError(opError);
    return NextResponse.json({ success: true, data: { ...header, operations: operations ?? [] } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateProductionRouting(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.update");
    const { id } = await context.params;
    const body = await parseBody(request, productionRoutingSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { productId, ...rest } = body;
    const admin = createAdminClient();
    const { data, error } = await admin.from("production_routings")
      .update({ ...rest, ...(productId !== undefined ? { product_id: productId ?? null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Roteiro de produção");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------- production_routing_operations
export async function listProductionRoutingOperations(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { searchParams } = new URL(request.url);
    const routingId = searchParams.get("routingId");
    let query = createAdminClient().from("production_routing_operations").select("*").eq("company_id", companyId);
    if (routingId) query = query.eq("routing_id", routingId);
    const { data, error } = await query.order("sequence");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProductionRoutingOperation(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.create");
    const body = await parseBody(request, productionRoutingOperationSchema);
    const admin = createAdminClient();
    const { data, error } = await admin.from("production_routing_operations").insert({
      company_id: companyId,
      routing_id: body.routingId,
      sequence: body.sequence,
      name: body.name,
      description: body.description ?? null,
      work_center_id: body.workCenterId ?? null,
      planned_time_minutes: body.plannedTimeMinutes ?? null,
      notes: body.notes ?? null,
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProductionRoutingOperation(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("production_routing_operations").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Operação de roteiro");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateProductionRoutingOperation(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_operations.update");
    const { id } = await context.params;
    const body = await parseBody(request, productionRoutingOperationSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { routingId, workCenterId, plannedTimeMinutes, ...rest } = body;
    const admin = createAdminClient();
    const { data, error } = await admin.from("production_routing_operations")
      .update({
        ...rest,
        ...(routingId !== undefined ? { routing_id: routingId } : {}),
        ...(workCenterId !== undefined ? { work_center_id: workCenterId ?? null } : {}),
        ...(plannedTimeMinutes !== undefined ? { planned_time_minutes: plannedTimeMinutes ?? null } : {}),
      })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Operação de roteiro");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------- BOM
async function fetchBomWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("product_boms").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("product_bom_items").select("*").eq("bom_id", id).order("sequence");
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listBoms(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_boms.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const productId = searchParams.get("productId");
    let query = createAdminClient().from("product_boms").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query.order("product_id").order("version", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getBom(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_boms.view");
    const { id } = await context.params;
    const data = await fetchBomWithItems(companyId, id);
    if (!data) throw notFoundError("BOM");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createBom(request: NextRequest) {
  try {
    await requireAccess("production_boms.create");
    const body = await parseBody(request, createBomSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_bom", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_reference_quantity: body.referenceQuantity,
      p_unit_id: body.unitId,
      p_valid_from: body.validFrom || null,
      p_valid_until: body.validUntil || null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addBomItem(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_boms.update");
    const { id } = await context.params;
    const body = await parseBody(request, addBomItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_bom_item", {
      p_bom_id: id,
      p_component_product_id: body.componentProductId,
      p_quantity: body.quantity,
      p_unit_id: body.unitId,
      p_scrap_percentage: body.scrapPercentage ?? 0,
      p_sequence: body.sequence ?? 10,
      p_is_optional: body.isOptional ?? false,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function removeBomItem(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_boms.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_remove_bom_item", { p_bom_item_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function activateBom(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_boms.approve");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_activate_bom", { p_bom_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function obsoleteBom(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_boms.approve");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_obsolete_bom", { p_bom_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- production_orders
async function fetchProductionOrderWithMaterials(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("production_orders").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: materials, error: materialsError } = await admin.from("production_order_materials").select("*").eq("production_order_id", id);
  if (materialsError) throw translatePostgresError(materialsError);
  return { ...header, materials: materials ?? [] };
}

export async function listProductionOrders(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_orders.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const productId = searchParams.get("productId");
    let query = createAdminClient().from("production_orders").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProductionOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("production_orders.view");
    const { id } = await context.params;
    const data = await fetchProductionOrderWithMaterials(companyId, id);
    if (!data) throw notFoundError("Ordem de produção");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createProductionOrder(request: NextRequest) {
  try {
    await requireAccess("production_orders.create");
    const body = await parseBody(request, createProductionOrderSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_production_order", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_planned_quantity: body.plannedQuantity,
      p_unit_id: body.unitId,
      p_source_warehouse_id: body.sourceWarehouseId,
      p_consumption_location_id: body.consumptionLocationId,
      p_target_warehouse_id: body.targetWarehouseId,
      p_output_location_id: body.outputLocationId,
      p_bom_id: body.bomId ?? null,
      p_priority: body.priority ?? "medium",
      p_planned_date: body.plannedDate || null,
      p_responsible_user_id: body.responsibleUserId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function productionOrderAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requireAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_production_order_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const releaseProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_release_production_order", "production_orders.release", request, context);
export const startProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_start_production_order", "production_orders.start", request, context);
export const holdProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_hold_production_order", "production_orders.update", request, context);
export const resumeProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_resume_production_order", "production_orders.update", request, context);
export const cancelProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_cancel_production_order", "production_orders.cancel", request, context);
export const completeProductionOrder = (request: NextRequest, context: RouteContext) =>
  productionOrderAction("fn_complete_production_order", "production_orders.complete", request, context);

export async function planProductionOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_orders.update");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = planProductionOrderSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_plan_production_order", {
      p_production_order_id: id,
      p_planned_date: parsed.success ? parsed.data.plannedDate || null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function registerProductionOutput(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_orders.update");
    const { id } = await context.params;
    const body = await parseBody(request, registerProductionOutputSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_production_output", {
      p_production_order_id: id,
      p_produced_quantity: body.producedQuantity ?? 0,
      p_rejected_quantity: body.rejectedQuantity ?? 0,
      p_lot_number: body.lotNumber ?? null,
      p_serial_numbers: body.serialNumbers ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------- production_order_materials
export async function listProductionOrderMaterials(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_materials.view");
    const { searchParams } = new URL(request.url);
    const productionOrderId = searchParams.get("productionOrderId");
    let query = createAdminClient().from("production_order_materials").select("*").eq("company_id", companyId);
    if (productionOrderId) query = query.eq("production_order_id", productionOrderId);
    const { data, error } = await query.order("created_at");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function consumeProductionMaterial(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_materials.consume");
    const { id } = await context.params;
    const body = await parseBody(request, consumeProductionMaterialSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_consume_production_material", {
      p_production_order_material_id: id,
      p_quantity: body.quantity,
      p_lot_id: body.lotId ?? null,
      p_serial_numbers: body.serialNumbers ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function returnProductionMaterial(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("production_materials.return");
    const { id } = await context.params;
    const body = await parseBody(request, returnProductionMaterialSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_return_production_material", {
      p_production_order_material_id: id,
      p_quantity: body.quantity,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- production_scrap
export async function listProductionScrap(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_scrap.view");
    const { searchParams } = new URL(request.url);
    const productionOrderId = searchParams.get("productionOrderId");
    let query = createAdminClient().from("production_scrap").select("*").eq("company_id", companyId);
    if (productionOrderId) query = query.eq("production_order_id", productionOrderId);
    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function registerProductionScrap(request: NextRequest) {
  try {
    await requireAccess("production_scrap.create");
    const body = await parseBody(request, registerProductionScrapSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_production_scrap", {
      p_production_order_id: body.productionOrderId,
      p_product_id: body.productId,
      p_quantity: body.quantity,
      p_unit_id: body.unitId,
      p_reason: body.reason,
      p_material_id: body.materialId ?? null,
      p_lot_id: body.lotId ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------- production_operation_logs
export async function listProductionOperationLogs(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("production_operations.view");
    const { searchParams } = new URL(request.url);
    const productionOrderId = searchParams.get("productionOrderId");
    let query = createAdminClient().from("production_operation_logs").select("*").eq("company_id", companyId);
    if (productionOrderId) query = query.eq("production_order_id", productionOrderId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function logProductionOperation(request: NextRequest) {
  try {
    await requireAccess("production_operations.create");
    const body = await parseBody(request, logProductionOperationSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_log_production_operation", {
      p_production_order_id: body.productionOrderId,
      p_routing_operation_id: body.routingOperationId ?? null,
      p_work_center_id: body.workCenterId ?? null,
      p_operator_user_id: body.operatorUserId ?? null,
      p_started_at: body.startedAt ?? null,
      p_finished_at: body.finishedAt ?? null,
      p_produced_quantity: body.producedQuantity ?? 0,
      p_rejected_quantity: body.rejectedQuantity ?? 0,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
