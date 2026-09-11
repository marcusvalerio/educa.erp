import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  receiveStockSchema,
  issueStockSchema,
  createTransferSchema,
  idempotencyActionSchema,
  createReservationSchema,
  createAdjustmentSchema,
  startCountSchema,
  submitCountItemSchema,
  productSerialNumberSchema,
  createMaterialRequestSchema,
} from "@/lib/validations/inventory";

// Handlers do domínio transacional de Estoque/WMS (supabase/migrations/
// 0008-0012). Diferente dos 8+2 cadastros (src/lib/api/handlers.ts), NÃO
// usa o repositório genérico — toda escrita aqui é uma chamada RPC a uma
// função SECURITY DEFINER no Postgres (fn_receive_stock, fn_ship_transfer
// etc.), nunca um insert/update direto de tabela.
//
// Por quê a leitura usa o cliente admin (service_role) mas a escrita usa
// o cliente de sessão (createClient(), cookies do usuário autenticado):
// as funções fn_* fazem sua PRÓPRIA checagem de permissão internamente
// via public.has_permission(company_id, code), que lê auth.uid() — isso
// só resolve corretamente quando a chamada carrega o JWT real do
// usuário. É a mesma função que hasPermission() usa em
// src/lib/auth/context.ts. O cliente admin não tem auth.uid() (não é
// uma sessão de usuário), então nunca deve ser usado para chamar essas
// funções — apenas para leitura, depois que requireStockAccess() já
// validou a permissão na camada de API.

type StockAccess = { companyId: string; appUserId: string };

