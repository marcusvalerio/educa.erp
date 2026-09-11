import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  createPurchaseRequestSchema,
  approvePurchaseRequestSchema,
  rejectPurchaseRequestSchema,
  createPurchaseQuoteSchema,
  addQuoteSupplierResponseSchema,
  createPurchaseOrderSchema,
  createPurchaseReceiptSchema,
  updatePurchaseReceiptItemSchema,
  rejectPurchaseReceiptSchema,
} from "@/lib/validations/purchasing";
import { idempotencyActionSchema } from "@/lib/validations/inventory";

// Handlers do domínio de Compras/Suprimentos (supabase/migrations/
// 0014-0018). Mesma arquitetura de src/lib/api/inventory-handlers.ts:
// leitura via cliente admin (depois de checar permissão na API),
// escrita SEMPRE via função RPC chamada com o cliente de sessão do
// usuário (createClient(), cookies reais) — as funções fn_* fazem sua
// própria checagem de has_permission() via auth.uid(), que só resolve
// com uma sessão real. Nenhuma tabela de Compras tem policy de escrita
// para authenticated — só SELECT (RLS) + as funções (ver comentário
// equivalente em inventory-handlers.ts).
//
// Compras não tem estoque próprio: nenhuma linha deste arquivo toca em
// stock_balances/stock_movements — isso só acontece dentro de
// fn_confirm_purchase_receipt (0018), chamada aqui como qualquer outra
// RPC, sem lógica de estoque duplicada nesta camada.

type Access = { companyId: string };

