import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError, ApiError } from "@/lib/database/errors";
import { jsonError } from "./response";
import { reprocessProductCostSchema, setProductStandardCostSchema, updateProductStandardCostNotesSchema } from "@/lib/validations/costs";

// Handlers do domínio de Custos e Formação de Custo (supabase/migrations/
// 0043-0044). O cálculo/aplicação de custo em si acontece dentro das
// funções de negócio de outros módulos (fn_confirm_purchase_receipt,
// fn_ship_shipment, fn_consume_production_material etc., via
// fn_register_cost_movement) — nenhuma rota aqui "calcula" custo
// diretamente. As únicas operações de custo iniciadas pelo usuário são
// consulta, reprocessamento e custo padrão.

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
  if (message.includes("não pode") || message.includes("informe")) return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  return translatePostgresError(error);
}

// ----------------------------------------------------------------- cost-methods
const COST_METHODS = [
  { code: "MOVING_AVERAGE", name: "Custo médio móvel", status: "implemented" as const },
  { code: "FIFO", name: "FIFO (PEPS)", status: "prepared" as const },
  { code: "STANDARD", name: "Custo padrão", status: "prepared" as const },
];

export async function listCostMethods() {
  try {
    await requireAccess("costs.view");
    return NextResponse.json({ success: true, data: COST_METHODS });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------- cost-movements
export async function listCostMovements(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("costs.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    const sourceType = searchParams.get("sourceType");
    let query = createAdminClient().from("cost_movements").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (locationId) query = query.eq("location_id", locationId);
    if (sourceType) query = query.eq("source_type", sourceType);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------------- product-costs
export async function listProductCostBalances(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("costs.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    let query = createAdminClient().from("product_cost_balances").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (locationId) query = query.eq("location_id", locationId);
    const { data, error } = await query.order("updated_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function reprocessProductCost(request: NextRequest) {
  try {
    await requireAccess("costs.reprocess");
    const body = await parseBody(request, reprocessProductCostSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reprocess_product_cost", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_location_id: body.locationId,
      p_lot_id: body.lotId ?? null,
      p_reason: body.reason,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- inventory-valuation
export async function listInventoryValuation(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("inventory.valuation.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const locationId = searchParams.get("locationId");
    let query = createAdminClient().from("inventory_valuation").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (locationId) query = query.eq("location_id", locationId);
    const { data, error } = await query.order("product_id");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- standard-costs
export async function listStandardCosts(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("standard_costs.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const status = searchParams.get("status");
    let query = createAdminClient().from("product_standard_costs").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getStandardCost(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { companyId } = await requireAccess("standard_costs.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("product_standard_costs").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Custo padrão");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setStandardCost(request: NextRequest) {
  try {
    await requireAccess("standard_costs.create");
    const body = await parseBody(request, setProductStandardCostSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_product_standard_cost", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_cost: body.cost,
      p_valid_from: body.validFrom || null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateStandardCostNotes(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAccess("standard_costs.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateProductStandardCostNotesSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_product_standard_cost_notes", {
      p_standard_cost_id: id,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
