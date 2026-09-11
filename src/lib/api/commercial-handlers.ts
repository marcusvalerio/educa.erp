import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  createPaymentTermSchema,
  updatePaymentTermSchema,
  createSalesQuoteSchema,
  rejectSalesQuoteSchema,
  createSalesOrderSchema,
  reserveSalesOrderStockSchema,
} from "@/lib/validations/commercial";

// Handlers do domínio Comercial (supabase/migrations/0019-0021) para as
// entidades com workflow/validação atômica própria — payment_terms
// (soma de parcelas = 100%), sales_quotes e sales_orders (documentos
// transacionais). sales_representatives/price_lists/price_list_items
// são CRUD simples e usam o repositório genérico
// (src/lib/api/handlers.ts), não este arquivo.
//
// Mesma arquitetura de src/lib/api/{inventory,purchasing}-handlers.ts:
// leitura via cliente admin (depois de checar permissão na API),
// escrita SEMPRE via função RPC chamada com o cliente de sessão do
// usuário — as funções fn_* fazem sua própria checagem de
// has_permission() via auth.uid(), que só resolve com uma sessão real.
//
// Reserva de estoque de um pedido de venda NÃO tem lógica própria
// aqui — fn_reserve_sales_order_stock (chamada via RPC como qualquer
// outra) é quem decide tudo, reutilizando fn_create_reservation/
// fn_release_reservation (stock_reservations, 0011) e
// stock_balances.available (0009). Esta camada só valida o corpo da
// requisição e repassa.

type Access = { companyId: string };

async function requireCommercialAccess(permissionCode: string): Promise<Access> {
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
  if (message.includes("soma dos percentuais")) return new ApiError("VALIDATION_ERROR", error.message ?? "", 422);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("só é possível") || message.includes("não pode ser") || message.includes("já aprovado")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------ payment-terms
async function fetchPaymentTermWithInstallments(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("payment_terms").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: installments, error: installmentsError } = await admin
    .from("payment_term_installments")
    .select("*")
    .eq("payment_term_id", id)
    .order("installment_number", { ascending: true });
  if (installmentsError) throw translatePostgresError(installmentsError);
  return { ...header, installments: installments ?? [] };
}