async function requirePurchasingAccess(permissionCode: string): Promise<Access> {
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
  if (message.includes("excede") || message.includes("saldo")) return new ApiError("EXCEEDS_PENDING", error.message ?? "", 409);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("só é possível") || message.includes("não pode mais") || message.includes("já encerrada")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------- purchase-requests
async function fetchRequestWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("purchase_requests").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("purchase_request_items").select("*").eq("request_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listPurchaseRequests(request: NextRequest) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_requests.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("purchase_requests").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPurchaseRequest(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_requests.view");
    const { id } = await context.params;
    const data = await fetchRequestWithItems(companyId, id);
    if (!data) throw notFoundError("Solicitação de compra");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPurchaseRequest(request: NextRequest) {
  try {
    await requirePurchasingAccess("purchase_requests.create");
    const body = await parseBody(request, createPurchaseRequestSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_purchase_request", {
      p_company_id: ctx.companyId,
      p_department: body.department ?? null,
      p_priority: body.priority,
      p_justification: body.justification ?? null,
      p_needed_by: body.neededBy ?? null,
      p_items: body.items.map((item) => ({
        product_id: item.productId ?? null,
        description: item.description,
        unit: item.unit ?? null,
        quantity: item.quantity,
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

async function requestAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext, extraArgs?: Record<string, unknown>) {
  try {
    await requirePurchasingAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_request_id: id, ...(extraArgs ?? {}) });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const submitPurchaseRequest = (request: NextRequest, context: RouteContext) =>
  requestAction("fn_submit_purchase_request", "purchase_requests.update", request, context);

export async function approvePurchaseRequest(request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess("purchase_requests.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = approvePurchaseRequestSchema.safeParse(body ?? {});
    const approvedItems = parsed.success && parsed.data.approvedItems
      ? parsed.data.approvedItems.map((i) => ({ item_id: i.itemId, quantity_approved: i.quantityApproved }))
      : null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_approve_purchase_request", { p_request_id: id, p_approved_items: approvedItems });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function rejectPurchaseRequest(request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess("purchase_requests.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = rejectPurchaseRequestSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reject_purchase_request", {
      p_request_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const cancelPurchaseRequest = (request: NextRequest, context: RouteContext) =>
  requestAction("fn_cancel_purchase_request", "purchase_requests.update", request, context);

// ---------------------------------------------------------- purchase-quotes
async function fetchQuoteWithDetails(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("purchase_quotes").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: suppliers, error: suppliersError } = await admin.from("purchase_quote_suppliers").select("*").eq("quote_id", id);
  if (suppliersError) throw translatePostgresError(suppliersError);
  const supplierIds = (suppliers ?? []).map((s) => s.id as string);
  const { data: items, error: itemsError } = supplierIds.length
    ? await admin.from("purchase_quote_items").select("*").in("quote_supplier_id", supplierIds)
    : { data: [], error: null };
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, suppliers: (suppliers ?? []).map((s) => ({ ...s, items: (items ?? []).filter((i) => i.quote_supplier_id === s.id) })) };
}

export async function listPurchaseQuotes(request: NextRequest) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_quotes.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("purchase_quotes").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPurchaseQuote(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_quotes.view");
    const { id } = await context.params;
    const data = await fetchQuoteWithDetails(companyId, id);
    if (!data) throw notFoundError("Cotação");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPurchaseQuote(request: NextRequest) {
  try {
    await requirePurchasingAccess("purchase_quotes.create");
    const body = await parseBody(request, createPurchaseQuoteSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_purchase_quote", {
      p_company_id: ctx.companyId,
      p_supplier_ids: body.supplierIds,
      p_purchase_request_id: body.purchaseRequestId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addQuoteSupplierResponse(request: NextRequest, context: { params: Promise<{ id: string; supplierId: string }> }) {
  try {
    await requirePurchasingAccess("purchase_quotes.update");
    const { supplierId } = await context.params;
    const body = await parseBody(request, addQuoteSupplierResponseSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_quote_supplier_response", {
      p_quote_supplier_id: supplierId,
      p_payment_terms: body.paymentTerms ?? null,
      p_freight_cost: body.freightCost ?? null,
      p_delivery_days: body.deliveryDays ?? null,
      p_valid_until: body.validUntil ?? null,
      p_items: body.items.map((item) => ({
        product_id: item.productId ?? null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount ?? 0,
        notes: item.notes ?? null,
      })),
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function selectPurchaseQuoteSupplier(_request: NextRequest, context: { params: Promise<{ id: string; supplierId: string }> }) {
  try {
    await requirePurchasingAccess("purchase_quotes.approve");
    const { supplierId } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_select_purchase_quote_supplier", { p_quote_supplier_id: supplierId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelPurchaseQuote(_request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess("purchase_quotes.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_purchase_quote", { p_quote_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- purchase-orders
async function fetchOrderWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("purchase_orders").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("purchase_order_items").select("*").eq("order_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listPurchaseOrders(request: NextRequest) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_orders.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    let query = createAdminClient().from("purchase_orders").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPurchaseOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_orders.view");
    const { id } = await context.params;
    const data = await fetchOrderWithItems(companyId, id);
    if (!data) throw notFoundError("Pedido de compra");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPurchaseOrder(request: NextRequest) {
  try {
    await requirePurchasingAccess("purchase_orders.create");
    const body = await parseBody(request, createPurchaseOrderSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_purchase_order", {
      p_company_id: ctx.companyId,
      p_supplier_id: body.supplierId,
      p_items: body.items.map((item) => ({
        product_id: item.productId ?? null,
        description: item.description,
        unit: item.unit ?? null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount ?? 0,
        notes: item.notes ?? null,
      })),
      p_purchase_request_id: body.purchaseRequestId ?? null,
      p_purchase_quote_id: body.purchaseQuoteId ?? null,
      p_payment_terms: body.paymentTerms ?? null,
      p_freight_cost: body.freightCost ?? 0,
      p_discount: body.discount ?? 0,
      p_expected_delivery_at: body.expectedDeliveryAt ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function orderAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_order_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const submitPurchaseOrderForApproval = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_submit_purchase_order_for_approval", "purchase_orders.update", request, context);
export const approvePurchaseOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_approve_purchase_order", "purchase_orders.approve", request, context);
export const sendPurchaseOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_send_purchase_order", "purchase_orders.update", request, context);
export const cancelPurchaseOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_cancel_purchase_order", "purchase_orders.cancel", request, context);
export const closePurchaseOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_close_purchase_order", "purchase_orders.update", request, context);

// -------------------------------------------------------- purchase-receipts
async function fetchReceiptWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("purchase_receipts").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("purchase_receipt_items").select("*").eq("receipt_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listPurchaseReceipts(request: NextRequest) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_receipts.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const orderId = searchParams.get("purchaseOrderId");
    let query = createAdminClient().from("purchase_receipts").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (orderId) query = query.eq("purchase_order_id", orderId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPurchaseReceipt(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requirePurchasingAccess("purchase_receipts.view");
    const { id } = await context.params;
    const data = await fetchReceiptWithItems(companyId, id);
    if (!data) throw notFoundError("Recebimento");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPurchaseReceipt(request: NextRequest) {
  try {
    await requirePurchasingAccess("purchase_receipts.create");
    const body = await parseBody(request, createPurchaseReceiptSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_purchase_receipt", {
      p_company_id: ctx.companyId,
      p_purchase_order_id: body.purchaseOrderId,
      p_items: body.items.map((item) => ({
        purchase_order_item_id: item.purchaseOrderItemId,
        product_id: item.productId ?? null,
        quantity_received: item.quantityReceived,
        unit: item.unit ?? null,
        destination_location_id: item.destinationLocationId,
        lot_id: item.lotId ?? null,
        lot_number: item.lotNumber ?? null,
        expires_at: item.expiresAt ?? null,
        serial_numbers: item.serialNumbers ?? null,
        accepted_quantity: item.acceptedQuantity ?? null,
        rejected_quantity: item.rejectedQuantity ?? null,
        divergence_type: item.divergenceType ?? null,
        divergence_notes: item.divergenceNotes ?? null,
        notes: item.notes ?? null,
      })),
      p_received_at: body.receivedAt ?? null,
      p_notes: body.notes ?? null,
      p_document_type: body.documentType ?? null,
      p_document_number: body.documentNumber ?? null,
      p_document_series: body.documentSeries ?? null,
      p_access_key: body.accessKey ?? null,
      p_document_issued_at: body.documentIssuedAt ?? null,
      p_document_value: body.documentValue ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePurchaseReceiptItem(request: NextRequest, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    await requirePurchasingAccess("purchase_receipts.update");
    const { itemId } = await context.params;
    const body = await parseBody(request, updatePurchaseReceiptItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_purchase_receipt_item", {
      p_item_id: itemId,
      p_accepted_quantity: body.acceptedQuantity,
      p_rejected_quantity: body.rejectedQuantity,
      p_divergence_type: body.divergenceType ?? null,
      p_divergence_notes: body.divergenceNotes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function confirmPurchaseReceipt(request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess("purchase_receipts.confirm");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = idempotencyActionSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_confirm_purchase_receipt", {
      p_receipt_id: id,
      p_idempotency_key: parsed.success ? parsed.data.idempotencyKey ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function rejectPurchaseReceipt(request: NextRequest, context: RouteContext) {
  try {
    await requirePurchasingAccess("purchase_receipts.reject");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = rejectPurchaseReceiptSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reject_purchase_receipt", {
      p_receipt_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
