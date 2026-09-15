import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { jsonError } from "./response";
import { setImportMappingSchema, cancelImportJobSchema } from "@/lib/validations/import-export";
import { parseCsv, toCsv } from "@/lib/import-export/csv";
import { IMPORT_ENTITIES, isImportableEntity, validateImportRow, type ImportableEntity } from "@/lib/import-export/registry";
import { persistImportRow } from "@/lib/import-export/persist";
import { tablesByEntity } from "@/lib/database/repositories";
import type { EntityRoute } from "@/lib/database/repositories";
import type { ImportJobRow, ImportJobRowRecordRow } from "@/lib/database/schema";

// Handlers da infraestrutura de Importação/Exportação (Fase 21,
// supabase/migrations/0062). O parsing de arquivo acontece aqui (Node),
// nunca no banco; o estado (job/linhas/erros) e a idempotência de
// contadores ficam nas funções fn_* — ver src/lib/import-export/registry.ts
// para a reutilização das MESMAS validações/repositórios do CRUD manual.

async function requireAccess(permissionCode: string): Promise<{ companyId: string; appUserId: string; actorLabel: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  const allowed = await hasPermission(ctx.companyId, permissionCode);
  if (!allowed) throw forbiddenError(permissionCode);
  return { companyId: ctx.companyId, appUserId: ctx.appUserId, actorLabel: ctx.actorLabel };
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
  if (message.includes("só é possível") || message.includes("não está em") || message.includes("configure o mapeamento") || message.includes("não há linhas")) {
    return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  }
  return translatePostgresError(error);
}

type RouteContext = { params: Promise<{ id: string }> };

async function fetchJob(companyId: string, id: string): Promise<ImportJobRow> {
  const { data, error } = await createAdminClient().from("import_jobs").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!data) throw notFoundError("Processo de importação");
  return data as ImportJobRow;
}

function buildMappedRow(mapping: Record<string, string>, rawData: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [sourceColumn, targetField] of Object.entries(mapping)) {
    mapped[targetField] = rawData[sourceColumn] ?? "";
  }
  return mapped;
}