export async function listPaymentTerms(request: NextRequest) {
  try {
    const { companyId } = await requireCommercialAccess("payment_terms.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("payment_terms").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status === "Ativo" ? "active" : "inactive");
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getPaymentTerm(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireCommercialAccess("payment_terms.view");
    const { id } = await context.params;
    const data = await fetchPaymentTermWithInstallments(companyId, id);
    if (!data) throw notFoundError("Condição de pagamento");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createPaymentTerm(request: NextRequest) {
  try {
    await requireCommercialAccess("payment_terms.create");
    const body = await parseBody(request, createPaymentTermSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_payment_term", {
      p_company_id: ctx.companyId,
      p_code: body.code ?? null,
      p_name: body.name,
      p_installments: body.installments.map((i) => ({ days_after: i.daysAfter, percentage: i.percentage })),
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updatePaymentTerm(request: NextRequest, context: RouteContext) {
  try {
    await requireCommercialAccess("payment_terms.update");
    const { id } = await context.params;
    const body = await parseBody(request, updatePaymentTermSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_payment_term", {
      p_payment_term_id: id,
      p_name: body.name ?? null,
      p_installments: body.installments ? body.installments.map((i) => ({ days_after: i.daysAfter, percentage: i.percentage })) : null,
      p_notes: body.notes ?? null,
      p_status: body.status === "Ativo" ? "active" : body.status === "Inativo" ? "inactive" : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ sales-quotes
async function fetchSalesQuoteWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("sales_quotes").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("sales_quote_items").select("*").eq("quote_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listSalesQuotes(request: NextRequest) {
  try {
    const { companyId } = await requireCommercialAccess("sales_quotes.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    let query = createAdminClient().from("sales_quotes").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getSalesQuote(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireCommercialAccess("sales_quotes.view");
    const { id } = await context.params;
    const data = await fetchSalesQuoteWithItems(companyId, id);
    if (!data) throw notFoundError("Orçamento");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createSalesQuote(request: NextRequest) {
  try {
    await requireCommercialAccess("sales_quotes.create");
    const body = await parseBody(request, createSalesQuoteSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_sales_quote", {
      p_company_id: ctx.companyId,
      p_customer_id: body.customerId,
      p_items: body.items.map((item) => ({
        product_id: item.productId ?? null,
        description: item.description,
        unit: item.unit ?? null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount: item.discount ?? 0,
        notes: item.notes ?? null,
      })),
      p_sales_representative_id: body.salesRepresentativeId ?? null,
      p_price_list_id: body.priceListId ?? null,
      p_payment_terms_id: body.paymentTermsId ?? null,
      p_valid_until: body.validUntil ?? null,
      p_discount: body.discount ?? 0,
      p_freight_cost: body.freightCost ?? 0,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

async function quoteAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requireCommercialAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_quote_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const sendSalesQuote = (request: NextRequest, context: RouteContext) =>
  quoteAction("fn_send_sales_quote", "sales_quotes.update", request, context);
export const approveSalesQuote = (request: NextRequest, context: RouteContext) =>
  quoteAction("fn_approve_sales_quote", "sales_quotes.approve", request, context);
export const expireSalesQuote = (request: NextRequest, context: RouteContext) =>
  quoteAction("fn_expire_sales_quote", "sales_quotes.update", request, context);
export const cancelSalesQuote = (request: NextRequest, context: RouteContext) =>
  quoteAction("fn_cancel_sales_quote", "sales_quotes.cancel", request, context);

export async function rejectSalesQuote(request: NextRequest, context: RouteContext) {
  try {
    await requireCommercialAccess("sales_quotes.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = rejectSalesQuoteSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reject_sales_quote", {
      p_quote_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ sales-orders
async function fetchSalesOrderWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("sales_orders").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("sales_order_items").select("*").eq("order_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listSalesOrders(request: NextRequest) {
  try {
    const { companyId } = await requireCommercialAccess("sales_orders.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    let query = createAdminClient().from("sales_orders").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getSalesOrder(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireCommercialAccess("sales_orders.view");
    const { id } = await context.params;
    const data = await fetchSalesOrderWithItems(companyId, id);
    if (!data) throw notFoundError("Pedido de venda");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createSalesOrder(request: NextRequest) {
  try {
    await requireCommercialAccess("sales_orders.create");
    const body = await parseBody(request, createSalesOrderSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_sales_order", {
      p_company_id: ctx.companyId,
      p_customer_id: body.customerId,
      p_items: body.items
        ? body.items.map((item) => ({
            product_id: item.productId ?? null,
            description: item.description,
            unit: item.unit ?? null,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            discount: item.discount ?? 0,
            notes: item.notes ?? null,
          }))
        : null,
      p_sales_quote_id: body.salesQuoteId ?? null,
      p_sales_representative_id: body.salesRepresentativeId ?? null,
      p_price_list_id: body.priceListId ?? null,
      p_payment_terms_id: body.paymentTermsId ?? null,
      p_discount: body.discount ?? 0,
      p_freight_cost: body.freightCost ?? 0,
      p_expected_delivery_at: body.expectedDeliveryAt ?? null,
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

async function orderAction(rpcName: string, permission: string, request: NextRequest, context: RouteContext) {
  try {
    await requireCommercialAccess(permission);
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(rpcName, { p_order_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export const submitSalesOrderForApproval = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_submit_sales_order_for_approval", "sales_orders.update", request, context);
export const approveSalesOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_approve_sales_order", "sales_orders.approve", request, context);
export const releaseSalesOrderReservation = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_release_sales_order_reservation", "sales_orders.update", request, context);
export const cancelSalesOrder = (request: NextRequest, context: RouteContext) =>
  orderAction("fn_cancel_sales_order", "sales_orders.cancel", request, context);

export async function reserveSalesOrderStock(request: NextRequest, context: RouteContext) {
  try {
    await requireCommercialAccess("sales_orders.reserve");
    const { id } = await context.params;
    const body = await parseBody(request, reserveSalesOrderStockSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reserve_sales_order_stock", {
      p_order_id: id,
      p_location_id: body.locationId,
      p_idempotency_key: null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
