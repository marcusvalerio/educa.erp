import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";

// Atalhos do atendimento do pedido (separar e expedir) para a tela: montam
// os parâmetros a partir da reserva/separação já gravadas e chamam as
// mesmas funções do banco (fn_create_pick_list, fn_start_picking,
// fn_pick_item, fn_complete_pick_list, fn_create_shipment) com a sessão do
// usuário — permissão e transições continuam no banco. Leituras sempre
// filtradas pela empresa da sessão.

type RouteContext = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

async function access(...codes: string[]): Promise<{ companyId: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  for (const code of codes) if (!(await hasPermission(ctx.companyId, code))) throw forbiddenError(code);
  return { companyId: ctx.companyId };
}

function rpcFailure(error: { message?: string; code?: string }): ApiError {
  const message = error.message ?? "";
  if (/permissão negada/i.test(message)) return new ApiError("FORBIDDEN", message, 403);
  if (error.code === "P0001" || error.code === "P0002" || error.code === "22023") return new ApiError("BUSINESS_RULE", message, 422);
  return translatePostgresError(error);
}

async function rows(table: string, companyId: string, column: string, values: unknown[]): Promise<Row[]> {
  if (values.length === 0) return [];
  const { data, error } = await createAdminClient().from(table).select("*").eq("company_id", companyId).in(column, values.map(String));
  if (error) throw translatePostgresError(error);
  return (data as Row[]) ?? [];
}

/** Reservas ativas do pedido com o depósito de cada local. */
async function activeReservations(companyId: string, orderId: string) {
  const { data, error } = await createAdminClient()
    .from("stock_reservations")
    .select("id, location_id")
    .eq("company_id", companyId)
    .eq("reference_type", "sales_order")
    .eq("reference_id", orderId)
    .eq("status", "active");
  if (error) throw translatePostgresError(error);
  const reservations = (data as Row[]) ?? [];
  const locations = await rows("warehouse_locations", companyId, "id", [...new Set(reservations.map((r) => r.location_id))]);
  const warehouseOf = new Map(locations.map((l) => [String(l.id), String(l.warehouse_id)]));
  return reservations.map((r) => ({ id: String(r.id), locationId: String(r.location_id), warehouseId: warehouseOf.get(String(r.location_id)) ?? "" }));
}

// POST /api/sales-orders/:id/pick-auto — separação a partir da reserva.
export async function createPickListFromOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await access("pick_lists.create");
    const { id } = await context.params;
    const reservations = await activeReservations(companyId, id);
    const warehouseId = reservations.find((r) => r.warehouseId)?.warehouseId;
    if (!warehouseId) throw validationError("Este pedido não tem estoque reservado. Reserve o estoque antes de separar.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_pick_list", { p_company_id: companyId, p_sales_order_id: id, p_warehouse_id: warehouseId, p_notes: null });
    if (error) throw rpcFailure(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/pick-lists/:id/pick-all — inicia, separa tudo o que foi pedido e conclui.
export async function pickAllAndComplete(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await access("pick_lists.update", "pick_lists.complete");
    const { id } = await context.params;
    const [pickList] = await rows("pick_lists", companyId, "id", [id]);
    if (!pickList) throw notFoundError("Separação");
    const supabase = await createClient();
    if (pickList.status === "pending") {
      const { error } = await supabase.rpc("fn_start_picking", { p_pick_list_id: id });
      if (error) throw rpcFailure(error);
    } else if (pickList.status !== "in_progress") {
      throw validationError(`Esta separação está "${String(pickList.status)}" e não pode ser separada.`);
    }
    for (const item of await rows("pick_list_items", companyId, "pick_list_id", [id])) {
      if (item.status === "picked") continue;
      const { error } = await supabase.rpc("fn_pick_item", {
        p_pick_list_item_id: item.id,
        p_picked_quantity: Number(item.requested_quantity),
        p_lot_id: null,
        p_serial_numbers: null,
        p_divergence_type: null,
        p_divergence_notes: null,
        p_mark_short: false,
      });
      if (error) throw rpcFailure(error);
    }
    const { data, error } = await supabase.rpc("fn_complete_pick_list", { p_pick_list_id: id });
    if (error) throw rpcFailure(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/sales-orders/:id/ship-auto — expedição com o que foi separado (ou reservado).
export async function createShipmentFromOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await access("shipments.create");
    const { id } = await context.params;
    const orderItems = await rows("sales_order_items", companyId, "order_id", [id]);
    if (orderItems.length === 0) throw notFoundError("Pedido de venda");
    const remaining = new Map(orderItems.map((i) => [String(i.id), Number(i.reserved_quantity ?? 0) - Number(i.shipped_quantity ?? 0)]));

    // Preferência: separação concluída (o que foi separado, onde foi separado).
    const { data: picks } = await createAdminClient()
      .from("pick_lists")
      .select("id, warehouse_id, status, completed_at")
      .eq("company_id", companyId)
      .eq("sales_order_id", id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1);
    const pick = ((picks as Row[]) ?? [])[0];
    let warehouseId = pick ? String(pick.warehouse_id) : "";
    const items: Row[] = [];
    if (pick) {
      for (const p of await rows("pick_list_items", companyId, "pick_list_id", [pick.id])) {
        const left = remaining.get(String(p.sales_order_item_id)) ?? 0;
        const qty = Math.min(Number(p.picked_quantity ?? 0), left);
        if (qty > 0) {
          items.push({ sales_order_item_id: p.sales_order_item_id, location_id: p.location_id, quantity: qty, lot_id: p.lot_id ?? null, ...(Array.isArray(p.serial_numbers) && p.serial_numbers.length ? { serial_numbers: p.serial_numbers } : {}) });
          remaining.set(String(p.sales_order_item_id), left - qty);
        }
      }
    } else {
      // Sem separação: usa as reservas ativas.
      const reservations = await activeReservations(companyId, id);
      warehouseId = reservations.find((r) => r.warehouseId)?.warehouseId ?? "";
      const resItems = await rows("stock_reservation_items", companyId, "reservation_id", reservations.map((r) => r.id));
      const locationOf = new Map(reservations.map((r) => [r.id, r.locationId]));
      for (const r of resItems) {
        const orderItem = orderItems.find((i) => String(i.product_id) === String(r.product_id) && (remaining.get(String(i.id)) ?? 0) > 0);
        if (!orderItem) continue;
        const left = remaining.get(String(orderItem.id)) ?? 0;
        const qty = Math.min(Number(r.quantity ?? 0), left);
        if (qty > 0) {
          items.push({ sales_order_item_id: orderItem.id, location_id: locationOf.get(String(r.reservation_id)), quantity: qty, lot_id: r.lot_id ?? null });
          remaining.set(String(orderItem.id), left - qty);
        }
      }
    }
    if (items.length === 0 || !warehouseId) throw validationError("Nada a expedir: o pedido precisa de estoque reservado (e, de preferência, separado).");

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_shipment", {
      p_company_id: companyId,
      p_sales_order_id: id,
      p_warehouse_id: warehouseId,
      p_items: items,
      p_pick_list_id: pick ? pick.id : null,
      p_expected_ship_date: null,
      p_delivery_zip_code: null,
      p_delivery_state: null,
      p_delivery_city: null,
      p_delivery_neighborhood: null,
      p_delivery_address: null,
      p_delivery_address_number: null,
      p_delivery_address_complement: null,
      p_notes: null,
    });
    if (error) throw rpcFailure(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
