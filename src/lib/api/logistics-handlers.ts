import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  createPickListSchema,
  pickItemSchema,
  createShipmentSchema,
  assignShipmentTransportSchema,
  addShipmentPackageSchema,
  shipActionSchema,
  createDeliveryEventSchema,
  confirmDeliverySchema,
  failDeliverySchema,
} from "@/lib/validations/logistics";

// Handlers do domínio Logística/Expedição (supabase/migrations/
// 0023-0025). Mesma arquitetura de src/lib/api/{inventory,purchasing,
// commercial}-handlers.ts: leitura via cliente admin (depois de checar
// permissão na API), escrita SEMPRE via função RPC chamada com o
// cliente de sessão do usuário — as funções fn_* fazem sua própria
// checagem de has_permission() via auth.uid(), que só resolve com uma
// sessão real.
//
// Logística não cria um segundo estoque: nenhuma linha deste arquivo
// toca em stock_balances/stock_movements/stock_reservations — isso só
// acontece dentro de fn_ship_shipment (chamada aqui como qualquer
// outra RPC), que por sua vez só chama fn_post_stock_movement (0009).

type Access = { companyId: string };

async function requireLogisticsAccess(permissionCode: string): Promise<Access> {
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
  if (message.includes("só é possível") || message.includes("não pode ser") || message.includes("não pertence")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };
type ItemRouteContext = { params: Promise<{ id: string; itemId: string }> };

// ------------------------------------------------------------- pick-lists
async function fetchPickListWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("pick_lists").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("pick_list_items").select("*").eq("pick_list_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listPickLists(request: NextRequest) {
  try {
    const { companyId } = await requireLogisticsAccess("pick_lists.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const salesOrderId = searchParams.get("salesOrderId");
    let query = createAdminClient().from("pick_lists").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (salesOrderId) query = query.eq("sales_order_id", salesOrderId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPickList(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireLogisticsAccess("pick_lists.view");
    const { id } = await context.params;
    const data = await fetchPickListWithItems(companyId, id);
    if (!data) throw notFoundError("Separação");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPickList(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("pick_lists.create");
    const { id: salesOrderId } = await context.params;
    const body = await parseBody(request, createPickListSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_pick_list", {
      p_company_id: ctx.companyId,
      p_sales_order_id: salesOrderId,
      p_warehouse_id: body.warehouseId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function pickListAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_pick_list_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const startPicking = (request: NextRequest, context: RouteContext) =>
  pickListAction("fn_start_picking", "pick_lists.update", request, context);
export const completePickList = (request: NextRequest, context: RouteContext) =>
  pickListAction("fn_complete_pick_list", "pick_lists.complete", request, context);
export const cancelPickList = (request: NextRequest, context: RouteContext) =>
  pickListAction("fn_cancel_pick_list", "pick_lists.cancel", request, context);

export async function pickItem(request: NextRequest, context: ItemRouteContext) {
  try {
    await requireLogisticsAccess("pick_lists.update");
    const { itemId } = await context.params;
    const body = await parseBody(request, pickItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pick_item", {
      p_pick_list_item_id: itemId,
      p_picked_quantity: body.pickedQuantity,
      p_lot_id: body.lotId ?? null,
      p_serial_numbers: body.serialNumbers ?? null,
      p_divergence_type: body.divergenceType ?? null,
      p_divergence_notes: body.divergenceNotes ?? null,
      p_mark_short: body.markShort ?? false,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------- shipments
async function fetchShipmentWithDetails(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("shipments").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("shipment_items").select("*").eq("shipment_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  const { data: packages, error: packagesError } = await admin.from("shipment_packages").select("*").eq("shipment_id", id).order("package_number");
  if (packagesError) throw translatePostgresError(packagesError);
  return { ...header, items: items ?? [], packages: packages ?? [] };
}

export async function listShipments(request: NextRequest) {
  try {
    const { companyId } = await requireLogisticsAccess("shipments.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const salesOrderId = searchParams.get("salesOrderId");
    let query = createAdminClient().from("shipments").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (salesOrderId) query = query.eq("sales_order_id", salesOrderId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getShipment(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireLogisticsAccess("shipments.view");
    const { id } = await context.params;
    const data = await fetchShipmentWithDetails(companyId, id);
    if (!data) throw notFoundError("Expedição");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createShipment(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("shipments.create");
    const { id: salesOrderId } = await context.params;
    const body = await parseBody(request, createShipmentSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_shipment", {
      p_company_id: ctx.companyId,
      p_sales_order_id: salesOrderId,
      p_warehouse_id: body.warehouseId,
      p_items: body.items.map((item) => ({
        sales_order_item_id: item.salesOrderItemId,
        location_id: item.locationId,
        quantity: item.quantity,
        unit: item.unit ?? null,
        lot_id: item.lotId ?? null,
        serial_numbers: item.serialNumbers ?? null,
        weight: item.weight ?? null,
        notes: item.notes ?? null,
      })),
      p_pick_list_id: body.pickListId ?? null,
      p_expected_ship_date: body.expectedShipDate ?? null,
      p_delivery_zip_code: body.deliveryZipCode ?? null,
      p_delivery_state: body.deliveryState ?? null,
      p_delivery_city: body.deliveryCity ?? null,
      p_delivery_neighborhood: body.deliveryNeighborhood ?? null,
      p_delivery_address: body.deliveryAddress ?? null,
      p_delivery_address_number: body.deliveryAddressNumber ?? null,
      p_delivery_address_complement: body.deliveryAddressComplement ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function assignShipmentTransport(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("shipments.update");
    const { id } = await context.params;
    const body = await parseBody(request, assignShipmentTransportSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_assign_shipment_transport", {
      p_shipment_id: id,
      p_carrier_id: body.carrierId ?? null,
      p_driver_id: body.driverId ?? null,
      p_vehicle_id: body.vehicleId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addShipmentPackage(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("shipments.create");
    const { id } = await context.params;
    const body = await parseBody(request, addShipmentPackageSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_shipment_package", {
      p_shipment_id: id,
      p_package_number: body.packageNumber,
      p_weight: body.weight ?? null,
      p_height: body.height ?? null,
      p_width: body.width ?? null,
      p_length: body.length ?? null,
      p_tracking_code: body.trackingCode ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function shipmentAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_shipment_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const markShipmentReady = (request: NextRequest, context: RouteContext) =>
  shipmentAction("fn_mark_shipment_ready", "shipments.update", request, context);
export const packShipment = (request: NextRequest, context: RouteContext) =>
  shipmentAction("fn_pack_shipment", "shipments.update", request, context);
export const approveShipment = (request: NextRequest, context: RouteContext) =>
  shipmentAction("fn_approve_shipment", "shipments.approve", request, context);
export const cancelShipment = (request: NextRequest, context: RouteContext) =>
  shipmentAction("fn_cancel_shipment", "shipments.cancel", request, context);
export const completeShipment = (request: NextRequest, context: RouteContext) =>
  shipmentAction("fn_complete_shipment", "shipments.update", request, context);

export async function shipShipment(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("shipments.ship");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = shipActionSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_ship_shipment", {
      p_shipment_id: id,
      p_idempotency_key: parsed.success ? parsed.data.idempotencyKey ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- delivery-events
export async function listDeliveryEvents(request: NextRequest) {
  try {
    const { companyId } = await requireLogisticsAccess("deliveries.view");
    const { searchParams } = new URL(request.url);
    const shipmentId = searchParams.get("shipmentId");
    let query = createAdminClient().from("delivery_events").select("*").eq("company_id", companyId);
    if (shipmentId) query = query.eq("shipment_id", shipmentId);
    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createDeliveryEvent(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("deliveries.create");
    const { id: shipmentId } = await context.params;
    const body = await parseBody(request, createDeliveryEventSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_delivery_event", {
      p_shipment_id: shipmentId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function confirmDelivery(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("deliveries.confirm");
    const { id: shipmentId } = await context.params;
    const body = await parseBody(request, confirmDeliverySchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_confirm_delivery", {
      p_shipment_id: shipmentId,
      p_recipient_name: body.recipientName ?? null,
      p_recipient_document: body.recipientDocument ?? null,
      p_notes: body.notes ?? null,
      p_latitude: body.latitude ?? null,
      p_longitude: body.longitude ?? null,
      p_pod_type: body.podType ?? null,
      p_pod_reference: body.podReference ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function failDelivery(request: NextRequest, context: RouteContext) {
  try {
    await requireLogisticsAccess("deliveries.fail");
    const { id: shipmentId } = await context.params;
    const body = await parseBody(request, failDeliverySchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_fail_delivery", {
      p_shipment_id: shipmentId,
      p_status: body.status,
      p_notes: body.notes ?? null,
      p_latitude: body.latitude ?? null,
      p_longitude: body.longitude ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