// ------------------------------------------------------------------------ upload
export async function uploadImport(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("import_export.import");

    const form = await request.formData().catch(() => null);
    if (!form) throw validationError("Envie o arquivo como multipart/form-data.");

    const file = form.get("file");
    const entityType = form.get("entityType");
    if (!(file instanceof File)) throw validationError("Campo 'file' ausente ou inválido.");
    if (typeof entityType !== "string" || !isImportableEntity(entityType)) {
      const supported = Object.keys(IMPORT_ENTITIES).join(", ");
      throw validationError(`entityType inválido. Entidades suportadas para importação nesta fase: ${supported}.`);
    }

    const filename = file.name || "arquivo.csv";
    const looksLikeXlsx = /\.xlsx$/i.test(filename) || file.type.includes("spreadsheet");
    if (looksLikeXlsx) {
      throw validationError(
        "Importação de XLSX não está disponível nesta fase por decisão de segurança (ver docs/IMPORT_EXPORT.md) — exporte o arquivo como CSV e envie novamente."
      );
    }

    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    if (headers.length === 0) throw validationError("Arquivo CSV sem cabeçalho.");
    if (rows.length === 0) throw validationError("Arquivo CSV sem linhas de dados.");

    const config = IMPORT_ENTITIES[entityType];
    const supabase = await createClient();

    const { error: createError } = await supabase.rpc("fn_create_import_job", {
      p_company_id: companyId,
      p_module: config.module,
      p_entity_type: entityType,
      p_format: "CSV",
      p_original_filename: filename,
    });
    if (createError) throw rpcError(createError);

    // fn_create_import_job já retorna o job, mas precisamos do id antes
    // de encená-lo — busca a linha recém-criada (mais recente para esta
    // empresa/entidade) em vez de depender do formato exato do retorno
    // RPC, mantendo o handler resiliente a variações de serialização.
    const { data: created, error: fetchError } = await createAdminClient()
      .from("import_jobs")
      .select("*")
      .eq("company_id", companyId)
      .eq("entity_type", entityType)
      .eq("status", "UPLOADED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fetchError) throw translatePostgresError(fetchError);
    if (!created) throw new ApiError("INTERNAL_ERROR", "Não foi possível localizar o job recém-criado.", 500);

    const { data: staged, error: stageError } = await supabase.rpc("fn_stage_import_rows", {
      p_import_job_id: created.id,
      p_rows: rows,
    });
    if (stageError) throw rpcError(stageError);

    return NextResponse.json({ success: true, data: { job: staged, headers } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------------ jobs
export async function listImports(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("import_export.view");
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const entityType = searchParams.get("entityType");
    let query = createAdminClient().from("import_jobs").select("*").eq("company_id", companyId);
    if (status) query = query.eq("status", status);
    if (entityType) query = query.eq("entity_type", entityType);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function getImport(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.view");
    const { id } = await context.params;
    const job = await fetchJob(companyId, id);
    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    return jsonError(error);
  }
}

// preview: colunas identificadas + amostra + resumo de erros (seção 21.3)
export async function getImportPreview(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.view");
    const { id } = await context.params;
    const job = await fetchJob(companyId, id);

    const admin = createAdminClient();
    const { data: sample, error: sampleError } = await admin
      .from("import_job_rows")
      .select("*")
      .eq("import_job_id", id)
      .order("row_number")
      .limit(20);
    if (sampleError) throw translatePostgresError(sampleError);

    const rows = (sample ?? []) as ImportJobRowRecordRow[];
    const columns = rows.length > 0 ? Object.keys(rows[0].raw_data) : [];

    const { data: errorRows, error: errorsErr } = await admin
      .from("import_job_errors")
      .select("*")
      .eq("import_job_id", id)
      .order("row_number")
      .limit(50);
    if (errorsErr) throw translatePostgresError(errorsErr);

    const requiredFields = isImportableEntity(job.entity_type) ? IMPORT_ENTITIES[job.entity_type].requiredFields : [];

    return NextResponse.json({
      success: true,
      data: {
        job,
        columnsIdentified: columns,
        requiredFields,
        sample: rows.slice(0, 20).map((r) => r.raw_data),
        totalRows: job.total_rows,
        errors: errorRows ?? [],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function setImportMapping(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("import_export.import");
    const { id } = await context.params;
    const body = await parseBody(request, setImportMappingSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_set_import_job_mapping", { p_import_job_id: id, p_mapping: body.mapping });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

async function runValidationPass(companyId: string, job: ImportJobRow) {
  if (!isImportableEntity(job.entity_type)) {
    throw validationError(
      `Importação de "${job.entity_type}" ainda não tem um conector de validação/persistência nesta fase — ver docs/IMPORT_EXPORT.md (entidades preparadas, não implementadas).`
    );
  }
  const entityType: ImportableEntity = job.entity_type;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: rows, error: rowsError } = await admin.from("import_job_rows").select("*").eq("import_job_id", job.id).order("row_number");
  if (rowsError) throw translatePostgresError(rowsError);

  for (const row of (rows ?? []) as ImportJobRowRecordRow[]) {
    const mapped = buildMappedRow(job.column_mapping, row.raw_data);
    const result = validateImportRow(entityType, mapped);

    if (result.success) {
      await supabase.rpc("fn_record_import_row_validation", { p_import_job_row_id: row.id, p_status: "VALID", p_natural_key: result.naturalKey });
    } else {
      await supabase.rpc("fn_record_import_row_validation", { p_import_job_row_id: row.id, p_status: "INVALID", p_natural_key: null });
      for (const issue of result.errors) {
        await supabase.rpc("fn_record_import_error", {
          p_import_job_id: job.id,
          p_import_job_row_id: row.id,
          p_row_number: row.row_number,
          p_column_name: issue.field ?? null,
          p_value_text: issue.field ? (mapped[issue.field] ?? null) : null,
          p_error_code: "VALIDATION_ERROR",
          p_message: issue.message,
          p_severity: "ERROR",
        });
      }
    }
  }
}

export async function validateImport(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.import");
    const { id } = await context.params;
    const job = await fetchJob(companyId, id);

    const supabase = await createClient();
    const { error: startError } = await supabase.rpc("fn_start_import_validation", { p_import_job_id: id });
    if (startError) throw rpcError(startError);

    const { error: clearError } = await supabase.rpc("fn_clear_import_job_errors", { p_import_job_id: id });
    if (clearError) throw rpcError(clearError);

    await runValidationPass(companyId, { ...job, status: "VALIDATING" });

    const { data: finalJob, error: completeError } = await supabase.rpc("fn_complete_import_validation", { p_import_job_id: id });
    if (completeError) throw rpcError(completeError);

    return NextResponse.json({ success: true, data: finalJob });
  } catch (error) {
    return jsonError(error);
  }
}

async function runProcessingPass(companyId: string, job: ImportJobRow, rowStatusFilter: "VALID" | "PENDING") {
  if (!isImportableEntity(job.entity_type)) {
    throw validationError(`Importação de "${job.entity_type}" ainda não tem um conector de processamento nesta fase.`);
  }
  const entityType: ImportableEntity = job.entity_type;
  const supabase = await createClient();
  const admin = createAdminClient();
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  const actor = { userId: ctx.appUserId, actorLabel: ctx.actorLabel };

  const { data: rows, error: rowsError } = await admin
    .from("import_job_rows")
    .select("*")
    .eq("import_job_id", job.id)
    .eq("status", rowStatusFilter)
    .order("row_number");
  if (rowsError) throw translatePostgresError(rowsError);

  for (const row of (rows ?? []) as ImportJobRowRecordRow[]) {
    const mapped = buildMappedRow(job.column_mapping, row.raw_data);
    const validated = validateImportRow(entityType, mapped);

    if (!validated.success) {
      await supabase.rpc("fn_record_import_row_result", { p_import_job_row_id: row.id, p_success: false, p_entity_id: null });
      await supabase.rpc("fn_record_import_error", {
        p_import_job_id: job.id,
        p_import_job_row_id: row.id,
        p_row_number: row.row_number,
        p_column_name: null,
        p_value_text: null,
        p_error_code: "REVALIDATION_FAILED",
        p_message: "Linha deixou de ser válida entre a validação e o processamento — reexecute a validação.",
        p_severity: "ERROR",
      });
      continue;
    }

    const persisted = await persistImportRow(entityType, companyId, validated.data, validated.naturalKey, actor);
    if (persisted.success) {
      await supabase.rpc("fn_record_import_row_result", { p_import_job_row_id: row.id, p_success: true, p_entity_id: persisted.entityId });
    } else {
      await supabase.rpc("fn_record_import_row_result", { p_import_job_row_id: row.id, p_success: false, p_entity_id: null });
      await supabase.rpc("fn_record_import_error", {
        p_import_job_id: job.id,
        p_import_job_row_id: row.id,
        p_row_number: row.row_number,
        p_column_name: null,
        p_value_text: null,
        p_error_code: "PERSIST_ERROR",
        p_message: persisted.message,
        p_severity: "ERROR",
      });
    }
  }
}

export async function processImport(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.import");
    const { id } = await context.params;

    const supabase = await createClient();
    const { data: startedJob, error: startError } = await supabase.rpc("fn_start_import_processing", { p_import_job_id: id });
    if (startError) throw rpcError(startError);

    await runProcessingPass(companyId, startedJob as ImportJobRow, "VALID");

    const { data: finalJob, error: finishError } = await supabase.rpc("fn_finish_import_job", { p_import_job_id: id });
    if (finishError) throw rpcError(finishError);

    return NextResponse.json({ success: true, data: finalJob });
  } catch (error) {
    return jsonError(error);
  }
}

export async function reprocessImport(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.import");
    const { id } = await context.params;

    const supabase = await createClient();
    const { error: reopenError } = await supabase.rpc("fn_reopen_import_job_for_reprocess", { p_import_job_id: id });
    if (reopenError) throw rpcError(reopenError);

    const { data: startedJob, error: startError } = await supabase.rpc("fn_start_import_processing", { p_import_job_id: id });
    if (startError) throw rpcError(startError);

    await runProcessingPass(companyId, startedJob as ImportJobRow, "PENDING");

    const { data: finalJob, error: finishError } = await supabase.rpc("fn_finish_import_job", { p_import_job_id: id });
    if (finishError) throw rpcError(finishError);

    return NextResponse.json({ success: true, data: finalJob });
  } catch (error) {
    return jsonError(error);
  }
}

export async function cancelImport(request: NextRequest, context: RouteContext) {
  try {
    await requireAccess("import_export.cancel");
    const { id } = await context.params;
    const body = await parseBody(request, cancelImportJobSchema);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_cancel_import_job", { p_import_job_id: id, p_reason: body.reason ?? null });
    if (error) throw rpcError(error);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listImportErrors(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("import_export.view");
    const { id } = await context.params;
    await fetchJob(companyId, id);
    const { data, error } = await createAdminClient().from("import_job_errors").select("*").eq("import_job_id", id).order("row_number");
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------------------ export
const EXPORTABLE_ENTITIES = new Set<EntityRoute>(Object.keys(tablesByEntity) as EntityRoute[]);

export async function exportEntity(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("import_export.export");
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType") as EntityRoute | null;
    const format = (searchParams.get("format") ?? "csv").toLowerCase();
    const search = searchParams.get("search") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    if (!entityType || !EXPORTABLE_ENTITIES.has(entityType)) {
      throw validationError(`entityType inválido. Entidades disponíveis: ${Array.from(EXPORTABLE_ENTITIES).join(", ")}.`);
    }
    if (format !== "csv") {
      throw validationError("Exportação de XLSX não está disponível nesta fase (ver docs/IMPORT_EXPORT.md) — use format=csv.");
    }

    const table = tablesByEntity[entityType];
    const result = await table.list(companyId, {
      search,
      status: status === "Ativo" || status === "Inativo" ? status : undefined,
      pageSize: 500,
    });

    const rows = result.data as unknown as Record<string, unknown>[];
    const headers = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== "id") : [];
    const csv = toCsv(headers, rows);

    const supabase = await createClient();
    await supabase.rpc("fn_create_export_job", {
      p_company_id: companyId,
      p_module: "import_export",
      p_entity_type: entityType,
      p_format: "CSV",
      p_filters: { search: search ?? null, status: status ?? null },
      p_columns: headers,
      p_total_rows: rows.length,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entityType}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function listExports(request: NextRequest) {
  try {
    const { companyId } = await requireAccess("import_export.view");
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    let query = createAdminClient().from("export_jobs").select("*").eq("company_id", companyId);
    if (entityType) query = query.eq("entity_type", entityType);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
    if (error) throw translatePostgresError(error);
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}