async function requireStockAccess(permissionCode: string): Promise<StockAccess> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  const allowed = await hasPermission(ctx.companyId, permissionCode);
  if (!allowed) throw forbiddenError(permissionCode);
  return { companyId: ctx.companyId, appUserId: ctx.appUserId };
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
  const message = error.message ?? "";
  if (message.toLowerCase().includes("permissão negada")) {
    return new ApiError("FORBIDDEN", message, 403);
  }
  if (message.toLowerCase().includes("saldo insuficiente") || message.toLowerCase().includes("excede")) {
    return new ApiError("INSUFFICIENT_STOCK", message, 409);
  }
  if (message.toLowerCase().includes("não encontrad")) {
    return new ApiError("NOT_FOUND", message, 404);
  }
  if (message.toLowerCase().includes("só é possível") || message.toLowerCase().includes("bloqueada")) {
    return new ApiError("INVALID_STATUS_TRANSITION", message, 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };
type ItemRouteContext = { params: Promise<{ id: string; itemId: string }> };

// ------------------------------------------------------------ stock-balances
export async function listStockBalances(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");

    let query = createAdminClient().from("stock_balances").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (locationId) query = query.eq("location_id", locationId);

    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- stock-movements
export async function listStockMovements(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    const referenceType = searchParams.get("referenceType");
    const referenceId = searchParams.get("referenceId");

    let query = createAdminClient().from("stock_movements").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (locationId) query = query.eq("location_id", locationId);
    if (referenceType) query = query.eq("reference_type", referenceType);
    if (referenceId) query = query.eq("reference_id", referenceId);

    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function receiveStock(request: NextRequest) {
  try {
    await requireStockAccess("stock.create");
    const body = await parseBody(request, receiveStockSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_receive_stock", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_location_id: body.locationId,
      p_quantity: body.quantity,
      p_lot_id: body.lotId ?? null,
      p_unit_cost: body.unitCost ?? null,
      p_notes: body.notes ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function issueStock(request: NextRequest) {
  try {
    await requireStockAccess("stock.adjust");
    const body = await parseBody(request, issueStockSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_issue_stock", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_location_id: body.locationId,
      p_quantity: body.quantity,
      p_lot_id: body.lotId ?? null,
      p_notes: body.notes ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- stock-transfers
async function fetchTransferWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin
    .from("stock_transfers")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;

  const { data: items, error: itemsError } = await admin
    .from("stock_transfer_items")
    .select("*")
    .eq("transfer_id", id);
  if (itemsError) throw translatePostgresError(itemsError);

  return { ...header, items: items ?? [] };
}

export async function listStockTransfers(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = createAdminClient().from("stock_transfers").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getStockTransfer(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { id } = await context.params;
    const transfer = await fetchTransferWithItems(companyId, id);
    if (!transfer) throw notFoundError("Transferência");
    return NextResponse.json({ success: true, data: transfer });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createTransfer(request: NextRequest) {
  try {
    await requireStockAccess("stock.create");
    const body = await parseBody(request, createTransferSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_transfer", {
      p_company_id: ctx.companyId,
      p_from_location_id: body.fromLocationId,
      p_to_location_id: body.toLocationId,
      p_items: body.items.map((item) => ({ product_id: item.productId, lot_id: item.lotId ?? null, quantity: item.quantity })),
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function transferAction(rpcName: "fn_ship_transfer" | "fn_receive_transfer" | "fn_cancel_transfer", request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.transfer");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = idempotencyActionSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const args: Record<string, unknown> = { p_transfer_id: id };
    if (rpcName !== "fn_cancel_transfer") {
      args.p_idempotency_key = parsed.success ? parsed.data.idempotencyKey ?? null : null;
    }
    const { data, error } = await supabase.rpc(rpcName, args);
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const shipTransfer = (request: NextRequest, context: RouteContext) => transferAction("fn_ship_transfer", request, context);
export const receiveTransfer = (request: NextRequest, context: RouteContext) => transferAction("fn_receive_transfer", request, context);
export const cancelTransfer = (request: NextRequest, context: RouteContext) => transferAction("fn_cancel_transfer", request, context);

// -------------------------------------------------------- stock-reservations
async function fetchReservationWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin
    .from("stock_reservations")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;

  const { data: items, error: itemsError } = await admin
    .from("stock_reservation_items")
    .select("*")
    .eq("reservation_id", id);
  if (itemsError) throw translatePostgresError(itemsError);

  return { ...header, items: items ?? [] };
}

export async function listStockReservations(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = createAdminClient().from("stock_reservations").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getStockReservation(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { id } = await context.params;
    const reservation = await fetchReservationWithItems(companyId, id);
    if (!reservation) throw notFoundError("Reserva");
    return NextResponse.json({ success: true, data: reservation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createReservation(request: NextRequest) {
  try {
    await requireStockAccess("stock.create");
    const body = await parseBody(request, createReservationSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_reservation", {
      p_company_id: ctx.companyId,
      p_location_id: body.locationId,
      p_items: body.items.map((item) => ({ product_id: item.productId, lot_id: item.lotId ?? null, quantity: item.quantity })),
      p_notes: body.notes ?? null,
      p_reference_type: body.referenceType ?? null,
      p_reference_id: body.referenceId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function reservationAction(rpcName: "fn_release_reservation" | "fn_consume_reservation", request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_reservation_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const releaseReservation = (request: NextRequest, context: RouteContext) => reservationAction("fn_release_reservation", request, context);
export const consumeReservation = (request: NextRequest, context: RouteContext) => reservationAction("fn_consume_reservation", request, context);

// --------------------------------------------------------- stock-adjustments
async function fetchAdjustmentWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin
    .from("stock_adjustments")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;

  const { data: items, error: itemsError } = await admin
    .from("stock_adjustment_items")
    .select("*")
    .eq("adjustment_id", id);
  if (itemsError) throw translatePostgresError(itemsError);

  return { ...header, items: items ?? [] };
}

export async function listStockAdjustments(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = createAdminClient().from("stock_adjustments").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getStockAdjustment(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { id } = await context.params;
    const adjustment = await fetchAdjustmentWithItems(companyId, id);
    if (!adjustment) throw notFoundError("Ajuste");
    return NextResponse.json({ success: true, data: adjustment });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAdjustment(request: NextRequest) {
  try {
    await requireStockAccess("stock.adjust");
    const body = await parseBody(request, createAdjustmentSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_adjustment", {
      p_company_id: ctx.companyId,
      p_location_id: body.locationId,
      p_reason_code: body.reasonCode,
      p_items: body.items.map((item) => ({
        product_id: item.productId,
        lot_id: item.lotId ?? null,
        quantity_delta: item.quantityDelta,
        unit_cost: item.unitCost ?? null,
      })),
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function postAdjustment(request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = idempotencyActionSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_post_adjustment", {
      p_adjustment_id: id,
      p_idempotency_key: parsed.success ? parsed.data.idempotencyKey ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelAdjustment(_request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.adjust");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_adjustment", { p_adjustment_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- stock-counts
async function fetchCountWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin
    .from("stock_counts")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;

  const { data: items, error: itemsError } = await admin
    .from("stock_count_items")
    .select("*")
    .eq("count_id", id);
  if (itemsError) throw translatePostgresError(itemsError);

  return { ...header, items: items ?? [] };
}

export async function listStockCounts(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = createAdminClient().from("stock_counts").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getStockCount(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { id } = await context.params;
    const count = await fetchCountWithItems(companyId, id);
    if (!count) throw notFoundError("Contagem");
    return NextResponse.json({ success: true, data: count });
  } catch (error) {
    return jsonError(error);
  }
}

export async function startCount(request: NextRequest) {
  try {
    await requireStockAccess("stock.count");
    const body = await parseBody(request, startCountSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_start_count", {
      p_company_id: ctx.companyId,
      p_warehouse_id: body.warehouseId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function submitCountItem(request: NextRequest, context: ItemRouteContext) {
  try {
    await requireStockAccess("stock.count");
    const { itemId } = await context.params;
    const body = await parseBody(request, submitCountItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_submit_count_item", {
      p_count_item_id: itemId,
      p_counted_quantity: body.countedQuantity,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function closeCount(_request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.approve");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_close_count", { p_count_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelCount(_request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.count");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_count", { p_count_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------- material-requests
// Almoxarifado Operacional -> Produção (ou local -> local, genérico).
// NÃO é um mecanismo novo de saldo: fn_deliver_material_request chama a
// mesma fn_post_stock_movement de tudo o mais neste arquivo, só com
// movement_type = PRODUCTION_OUT. Ver docs/INVENTORY.md.
async function fetchMaterialRequestWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin
    .from("material_requests")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;

  const { data: items, error: itemsError } = await admin
    .from("material_request_items")
    .select("*")
    .eq("request_id", id);
  if (itemsError) throw translatePostgresError(itemsError);

  return { ...header, items: items ?? [] };
}

export async function listMaterialRequests(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    let query = createAdminClient().from("material_requests").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getMaterialRequest(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess("stock.view");
    const { id } = await context.params;
    const materialRequest = await fetchMaterialRequestWithItems(companyId, id);
    if (!materialRequest) throw notFoundError("Requisição de material");
    return NextResponse.json({ success: true, data: materialRequest });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createMaterialRequest(request: NextRequest) {
  try {
    await requireStockAccess("stock.request");
    const body = await parseBody(request, createMaterialRequestSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_material_request", {
      p_company_id: ctx.companyId,
      p_from_location_id: body.fromLocationId,
      p_to_location_id: body.toLocationId,
      p_items: body.items.map((item) => ({ product_id: item.productId, lot_id: item.lotId ?? null, quantity: item.quantity })),
      p_notes: body.notes ?? null,
      p_reference_type: body.referenceType ?? null,
      p_reference_id: body.referenceId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function deliverMaterialRequest(request: NextRequest, context: RouteContext) {
  try {
    // Entregar uma requisição reaproveita stock.transfer (mover material
    // de um local para outro) — nenhuma permissão nova foi criada para
    // esta ação, ver comentário em fn_deliver_material_request.
    await requireStockAccess("stock.transfer");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = idempotencyActionSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_deliver_material_request", {
      p_request_id: id,
      p_idempotency_key: parsed.success ? parsed.data.idempotencyKey ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelMaterialRequest(_request: NextRequest, context: RouteContext) {
  try {
    await requireStockAccess("stock.request");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_material_request", { p_request_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------ product-serial-numbers
// Cadastro simples (CRUD direto via admin client), mas fora do
// repositório genérico porque seu vocabulário de status (ciclo de vida
// do item serializado) não é o "Ativo"/"Inativo" que createTableRepository
// assume — ver comentário em src/lib/validations/inventory.ts.
const SERIAL_MODULE = "product_serial_numbers";

export async function listSerialNumbers(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess(`${SERIAL_MODULE}.read`);
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const status = searchParams.get("status");

    let query = createAdminClient().from("product_serial_numbers").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createSerialNumber(request: NextRequest) {
  try {
    const { companyId } = await requireStockAccess(`${SERIAL_MODULE}.create`);
    const body = await parseBody(request, productSerialNumberSchema);

    const { data, error } = await createAdminClient()
      .from("product_serial_numbers")
      .insert({
        company_id: companyId,
        product_id: body.produtoId,
        serial_number: body.numeroSerie,
        status: body.status,
        current_location_id: body.localAtualId ?? null,
        notes: body.observacoes || null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getSerialNumber(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess(`${SERIAL_MODULE}.read`);
    const { id } = await context.params;
    const { data, error } = await createAdminClient()
      .from("product_serial_numbers")
      .select("*")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Número de série");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateSerialNumber(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess(`${SERIAL_MODULE}.update`);
    const { id } = await context.params;
    const body = await parseBody(request, productSerialNumberSchema.partial());

    const patch: Record<string, unknown> = {};
    if (body.produtoId !== undefined) patch.product_id = body.produtoId;
    if (body.numeroSerie !== undefined) patch.serial_number = body.numeroSerie;
    if (body.status !== undefined) patch.status = body.status;
    if (body.localAtualId !== undefined) patch.current_location_id = body.localAtualId || null;
    if (body.observacoes !== undefined) patch.notes = body.observacoes || null;
    if (Object.keys(patch).length === 0) throw validationError("Nenhum dado para atualizar.");

    const { data, error } = await createAdminClient()
      .from("product_serial_numbers")
      .update(patch)
      .eq("company_id", companyId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Número de série");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function deleteSerialNumber(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireStockAccess(`${SERIAL_MODULE}.delete`);
    const { id } = await context.params;
    const { error, count } = await createAdminClient()
      .from("product_serial_numbers")
      .delete({ count: "exact" })
      .eq("company_id", companyId)
      .eq("id", id);
    if (error) throw translatePostgresError(error);
    if (!count) throw notFoundError("Número de série");
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}
