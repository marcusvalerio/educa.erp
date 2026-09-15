import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  configureFiscalProviderSchema,
  registerFiscalCertificateSchema,
  beginFiscalAuthorizationSchema,
  processFiscalAuthorizationResponseSchema,
  registerFiscalDocumentFileSchema,
  registerFiscalDocumentEventIdempotentSchema,
} from "@/lib/validations/fiscal-operations";

// Handlers da evolução Fiscal Operacional Avançado (Fase 22,
// supabase/migrations/0063) — arquivo separado de fiscal-handlers.ts
// (Fase 8/9, já extenso) para não misturar o Fiscal Core com as
// superfícies novas (provedor/certificado/tentativa de autorização/
// arquivo XML). Nenhuma chamada a um provedor externo real acontece
// aqui — ver docs/FISCAL_OPERATIONS.md.

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
  if (message.includes("só é possível") || message.includes("já foi finalizada") || message.includes("obrigatória") || message.includes("inválido:")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ------------------------------------------------------------ provider config
export async function configureFiscalProvider(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_provider_configs.manage");
    const { id } = await context.params;
    const body = await parseBody(request, configureFiscalProviderSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_configure_fiscal_provider", {
      p_fiscal_establishment_id: id,
      p_provider_code: body.providerCode,
      p_environment: body.environment,
      p_config: body.config,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listFiscalProviderConfigs(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_provider_configs.view");
    const { searchParams } = new URL(request.url);
    const establishmentId = searchParams.get("fiscalEstablishmentId");
    let query = createAdminClient().from("fiscal_provider_configs").select("*").eq("company_id", companyId);
    if (establishmentId) query = query.eq("fiscal_establishment_id", establishmentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------ certificates
export async function registerFiscalCertificate(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_provider_configs.manage");
    const { id } = await context.params;
    const body = await parseBody(request, registerFiscalCertificateSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_fiscal_certificate", {
      p_fiscal_establishment_id: id,
      p_alias: body.alias,
      p_certificate_type: body.certificateType,
      p_subject_name: body.subjectName ?? null,
      p_issuer_name: body.issuerName ?? null,
      p_valid_from: body.validFrom || null,
      p_valid_until: body.validUntil || null,
      p_external_secret_reference: body.externalSecretReference ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listFiscalCertificates(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("fiscal_provider_configs.view");
    const { searchParams } = new URL(request.url);
    const establishmentId = searchParams.get("fiscalEstablishmentId");
    let query = createAdminClient().from("fiscal_digital_certificates").select("*").eq("company_id", companyId);
    if (establishmentId) query = query.eq("fiscal_establishment_id", establishmentId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function deactivateFiscalCertificate(_request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_provider_configs.manage");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_deactivate_fiscal_certificate", { p_certificate_id: id });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- authorization flow
export async function beginFiscalDocumentAuthorization(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const body = await parseBody(request, beginFiscalAuthorizationSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_begin_fiscal_document_authorization", {
      p_fiscal_document_id: id,
      p_provider_code: body.providerCode,
      p_request_reference: body.requestReference ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function processFiscalAuthorizationResponse(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const body = await parseBody(request, processFiscalAuthorizationResponseSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_process_fiscal_authorization_response", {
      p_attempt_id: id,
      p_result: body.result,
      p_access_key: body.accessKey ?? null,
      p_protocol: body.protocol ?? null,
      p_receipt_number: body.receiptNumber ?? null,
      p_error_code: body.errorCode ?? null,
      p_error_message: body.errorMessage ?? null,
      p_response_reference: body.responseReference ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listFiscalAuthorizationAttempts(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const { data, error } = await createAdminClient()
      .from("fiscal_authorization_attempts")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_document_id", id)
      .order("attempt_number", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------------------- files
export async function registerFiscalDocumentFile(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_document_files.create");
    const { id } = await context.params;
    const body = await parseBody(request, registerFiscalDocumentFileSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_fiscal_document_file", {
      p_fiscal_document_id: id,
      p_file_type: body.fileType,
      p_storage_reference: body.storageReference,
      p_content_hash: body.contentHash ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listFiscalDocumentFiles(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_document_files.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient()
      .from("fiscal_document_files")
      .select("*")
      .eq("company_id", companyId)
      .eq("fiscal_document_id", id)
      .order("file_type")
      .order("version", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------- eventos idempotentes
export async function registerFiscalDocumentEventIdempotent(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("fiscal_document_events.create");
    const { id } = await context.params;
    const body = await parseBody(request, registerFiscalDocumentEventIdempotentSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_register_fiscal_document_event_idempotent", {
      p_fiscal_document_id: id,
      p_event_type: body.eventType,
      p_idempotency_key: body.idempotencyKey,
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
