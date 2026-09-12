import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  fiscalEstablishmentSchema,
  fiscalNcmSchema,
  fiscalCfopSchema,
  fiscalOperationNatureSchema,
  fiscalCstCodeSchema,
  fiscalCsosnCodeSchema,
  setProductFiscalProfileSchema,
  updateProductFiscalProfileNotesSchema,
  createTaxRuleSchema,
  addTaxRuleItemSchema,
  createFiscalDocumentSchema,
  addFiscalDocumentItemSchema,
  authorizeFiscalDocumentSchema,
  rejectFiscalDocumentSchema,
  cancelFiscalDocumentSchema,
  registerFiscalDocumentEventSchema,
  createFiscalDocumentFromReceiptSchema,
  createFiscalDocumentFromSalesOrderSchema,
  addFiscalDocumentReferenceSchema,
  addFiscalDocumentPackageSchema,
  createFiscalDocumentReturnSchema,
} from "@/lib/validations/fiscal";

// Handlers do domínio Fiscal/Núcleo Tributário (supabase/migrations/
// 0036-0040). Mesma distinção já usada em todos os módulos anteriores:
//   - "cadastro" (fiscal_establishments/fiscal_ncms/fiscal_cfops/
//     fiscal_operation_natures/fiscal_cst_codes/fiscal_csosn_codes):
//     sem função RPC, leitura E escrita via cliente admin após
//     checagem de permissão na API — RLS é defesa em profundidade.
//   - "transacional" (product_fiscal_profiles/tax_rules/
//     fiscal_documents e tudo que deriva deles): escrita exclusiva via
//     função RPC chamada com o cliente de sessão do usuário.
//
// Princípio central (seção 3-4): nenhuma linha deste arquivo duplica
// produtos/clientes/fornecedores/pedidos/recebimentos/estoque/
// financeiro. O Fiscal nunca toca stock_movements/stock_balances nem
// cria accounts_payable/accounts_receivable automaticamente — a
// integração com Financeiro, quando existir, passa pelas próprias
// funções de Financeiro (fn_generate_accounts_payable_from_purchase_receipt
// etc.), nunca duplicadas aqui.

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
  if (message.includes("só é possível") || message.includes("não pode ser") || message.includes("já cancelado") || message.includes("já estornado")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

function cadastroListHandler(table: string, permission: string, extraFilters?: (searchParams: URLSearchParams) => Record<string, string>) {
  return async function list(request: NextRequest) {
    try {
      const { companyId } = await requireAccess(permission);
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status");
      let query = createAdminClient().from(table).select("*").eq("company_id", companyId);
      if (status) query = query.eq("status", status);
      if (extraFilters) {
        const filters = extraFilters(searchParams);
        for (const [column, value] of Object.entries(filters)) {
          if (value) query = query.eq(column, value);
        }
      }
      const { data, error } = await query.order("code");
      if (error) throw translatePostgresError(error);
      return NextResponse.json({ success: true, data: data ?? [] });
    } catch (error) {
      return jsonError(error);
    }
  };
}

function cadastroGetHandler(table: string, permission: string, entityLabel: string) {
  return async function get(_request: NextRequest, context: RouteContext) {
    try {
      const { companyId } = await requireAccess(permission);
      const { id } = await context.params;
      const { data, error } = await createAdminClient().from(table).select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
      if (error) throw translatePostgresError(error);
      if (!data) throw notFoundError(entityLabel);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      return jsonError(error);
    }
  };
}

// -------------------------------------------------------- fiscal_establishments
export const listFiscalEstablishments = cadastroListHandler("fiscal_establishments", "fiscal_establishments.view");
export const getFiscalEstablishment = cadastroGetHandler("fiscal_establishments", "fiscal_establishments.view", "Estabelecimento fiscal");

export async function createFiscalEstablishment(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_establishments.create");
    const body = await parseBody(request, fiscalEstablishmentSchema);
    const { data, error } = await createAdminClient().from("fiscal_establishments").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      cnpj: body.cnpj,
      state_registration: body.stateRegistration ?? null,
      municipal_registration: body.municipalRegistration ?? null,
      tax_regime: body.taxRegime,
      address: body.address ?? null,
      address_number: body.addressNumber ?? null,
      neighborhood: body.neighborhood ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      zip_code: body.zipCode ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalEstablishment(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_establishments.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalEstablishmentSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { stateRegistration, municipalRegistration, addressNumber, zipCode, taxRegime, ...rest } = body;
    const { data, error } = await createAdminClient().from("fiscal_establishments")
      .update({
        ...rest,
        ...(stateRegistration !== undefined ? { state_registration: stateRegistration } : {}),
        ...(municipalRegistration !== undefined ? { municipal_registration: municipalRegistration } : {}),
        ...(addressNumber !== undefined ? { address_number: addressNumber } : {}),
        ...(zipCode !== undefined ? { zip_code: zipCode } : {}),
        ...(taxRegime !== undefined ? { tax_regime: taxRegime } : {}),
      })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Estabelecimento fiscal");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- fiscal_ncms
export const listFiscalNcms = cadastroListHandler("fiscal_ncms", "fiscal_ncms.view");
export const getFiscalNcm = cadastroGetHandler("fiscal_ncms", "fiscal_ncms.view", "NCM");

export async function createFiscalNcm(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_ncms.create");
    const body = await parseBody(request, fiscalNcmSchema);
    const { data, error } = await createAdminClient().from("fiscal_ncms").insert({
      company_id: companyId,
      code: body.code,
      description: body.description,
      valid_from: body.validFrom || undefined,
      valid_until: body.validUntil || null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalNcm(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_ncms.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalNcmSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { validFrom, validUntil, ...rest } = body;
    const { data, error } = await createAdminClient().from("fiscal_ncms")
      .update({ ...rest, ...(validFrom !== undefined ? { valid_from: validFrom } : {}), ...(validUntil !== undefined ? { valid_until: validUntil || null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("NCM");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------- fiscal_cfops
export const listFiscalCfops = cadastroListHandler("fiscal_cfops", "fiscal_cfops.view", (sp) => ({ direction: sp.get("direction") ?? "" }));
export const getFiscalCfop = cadastroGetHandler("fiscal_cfops", "fiscal_cfops.view", "CFOP");

export async function createFiscalCfop(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_cfops.create");
    const body = await parseBody(request, fiscalCfopSchema);
    const { data, error } = await createAdminClient().from("fiscal_cfops").insert({
      company_id: companyId,
      code: body.code,
      description: body.description,
      direction: body.direction,
      scope: body.scope,
      valid_from: body.validFrom || undefined,
      valid_until: body.validUntil || null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalCfop(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_cfops.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalCfopSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { validFrom, validUntil, ...rest } = body;
    const { data, error } = await createAdminClient().from("fiscal_cfops")
      .update({ ...rest, ...(validFrom !== undefined ? { valid_from: validFrom } : {}), ...(validUntil !== undefined ? { valid_until: validUntil || null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("CFOP");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------- fiscal_operation_natures
export const listFiscalOperationNatures = cadastroListHandler("fiscal_operation_natures", "fiscal_operation_natures.view", (sp) => ({ direction: sp.get("direction") ?? "" }));
export const getFiscalOperationNature = cadastroGetHandler("fiscal_operation_natures", "fiscal_operation_natures.view", "Natureza de operação");

export async function createFiscalOperationNature(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_operation_natures.create");
    const body = await parseBody(request, fiscalOperationNatureSchema);
    const { data, error } = await createAdminClient().from("fiscal_operation_natures").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      description: body.description ?? null,
      direction: body.direction,
      default_cfop_id: body.defaultCfopId ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalOperationNature(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_operation_natures.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalOperationNatureSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { defaultCfopId, ...rest } = body;
    const { data, error } = await createAdminClient().from("fiscal_operation_natures")
      .update({ ...rest, ...(defaultCfopId !== undefined ? { default_cfop_id: defaultCfopId ?? null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Natureza de operação");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- fiscal_cst_codes
export const listFiscalCstCodes = cadastroListHandler("fiscal_cst_codes", "fiscal_tax_codes.view", (sp) => ({ tax_type: sp.get("taxType") ?? "" }));
export const getFiscalCstCode = cadastroGetHandler("fiscal_cst_codes", "fiscal_tax_codes.view", "Código CST");

export async function createFiscalCstCode(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_tax_codes.create");
    const body = await parseBody(request, fiscalCstCodeSchema);
    const { data, error } = await createAdminClient().from("fiscal_cst_codes").insert({
      company_id: companyId,
      tax_type: body.taxType,
      code: body.code,
      description: body.description,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalCstCode(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_tax_codes.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalCstCodeSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { taxType, ...rest } = body;
    const { data, error } = await createAdminClient().from("fiscal_cst_codes")
      .update({ ...rest, ...(taxType !== undefined ? { tax_type: taxType } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Código CST");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ fiscal_csosn_codes
export const listFiscalCsosnCodes = cadastroListHandler("fiscal_csosn_codes", "fiscal_tax_codes.view");
export const getFiscalCsosnCode = cadastroGetHandler("fiscal_csosn_codes", "fiscal_tax_codes.view", "Código CSOSN");

export async function createFiscalCsosnCode(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_tax_codes.create");
    const body = await parseBody(request, fiscalCsosnCodeSchema);
    const { data, error } = await createAdminClient().from("fiscal_csosn_codes").insert({
      company_id: companyId,
      code: body.code,
      description: body.description,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFiscalCsosnCode(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_tax_codes.update");
    const { id } = await context.params;
    const body = await parseBody(request, fiscalCsosnCodeSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { data, error } = await createAdminClient().from("fiscal_csosn_codes")
      .update(body).eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Código CSOSN");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- product_fiscal_profiles
export async function listProductFiscalProfiles(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("product_fiscal_profiles.view");
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const status = searchParams.get("status");
    let query = createAdminClient().from("product_fiscal_profiles").select("*").eq("company_id", companyId);
    if (productId) query = query.eq("product_id", productId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getProductFiscalProfile(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("product_fiscal_profiles.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("product_fiscal_profiles").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Perfil fiscal de produto");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setProductFiscalProfile(request: NextRequest) {
  try {
    await requireAccess("product_fiscal_profiles.create");
    const body = await parseBody(request, setProductFiscalProfileSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_product_fiscal_profile", {
      p_company_id: ctx.companyId,
      p_product_id: body.productId,
      p_ncm_id: body.ncmId ?? null,
      p_origin_code: body.originCode ?? "0",
      p_icms_cst: body.icmsCst ?? null,
      p_icms_csosn: body.icmsCsosn ?? null,
      p_pis_cst: body.pisCst ?? null,
      p_cofins_cst: body.cofinsCst ?? null,
      p_ipi_cst: body.ipiCst ?? null,
      p_tax_framework: body.taxFramework ?? null,
      p_valid_from: body.validFrom || null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateProductFiscalProfileNotes(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("product_fiscal_profiles.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateProductFiscalProfileNotesSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_product_fiscal_profile_notes", {
      p_profile_id: id,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------- tax_rules
async function fetchTaxRuleWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("tax_rules").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("tax_rule_items").select("*").eq("tax_rule_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listTaxRules(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("tax_rules.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const productId = searchParams.get("productId");
    let query = createAdminClient().from("tax_rules").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (productId) query = query.eq("product_id", productId);
    const { data, error } = await query.order("priority", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getTaxRule(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("tax_rules.view");
    const { id } = await context.params;
    const data = await fetchTaxRuleWithItems(companyId, id);
    if (!data) throw notFoundError("Regra tributária");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createTaxRule(request: NextRequest) {
  try {
    await requireAccess("tax_rules.create");
    const body = await parseBody(request, createTaxRuleSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_tax_rule", {
      p_company_id: ctx.companyId,
      p_name: body.name,
      p_product_id: body.productId ?? null,
      p_ncm_id: body.ncmId ?? null,
      p_origin_code: body.originCode ?? null,
      p_cfop_id: body.cfopId ?? null,
      p_operation_nature_id: body.operationNatureId ?? null,
      p_origin_uf: body.originUf ?? null,
      p_destination_uf: body.destinationUf ?? null,
      p_tax_regime: body.taxRegime ?? null,
      p_customer_id: body.customerId ?? null,
      p_supplier_id: body.supplierId ?? null,
      p_priority: body.priority ?? 0,
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

export async function addTaxRuleItem(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("tax_rules.update");
    const { id } = await context.params;
    const body = await parseBody(request, addTaxRuleItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_tax_rule_item", {
      p_tax_rule_id: id,
      p_tax_type: body.taxType,
      p_rate: body.rate,
      p_cst: body.cst ?? null,
      p_csosn: body.csosn ?? null,
      p_reduction_percentage: body.reductionPercentage ?? 0,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function removeTaxRuleItem(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("tax_rules.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_remove_tax_rule_item", { p_tax_rule_item_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function approveTaxRule(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("tax_rules.approve");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_approve_tax_rule", { p_tax_rule_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function deactivateTaxRule(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("tax_rules.approve");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_deactivate_tax_rule", { p_tax_rule_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------- fiscal_documents
async function fetchFiscalDocumentWithDetails(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("fiscal_documents").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("fiscal_document_items").select("*").eq("fiscal_document_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  const itemIds = (items ?? []).map((item: { id: string }) => item.id);
  let taxes: unknown[] = [];
  if (itemIds.length > 0) {
    const { data: taxRows, error: taxesError } = await admin.from("fiscal_document_item_taxes").select("*").in("fiscal_document_item_id", itemIds);
    if (taxesError) throw translatePostgresError(taxesError);
    taxes = taxRows ?? [];
  }
  const { data: references, error: referencesError } = await admin.from("fiscal_document_references").select("*").eq("fiscal_document_id", id);
  if (referencesError) throw translatePostgresError(referencesError);
  const { data: packages, error: packagesError } = await admin.from("fiscal_document_packages").select("*").eq("fiscal_document_id", id);
  if (packagesError) throw translatePostgresError(packagesError);
  return { ...header, items: items ?? [], taxes, references: references ?? [], packages: packages ?? [] };
}

export async function listFiscalDocuments(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const fiscalEstablishmentId = searchParams.get("fiscalEstablishmentId");
    let query = createAdminClient().from("fiscal_documents").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (fiscalEstablishmentId) query = query.eq("fiscal_establishment_id", fiscalEstablishmentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getFiscalDocument(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.view");
    const { id } = await context.params;
    const data = await fetchFiscalDocumentWithDetails(companyId, id);
    if (!data) throw notFoundError("Documento fiscal");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createFiscalDocument(request: NextRequest) {
  try {
    await requireAccess("fiscal_documents.create");
    const body = await parseBody(request, createFiscalDocumentSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_fiscal_document", {
      p_company_id: ctx.companyId,
      p_fiscal_establishment_id: body.fiscalEstablishmentId,
      p_type: body.type,
      p_direction: body.direction,
      p_operation_nature_id: body.operationNatureId,
      p_customer_id: body.customerId ?? null,
      p_supplier_id: body.supplierId ?? null,
      p_issue_date: body.issueDate || null,
      p_operation_date: body.operationDate || null,
      p_series: body.series ?? null,
      p_model: body.model ?? null,
      p_number: body.number ?? null,
      p_source_type: null,
      p_source_id: null,
      p_carrier_id: body.carrierId ?? null,
      p_vehicle_id: body.vehicleId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addFiscalDocumentItem(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.create");
    const { id } = await context.params;
    const body = await parseBody(request, addFiscalDocumentItemSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_fiscal_document_item", {
      p_fiscal_document_id: id,
      p_product_id: body.productId,
      p_quantity: body.quantity,
      p_unit_price: body.unitPrice,
      p_ncm_code: body.ncmCode ?? null,
      p_ncm_description: body.ncmDescription ?? null,
      p_cfop_code: body.cfopCode ?? null,
      p_origin_code: body.originCode ?? null,
      p_unit: body.unit ?? null,
      p_discount: body.discount ?? 0,
      p_freight_amount: body.freightAmount ?? 0,
      p_insurance_amount: body.insuranceAmount ?? 0,
      p_other_expenses: body.otherExpenses ?? 0,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function calculateFiscalDocument(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_calculate_fiscal_document", { p_fiscal_document_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function authorizeFiscalDocument(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.update");
    const { id } = await context.params;
    const body = await parseBody(request, authorizeFiscalDocumentSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_authorize_fiscal_document", {
      p_fiscal_document_id: id,
      p_access_key: body.accessKey,
      p_protocol: body.protocol ?? null,
      p_receipt_number: body.receiptNumber ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function rejectFiscalDocument(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.update");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = rejectFiscalDocumentSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reject_fiscal_document", {
      p_fiscal_document_id: id,
      p_return_code: parsed.success ? parsed.data.returnCode ?? null : null,
      p_rejection_reason: parsed.success ? parsed.data.rejectionReason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelFiscalDocument(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.cancel");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelFiscalDocumentSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_fiscal_document", {
      p_fiscal_document_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function markFiscalDocumentReady(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.ready");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_mark_fiscal_document_ready", { p_fiscal_document_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createFiscalDocumentReturn(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.create");
    const { id } = await context.params;
    const body = await parseBody(request, createFiscalDocumentReturnSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_fiscal_document_return", {
      p_original_fiscal_document_id: id,
      p_fiscal_establishment_id: body.fiscalEstablishmentId,
      p_operation_nature_id: body.operationNatureId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------- fiscal_document_references
export async function listFiscalDocumentReferences(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_document_references.view");
    const { searchParams } = new URL(request.url);
    const fiscalDocumentId = searchParams.get("fiscalDocumentId");
    let query = createAdminClient().from("fiscal_document_references").select("*").eq("company_id", companyId);
    if (fiscalDocumentId) query = query.eq("fiscal_document_id", fiscalDocumentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addFiscalDocumentReference(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_document_references.create");
    const { id } = await context.params;
    const body = await parseBody(request, addFiscalDocumentReferenceSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_fiscal_document_reference", {
      p_fiscal_document_id: id,
      p_referenced_document_id: body.referencedDocumentId,
      p_reference_type: body.referenceType,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------- fiscal_document_packages
export async function listFiscalDocumentPackages(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_document_packages.view");
    const { searchParams } = new URL(request.url);
    const fiscalDocumentId = searchParams.get("fiscalDocumentId");
    let query = createAdminClient().from("fiscal_document_packages").select("*").eq("company_id", companyId);
    if (fiscalDocumentId) query = query.eq("fiscal_document_id", fiscalDocumentId);
    const { data, error } = await query.order("package_number");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function addFiscalDocumentPackage(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_document_packages.create");
    const { id } = await context.params;
    const body = await parseBody(request, addFiscalDocumentPackageSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_add_fiscal_document_package", {
      p_fiscal_document_id: id,
      p_package_number: body.packageNumber,
      p_quantity: body.quantity ?? 1,
      p_species: body.species ?? null,
      p_brand_mark: body.brandMark ?? null,
      p_numbering: body.numbering ?? null,
      p_gross_weight: body.grossWeight ?? null,
      p_net_weight: body.netWeight ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- fiscal_document_events
export async function listFiscalDocumentEvents(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_document_events.view");
    const { searchParams } = new URL(request.url);
    const fiscalDocumentId = searchParams.get("fiscalDocumentId");
    let query = createAdminClient().from("fiscal_document_events").select("*").eq("company_id", companyId);
    if (fiscalDocumentId) query = query.eq("fiscal_document_id", fiscalDocumentId);
    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function registerFiscalDocumentEvent(request: NextRequest) {
  try {
    await requireAccess("fiscal_document_events.create");
    const body = await parseBody(request, registerFiscalDocumentEventSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_fiscal_document_event", {
      p_fiscal_document_id: body.fiscalDocumentId,
      p_event_type: body.eventType,
      p_protocol: body.protocol ?? null,
      p_status_code: body.statusCode ?? null,
      p_message: body.message ?? null,
      p_payload_reference: body.payloadReference ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- integrações
export async function createFiscalDocumentFromPurchaseReceipt(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.create");
    const { id } = await context.params;
    const body = await parseBody(request, createFiscalDocumentFromReceiptSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_fiscal_document_from_purchase_receipt", {
      p_purchase_receipt_id: id,
      p_fiscal_establishment_id: body.fiscalEstablishmentId,
      p_operation_nature_id: body.operationNatureId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createFiscalDocumentFromSalesOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.create");
    const { id } = await context.params;
    const body = await parseBody(request, createFiscalDocumentFromSalesOrderSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_fiscal_document_from_sales_order", {
      p_sales_order_id: id,
      p_fiscal_establishment_id: body.fiscalEstablishmentId,
      p_operation_nature_id: body.operationNatureId,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
