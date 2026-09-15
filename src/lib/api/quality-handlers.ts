import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import {
  qualityChecklistSchema,
  qualityChecklistItemSchema,
  qualityInspectionSchema,
  recordInspectionResultSchema,
  finalizeInspectionSchema,
  sendToQuarantineSchema,
  nonconformitySchema,
  createNonconformityFromInspectionSchema,
  transitionNonconformitySchema,
  qualityActionSchema,
  transitionQualityActionSchema,
  qualityTraceabilityQuerySchema,
} from "@/lib/validations/quality";

// Handlers de Qualidade (supabase/migrations/0058, Fase 17).

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
  if (message.includes("inválid") || message.includes("transição") || message.includes("só é possível")) return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

// ----------------------------------------------------------- quality_checklists
export async function listQualityChecklists() {
  try {
    const { companyId } = await requireAccess("quality_checklists.view");
    const { data, error } = await createAdminClient().from("quality_checklists").select("*, quality_checklist_items(*)").eq("company_id", companyId).order("name");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createQualityChecklist(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_checklists.create");
    const body = await parseBody(request, qualityChecklistSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("quality_checklists")
      .insert({ company_id: companyId, code: body.code, name: body.name, inspection_type: body.inspectionType, description: body.description ?? null, created_by: ctx?.appUserId ?? null })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function updateQualityChecklist(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("quality_checklists.update");
    const { id } = await context.params;
    const body = await parseBody(request, qualityChecklistSchema.partial());
    const { data, error } = await createAdminClient().from("quality_checklists").update(body).eq("id", id).eq("company_id", companyId).select("*").maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Checklist de qualidade");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createQualityChecklistItem(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_checklists.create");
    const body = await parseBody(request, qualityChecklistItemSchema);
    const { data, error } = await createAdminClient()
      .from("quality_checklist_items")
      .insert({
        company_id: companyId,
        checklist_id: body.checklistId,
        sequence: body.sequence ?? 0,
        description: body.description,
        criteria_type: body.criteriaType,
        expected_value: body.expectedValue ?? null,
        min_value: body.minValue ?? null,
        max_value: body.maxValue ?? null,
        unit: body.unit ?? null,
        is_mandatory: body.isMandatory ?? true,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ---------------------------------------------------------- quality_inspections
export async function listQualityInspections(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_inspections.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sourceType = searchParams.get("sourceType");
    const sourceId = searchParams.get("sourceId");
    let query = createAdminClient().from("quality_inspections").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (sourceType) query = query.eq("source_type", sourceType);
    if (sourceId) query = query.eq("source_id", sourceId);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getQualityInspection(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("quality_inspections.view");
    const { id } = await context.params;
    const { data, error } = await createAdminClient()
      .from("quality_inspections")
      .select("*, quality_inspection_results(*)")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!data) throw notFoundError("Inspeção de qualidade");
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createQualityInspection(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_inspections.create");
    const body = await parseBody(request, qualityInspectionSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("quality_inspections")
      .insert({
        company_id: companyId,
        inspection_type: body.inspectionType,
        checklist_id: body.checklistId ?? null,
        source_type: body.sourceType ?? null,
        source_id: body.sourceId ?? null,
        product_id: body.productId ?? null,
        lot_id: body.lotId ?? null,
        notes: body.notes ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function recordInspectionResult(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("quality_inspections.record_result");
    const { id } = await context.params;
    const body = await parseBody(request, recordInspectionResultSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_record_inspection_result", {
      p_inspection_id: id,
      p_checklist_item_id: body.checklistItemId,
      p_value_found: body.valueFound ?? null,
      p_numeric_value: body.numericValue ?? null,
      p_notes: body.notes ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function finalizeInspection(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("quality_inspections.finalize");
    const { id } = await context.params;
    const body = await parseBody(request, finalizeInspectionSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_finalize_inspection", { p_inspection_id: id, p_status: body.status, p_notes: body.notes ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function sendInspectionToQuarantine(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("quality_inspections.quarantine");
    const { id } = await context.params;
    const body = await parseBody(request, sendToQuarantineSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_send_to_quarantine", {
      p_inspection_id: id,
      p_product_id: body.productId,
      p_from_location_id: body.fromLocationId,
      p_quarantine_location_id: body.quarantineLocationId,
      p_quantity: body.quantity,
      p_lot_id: body.lotId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createNonconformityFromInspection(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("nonconformities.create");
    const { id } = await context.params;
    const body = await parseBody(request, createNonconformityFromInspectionSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_create_nonconformity_from_inspection", {
      p_inspection_id: id,
      p_severity: body.severity,
      p_description: body.description,
      p_cause: body.cause ?? null,
      p_responsible_user_id: body.responsibleUserId ?? null,
    });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------- nonconformities
export async function listNonconformities(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("nonconformities.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    let query = createAdminClient().from("nonconformities").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.order("opened_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createNonconformity(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("nonconformities.create");
    const body = await parseBody(request, nonconformitySchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("nonconformities")
      .insert({
        company_id: companyId,
        inspection_id: body.inspectionId ?? null,
        origin_type: body.originType ?? null,
        origin_id: body.originId ?? null,
        severity: body.severity ?? "MEDIUM",
        cause: body.cause ?? null,
        description: body.description,
        responsible_user_id: body.responsibleUserId ?? null,
        evidence_notes: body.evidenceNotes ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function transitionNonconformity(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("nonconformities.update");
    const { id } = await context.params;
    const body = await parseBody(request, transitionNonconformitySchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_transition_nonconformity_status", { p_nonconformity_id: id, p_new_status: body.newStatus });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// ----------------------------------------------------------------- quality_actions
export async function listQualityActions(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_actions.view");
    const { searchParams } = new URL(request.url);
    const nonconformityId = searchParams.get("nonconformityId");
    let query = createAdminClient().from("quality_actions").select("*").eq("company_id", companyId);
    if (nonconformityId) query = query.eq("nonconformity_id", nonconformityId);
    const { data, error } = await query.order("due_date", { ascending: true, nullsFirst: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function createQualityAction(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("quality_actions.create");
    const body = await parseBody(request, qualityActionSchema);
    const ctx = await getAuthContext();
    const { data, error } = await createAdminClient()
      .from("quality_actions")
      .insert({
        company_id: companyId,
        nonconformity_id: body.nonconformityId ?? null,
        action_type: body.actionType,
        description: body.description,
        responsible_user_id: body.responsibleUserId ?? null,
        due_date: body.dueDate || null,
        notes: body.notes ?? null,
        created_by: ctx?.appUserId ?? null,
      })
      .select("*")
      .single();
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function transitionQualityAction(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("quality_actions.update");
    const { id } = await context.params;
    const body = await parseBody(request, transitionQualityActionSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_transition_quality_action_status", { p_action_id: id, p_new_status: body.newStatus });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// -------------------------------------------------------------------- traceability
export async function getQualityTraceability(request: NextRequest) {
  try {
    await requireAccess("quality_reports.view");
    const { searchParams } = new URL(request.url);
    const parsed = qualityTraceabilityQuerySchema.safeParse({ lotId: searchParams.get("lotId") ?? "" });
    if (!parsed.success) throw validationError(firstIssueMessage(parsed.error));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_quality_traceability", { p_lot_id: parsed.data.lotId });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
