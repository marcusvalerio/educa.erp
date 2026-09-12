import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  resolveSettingQuerySchema,
  upsertSettingSchema,
  createDocumentSequenceSchema,
  updateDocumentSequenceSchema,
  nextDocumentNumberSchema,
  assignFiscalDocumentNumberSchema,
} from "@/lib/validations/settings";

// Handlers de Configuração e Parametrização do ERP (supabase/migrations/
// 0052-0053, Fase 14). Leitura resolvida (fn_resolve_setting) e escrita
// (fn_upsert_setting) sempre via RPC (cliente de sessão) — a permissão
// certa (global/company/establishment) é decidida DENTRO da função SQL,
// nunca replicada aqui.

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
  if (message.includes("não encontrad") || message.includes("não configurada")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("inativa") || message.includes("exige company_id")) return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------- system_settings
export async function listSettings(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("settings.view");
    const { searchParams } = new URL(request.url);
    const moduleParam = searchParams.get("module");
    const scope = searchParams.get("scope"); // 'global' | 'company' | 'establishment'
    let query = createAdminClient().from("system_settings").select("*");
    if (moduleParam) query = query.eq("module", moduleParam);
    if (scope === "global") query = query.is("company_id", null);
    else if (scope === "establishment") query = query.eq("company_id", companyId).not("establishment_id", "is", null);
    else if (scope === "company") query = query.eq("company_id", companyId).is("establishment_id", null);
    else query = query.or(`company_id.is.null,company_id.eq.${companyId}`);
    const { data, error } = await query.order("module").order("key");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function resolveSetting(request: NextRequest) {
  try {
    await requireAccess("settings.view");
    const { searchParams } = new URL(request.url);
    const parsed = resolveSettingQuerySchema.safeParse({
      establishmentId: searchParams.get("establishmentId") ?? "",
      module: searchParams.get("module") ?? "",
      key: searchParams.get("key") ?? "",
    });
    if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_resolve_setting", {
      p_company_id: ctx.companyId,
      p_establishment_id: parsed.data.establishmentId ?? null,
      p_module: parsed.data.module,
      p_key: parsed.data.key,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? null });
  } catch (error) {
    return jsonError(error);
  }
}

export async function upsertSetting(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const body = await parseBody(request, upsertSettingSchema);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_upsert_setting", {
      p_company_id: body.companyId ?? null,
      p_establishment_id: body.establishmentId ?? null,
      p_module: body.module,
      p_key: body.key,
      p_value_type: body.valueType,
      p_value_string: body.valueString ?? null,
      p_value_integer: body.valueInteger ?? null,
      p_value_decimal: body.valueDecimal ?? null,
      p_value_boolean: body.valueBoolean ?? null,
      p_value_date: body.valueDate || null,
      p_value_json: body.valueJson ?? null,
      p_description: body.description ?? null,
      p_valid_from: body.validFrom || null,
      p_valid_until: body.validUntil || null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// Rotas dedicadas de conveniência (seção 14.24: /api/company-settings,
// /api/establishment-settings) — mesmo handler upsertSetting por baixo,
// só fixam o nível esperado no corpo antes de repassar, evitando um
// cliente company-level acidentalmente escrever establishment-level.
export async function upsertCompanySetting(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const body = await parseBody(request, upsertSettingSchema);
    if (body.establishmentId) throw validationError("Use /api/establishment-settings para configurações de estabelecimento.");

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_upsert_setting", {
      p_company_id: ctx.companyId,
      p_establishment_id: null,
      p_module: body.module,
      p_key: body.key,
      p_value_type: body.valueType,
      p_value_string: body.valueString ?? null,
      p_value_integer: body.valueInteger ?? null,
      p_value_decimal: body.valueDecimal ?? null,
      p_value_boolean: body.valueBoolean ?? null,
      p_value_date: body.valueDate || null,
      p_value_json: body.valueJson ?? null,
      p_description: body.description ?? null,
      p_valid_from: body.validFrom || null,
      p_valid_until: body.validUntil || null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function upsertEstablishmentSetting(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();
    const body = await parseBody(request, upsertSettingSchema);
    if (!body.establishmentId) throw validationError("Informe establishmentId.");

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_upsert_setting", {
      p_company_id: ctx.companyId,
      p_establishment_id: body.establishmentId,
      p_module: body.module,
      p_key: body.key,
      p_value_type: body.valueType,
      p_value_string: body.valueString ?? null,
      p_value_integer: body.valueInteger ?? null,
      p_value_decimal: body.valueDecimal ?? null,
      p_value_boolean: body.valueBoolean ?? null,
      p_value_date: body.valueDate || null,
      p_value_json: body.valueJson ?? null,
      p_description: body.description ?? null,
      p_valid_from: body.validFrom || null,
      p_valid_until: body.validUntil || null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- document_sequences
export async function listDocumentSequences(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("document_sequences.view");
    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get("documentType");
    let query = createAdminClient().from("document_sequences").select("*").eq("company_id", companyId);
    if (documentType) query = query.eq("document_type", documentType);
    const { data, error } = await query.order("document_type").order("series_code");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getDocumentSequence(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("document_sequences.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient().from("document_sequences").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Sequência documental");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createDocumentSequence(request: NextRequest) {
  try {
    await requireAccess("document_sequences.create");
    const body = await parseBody(request, createDocumentSequenceSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_document_sequence", {
      p_company_id: ctx.companyId,
      p_document_type: body.documentType,
      p_series_code: body.seriesCode ?? "1",
      p_prefix: body.prefix ?? null,
      p_padding: body.padding ?? 6,
      p_establishment_id: body.establishmentId ?? null,
      p_description: body.description ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateDocumentSequence(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("document_sequences.update");
    const { id } = await context.params;
    const body = await parseBody(request, updateDocumentSequenceSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_update_document_sequence", {
      p_sequence_id: id,
      p_prefix: body.prefix ?? null,
      p_padding: body.padding ?? null,
      p_description: body.description ?? null,
      p_status: body.status ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function nextDocumentNumber(request: NextRequest) {
  try {
    await requireAccess("document_sequences.update");
    const body = await parseBody(request, nextDocumentNumberSchema);
    const ctx = await getAuthContext();
    if (!ctx) throw unauthorizedError();

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_next_document_number", {
      p_company_id: ctx.companyId,
      p_document_type: body.documentType,
      p_series_code: body.seriesCode ?? "1",
      p_establishment_id: body.establishmentId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] ?? null : data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function assignFiscalDocumentNumber(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.calculate");
    const { id } = await context.params;
    const body = await parseBody(request, assignFiscalDocumentNumberSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_assign_fiscal_document_number", {
      p_fiscal_document_id: id,
      p_series_code: body.seriesCode ?? "1",
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
