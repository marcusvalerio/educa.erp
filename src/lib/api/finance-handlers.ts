import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  financialCategorySchema,
  costCenterSchema,
  createFinancialAccountSchema,
  updateFinancialAccountSchema,
  createAccountsPayableSchema,
  generateAccountsPayableFromReceiptSchema,
  updateAccountsPayableSchema,
  cancelAccountsPayableSchema,
  createAccountsReceivableSchema,
  generateAccountsReceivableFromSalesOrderSchema,
  updateAccountsReceivableSchema,
  cancelAccountsReceivableSchema,
  payInstallmentSchema,
  receiveInstallmentSchema,
  reversePaymentSchema,
  reverseReceiptSchema,
  createManualFinancialTransactionSchema,
  createBankReconciliationSchema,
  setReconciliationItemStatusSchema,
} from "@/lib/validations/finance";

// Handlers do domínio Financeiro (supabase/migrations/0031-0035).
// Mesma distinção já usada em Produção/Logística/Compras/Comercial:
//   - "cadastro" (financial_categories/cost_centers): sem função RPC,
//     leitura E escrita via cliente admin após checagem de permissão
//     na API — RLS é defesa em profundidade.
//   - financial_accounts: criação via fn_create_financial_account
//     (garante current_balance = opening_balance desde a primeira
//     linha); edição de campos não-financeiros via PATCH direto —
//     opening_balance/current_balance nunca aparecem no schema de
//     update (src/lib/validations/finance.ts), então nunca chegam ao
//     payload do admin client.
//   - "transacional" (accounts_payable/accounts_receivable e tudo que
//     deriva deles): escrita exclusiva via função RPC chamada com o
//     cliente de sessão do usuário.
//
// Princípio central (seção 4): nenhuma linha deste arquivo gera um
// título financeiro só porque existe um purchase_order/sales_order —
// a origem é sempre um evento explícito chamado deliberadamente
// (generateAccountsPayableFromReceipt/generateAccountsReceivableFromSalesOrder).

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
  if (message.includes("só é possível") || message.includes("não pode ser") || message.includes("já estornado") || message.includes("não corresponde")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// -------------------------------------------------------- financial_categories
export async function listFinancialCategories(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("financial_categories.view");
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    let query = createAdminClient().from("financial_categories").select("*").eq("company_id", companyId);
    if (type) query = query.eq("type", type);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createFinancialCategory(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("financial_categories.create");
    const body = await parseBody(request, financialCategorySchema);
    const { data, error } = await createAdminClient().from("financial_categories").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      type: body.type,
      parent_id: body.parentId ?? null,
      description: body.description ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getFinancialCategory(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("financial_categories.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("financial_categories").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Categoria financeira");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFinancialCategory(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("financial_categories.update");
    const { id } = await context.params;
    const body = await parseBody(request, financialCategorySchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { parentId, ...rest } = body;
    const { data, error } = await createAdminClient().from("financial_categories")
      .update({ ...rest, ...(parentId !== undefined ? { parent_id: parentId ?? null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Categoria financeira");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------- cost_centers
export async function listCostCenters(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("cost_centers.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("cost_centers").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createCostCenter(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("cost_centers.create");
    const body = await parseBody(request, costCenterSchema);
    const { data, error } = await createAdminClient().from("cost_centers").insert({
      company_id: companyId,
      code: body.code,
      name: body.name,
      parent_id: body.parentId ?? null,
      notes: body.notes ?? null,
      status: body.status ?? "active",
    }).select("*").single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getCostCenter(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("cost_centers.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("cost_centers").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Centro de custo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateCostCenter(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("cost_centers.update");
    const { id } = await context.params;
    const body = await parseBody(request, costCenterSchema.partial());
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { parentId, ...rest } = body;
    const { data, error } = await createAdminClient().from("cost_centers")
      .update({ ...rest, ...(parentId !== undefined ? { parent_id: parentId ?? null } : {}) })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Centro de custo");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- financial_accounts
export async function listFinancialAccounts(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("financial_accounts.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("financial_accounts").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createFinancialAccount(request: NextRequest) {
  try {
    await requireAccess("financial_accounts.create");
    const body = await parseBody(request, createFinancialAccountSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_financial_account", {
      p_company_id: ctx.companyId,
      p_code: body.code,
      p_name: body.name,
      p_type: body.type,
      p_opening_balance: body.openingBalance ?? 0,
      p_bank_name: body.bankName ?? null,
      p_bank_agency: body.bankAgency ?? null,
      p_bank_account_masked: body.bankAccountMasked ?? null,
      p_currency_code: body.currencyCode ?? "BRL",
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getFinancialAccount(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("financial_accounts.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("financial_accounts").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Conta financeira");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateFinancialAccount(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("financial_accounts.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateFinancialAccountSchema);
    if (Object.keys(body).length === 0) throw validationError("Nenhum dado para atualizar.");
    const { bankName, bankAgency, bankAccountMasked, ...rest } = body;
    const { data, error } = await createAdminClient().from("financial_accounts")
      .update({
        ...rest,
        ...(bankName !== undefined ? { bank_name: bankName } : {}),
        ...(bankAgency !== undefined ? { bank_agency: bankAgency } : {}),
        ...(bankAccountMasked !== undefined ? { bank_account_masked: bankAccountMasked } : {}),
      })
      .eq("company_id", companyId).eq("id", id).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Conta financeira");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------- accounts_payable
async function fetchPayableWithInstallments(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("accounts_payable").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: installments, error: installmentsError } = await admin.from("accounts_payable_installments").select("*").eq("payable_id", id).order("installment_number");
  if (installmentsError) throw translatePostgresError(installmentsError);
  return { ...header, installments: installments ?? [] };
}

export async function listAccountsPayable(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("accounts_payable.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const supplierId = searchParams.get("supplierId");
    let query = createAdminClient().from("accounts_payable").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (supplierId) query = query.eq("supplier_id", supplierId);
    const { data, error } = await query.order("due_date");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getAccountsPayable(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("accounts_payable.view");
    const { id } = await context.params;
    const data = await fetchPayableWithInstallments(companyId, id);
    if (!data) throw notFoundError("Título a pagar");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAccountsPayable(request: NextRequest) {
  try {
    await requireAccess("accounts_payable.create");
    const body = await parseBody(request, createAccountsPayableSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_accounts_payable", {
      p_company_id: ctx.companyId,
      p_supplier_id: body.supplierId,
      p_description: body.description,
      p_original_amount: body.originalAmount,
      p_installments: body.installments.map((i) => ({ due_date: i.dueDate, amount: i.amount })),
      p_category_id: body.categoryId ?? null,
      p_cost_center_id: body.costCenterId ?? null,
      p_discount: body.discount ?? 0,
      p_interest: body.interest ?? 0,
      p_penalty: body.penalty ?? 0,
      p_issue_date: body.issueDate || null,
      p_document_reference: body.documentReference ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAccountsPayable(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_payable.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateAccountsPayableSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_accounts_payable", {
      p_payable_id: id,
      p_description: body.description ?? null,
      p_category_id: body.categoryId ?? null,
      p_cost_center_id: body.costCenterId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelAccountsPayable(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_payable.cancel");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelAccountsPayableSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_accounts_payable", {
      p_payable_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function refreshOverduePayables() {
  try {
    const { companyId } = await requireAccess("accounts_payable.view");
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_refresh_overdue_payables", { p_company_id: companyId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function generateAccountsPayableFromReceipt(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_payable.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = generateAccountsPayableFromReceiptSchema.safeParse(body ?? {});
    const data_ = parsed.success ? parsed.data : undefined;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_generate_accounts_payable_from_purchase_receipt", {
      p_purchase_receipt_id: id,
      p_category_id: data_?.categoryId ?? null,
      p_cost_center_id: data_?.costCenterId ?? null,
      p_payment_terms_id: data_?.paymentTermsId ?? null,
      p_issue_date: data_?.issueDate || null,
      p_due_date_base: data_?.dueDateBase || null,
      p_description: data_?.description ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------- accounts_payable_installments
export async function listAccountsPayableInstallments(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("accounts_payable.view");
    const { searchParams } = new URL(request.url);
    const payableId = searchParams.get("payableId");
    let query = createAdminClient().from("accounts_payable_installments").select("*").eq("company_id", companyId);
    if (payableId) query = query.eq("payable_id", payableId);
    const { data, error } = await query.order("due_date");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function payInstallment(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("payments.create");
    const { id } = await context.params;
    const body = await parseBody(request, payInstallmentSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_pay_installment", {
      p_installment_id: id,
      p_financial_account_id: body.financialAccountId,
      p_amount: body.amount,
      p_method: body.method,
      p_paid_at: body.paidAt || null,
      p_reference: body.reference ?? null,
      p_notes: body.notes ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- accounts_receivable
async function fetchReceivableWithInstallments(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("accounts_receivable").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: installments, error: installmentsError } = await admin.from("accounts_receivable_installments").select("*").eq("receivable_id", id).order("installment_number");
  if (installmentsError) throw translatePostgresError(installmentsError);
  return { ...header, installments: installments ?? [] };
}

export async function listAccountsReceivable(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("accounts_receivable.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    let query = createAdminClient().from("accounts_receivable").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);
    const { data, error } = await query.order("due_date");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getAccountsReceivable(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("accounts_receivable.view");
    const { id } = await context.params;
    const data = await fetchReceivableWithInstallments(companyId, id);
    if (!data) throw notFoundError("Título a receber");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createAccountsReceivable(request: NextRequest) {
  try {
    await requireAccess("accounts_receivable.create");
    const body = await parseBody(request, createAccountsReceivableSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_accounts_receivable", {
      p_company_id: ctx.companyId,
      p_customer_id: body.customerId,
      p_description: body.description,
      p_original_amount: body.originalAmount,
      p_installments: body.installments.map((i) => ({ due_date: i.dueDate, amount: i.amount })),
      p_category_id: body.categoryId ?? null,
      p_cost_center_id: body.costCenterId ?? null,
      p_discount: body.discount ?? 0,
      p_interest: body.interest ?? 0,
      p_penalty: body.penalty ?? 0,
      p_issue_date: body.issueDate || null,
      p_document_reference: body.documentReference ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateAccountsReceivable(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_receivable.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateAccountsReceivableSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_accounts_receivable", {
      p_receivable_id: id,
      p_description: body.description ?? null,
      p_category_id: body.categoryId ?? null,
      p_cost_center_id: body.costCenterId ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelAccountsReceivable(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_receivable.cancel");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelAccountsReceivableSchema.safeParse(body ?? {});

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_accounts_receivable", {
      p_receivable_id: id,
      p_reason: parsed.success ? parsed.data.reason ?? null : null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function refreshOverdueReceivables() {
  try {
    const { companyId } = await requireAccess("accounts_receivable.view");
    const supabase = await createClient();
    const { error } = await supabase.rpc("fn_refresh_overdue_receivables", { p_company_id: companyId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function generateAccountsReceivableFromSalesOrder(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("accounts_receivable.approve");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = generateAccountsReceivableFromSalesOrderSchema.safeParse(body ?? {});
    const data_ = parsed.success ? parsed.data : undefined;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_generate_accounts_receivable_from_sales_order", {
      p_sales_order_id: id,
      p_category_id: data_?.categoryId ?? null,
      p_cost_center_id: data_?.costCenterId ?? null,
      p_payment_terms_id: data_?.paymentTermsId ?? null,
      p_issue_date: data_?.issueDate || null,
      p_due_date_base: data_?.dueDateBase || null,
      p_description: data_?.description ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------- accounts_receivable_installments
export async function listAccountsReceivableInstallments(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("accounts_receivable.view");
    const { searchParams } = new URL(request.url);
    const receivableId = searchParams.get("receivableId");
    let query = createAdminClient().from("accounts_receivable_installments").select("*").eq("company_id", companyId);
    if (receivableId) query = query.eq("receivable_id", receivableId);
    const { data, error } = await query.order("due_date");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function receiveInstallment(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("receipts.create");
    const { id } = await context.params;
    const body = await parseBody(request, receiveInstallmentSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_receive_installment", {
      p_installment_id: id,
      p_financial_account_id: body.financialAccountId,
      p_amount: body.amount,
      p_method: body.method,
      p_received_at: body.receivedAt || null,
      p_reference: body.reference ?? null,
      p_notes: body.notes ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------------- payments
export async function listPayments(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("payments.view");
    const { searchParams } = new URL(request.url);
    const installmentId = searchParams.get("installmentId");
    let query = createAdminClient().from("payments").select("*").eq("company_id", companyId);
    if (installmentId) query = query.eq("installment_id", installmentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function reversePayment(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("payments.reverse");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = reversePaymentSchema.safeParse(body ?? {});
    const data_ = parsed.success ? parsed.data : {};

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reverse_payment", {
      p_payment_id: id,
      p_reason: data_.reason ?? null,
      p_idempotency_key: data_.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// --------------------------------------------------------------------- receipts
export async function listReceipts(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("receipts.view");
    const { searchParams } = new URL(request.url);
    const installmentId = searchParams.get("installmentId");
    let query = createAdminClient().from("receipts").select("*").eq("company_id", companyId);
    if (installmentId) query = query.eq("installment_id", installmentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function reverseReceipt(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("receipts.reverse");
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = reverseReceiptSchema.safeParse(body ?? {});
    const data_ = parsed.success ? parsed.data : {};

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_reverse_receipt", {
      p_receipt_id: id,
      p_reason: data_.reason ?? null,
      p_idempotency_key: data_.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------- financial_transactions
export async function listFinancialTransactions(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("financial_transactions.view");
    const { searchParams } = new URL(request.url);
    const financialAccountId = searchParams.get("financialAccountId");
    let query = createAdminClient().from("financial_transactions").select("*").eq("company_id", companyId);
    if (financialAccountId) query = query.eq("financial_account_id", financialAccountId);
    const { data, error } = await query.order("occurred_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createManualFinancialTransaction(request: NextRequest) {
  try {
    await requireAccess("financial_transactions.create");
    const body = await parseBody(request, createManualFinancialTransactionSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_manual_financial_transaction", {
      p_company_id: ctx.companyId,
      p_financial_account_id: body.financialAccountId,
      p_type: body.type,
      p_amount: body.amount,
      p_category_id: body.categoryId ?? null,
      p_cost_center_id: body.costCenterId ?? null,
      p_description: body.description ?? null,
      p_idempotency_key: body.idempotencyKey ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------- bank_reconciliations
async function fetchReconciliationWithItems(companyId: string, id: string) {
  const admin = createAdminClient();
  const { data: header, error } = await admin.from("bank_reconciliations").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!header) return null;
  const { data: items, error: itemsError } = await admin.from("bank_reconciliation_items").select("*").eq("reconciliation_id", id);
  if (itemsError) throw translatePostgresError(itemsError);
  return { ...header, items: items ?? [] };
}

export async function listBankReconciliations(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("bank_reconciliation.view");
    const { searchParams } = new URL(request.url);
    const financialAccountId = searchParams.get("financialAccountId");
    let query = createAdminClient().from("bank_reconciliations").select("*").eq("company_id", companyId);
    if (financialAccountId) query = query.eq("financial_account_id", financialAccountId);
    const { data, error } = await query.order("period_start", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getBankReconciliation(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("bank_reconciliation.view");
    const { id } = await context.params;
    const data = await fetchReconciliationWithItems(companyId, id);
    if (!data) throw notFoundError("Conciliação bancária");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createBankReconciliation(request: NextRequest) {
  try {
    await requireAccess("bank_reconciliation.create");
    const body = await parseBody(request, createBankReconciliationSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_bank_reconciliation", {
      p_company_id: ctx.companyId,
      p_financial_account_id: body.financialAccountId,
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

export async function completeBankReconciliation(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("bank_reconciliation.update");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_complete_bank_reconciliation", { p_reconciliation_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateBankReconciliationItem(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("bank_reconciliation.update");
    const { id } = await context.params;
    const body = await parseBody(request, setReconciliationItemStatusSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_reconciliation_item_status", {
      p_item_id: id,
      p_status: body.status,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ fluxo de caixa
export async function getCashFlowSummary() {
  try {
    const { companyId } = await requireAccess("financial_transactions.view");
    const { data, error } = await createAdminClient().from("v_cash_flow_summary").select("*").eq("company_id", companyId).maybeSingle();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? { company_id: companyId, current_balance_total: 0, open_receivable_total: 0, open_payable_total: 0 } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getCashFlowProjection() {
  try {
    const { companyId } = await requireAccess("financial_transactions.view");
    const { data, error } = await createAdminClient().from("v_cash_flow_projection").select("*").eq("company_id", companyId).order("due_date");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
