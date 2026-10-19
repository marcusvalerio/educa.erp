import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, unauthorizedError, validationError, translatePostgresError } from "@/lib/database/errors";
import { authorizeXml, loadNfe } from "@/lib/fiscal/nfe-server";
import { jsonError } from "./response";

// NF-e em modo ensino: emitir (numerar → calcular → conferir → gerar XML
// → autorizar em homologação), baixar o XML e preparar a configuração
// fiscal mínima. As transições continuam nas funções do banco, chamadas
// com a sessão do usuário (permissões e status conferidos lá).

type RouteContext = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

async function requireAccess(...codes: string[]): Promise<{ companyId: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  for (const code of codes) {
    if (!(await hasPermission(ctx.companyId, code))) throw forbiddenError(code);
  }
  return { companyId: ctx.companyId };
}

function rpcFailure(error: { message?: string; code?: string }): ApiError {
  const message = error.message ?? "";
  if (message.toLowerCase().includes("permissão negada")) return new ApiError("FORBIDDEN", message, 403);
  if (error.code === "P0001" || error.code === "P0002" || error.code === "22023") return new ApiError("NFE_REJECTED", message, 422);
  return translatePostgresError(error);
}

function problemsError(problems: string[]): ApiError {
  return new ApiError("NFE_VALIDATION", `A nota não pode ser emitida:\n• ${problems.join("\n• ")}`, 422);
}

async function documentRow(companyId: string, id: string): Promise<Row> {
  const { data, error } = await createAdminClient().from("fiscal_documents").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
  if (error) throw translatePostgresError(error);
  if (!data) throw notFoundError("Documento fiscal");
  return data as Row;
}

/** Numera a nota; cria a sequência (série 1) do estabelecimento na primeira vez. */
async function assignNumber(companyId: string, doc: Row) {
  const supabase = await createClient();
  const call = () => supabase.rpc("fn_assign_fiscal_document_number", { p_fiscal_document_id: doc.id, p_series_code: "1" });
  let { error } = await call();
  if (error && /sequência documental não configurada/i.test(error.message ?? "")) {
    const created = await supabase.rpc("fn_create_document_sequence", {
      p_company_id: companyId,
      p_document_type: "FISCAL_DOCUMENT",
      p_series_code: "1",
      p_prefix: null,
      p_padding: 9,
      p_establishment_id: doc.fiscal_establishment_id,
      p_description: "NF-e série 1 (ensino)",
    });
    if (created.error) throw rpcFailure(created.error);
    ({ error } = await call());
  }
  if (error) throw rpcFailure(error);
}

/** Leva o documento até a autorização em homologação. */
export async function issueEducation(companyId: string, id: string): Promise<Row> {
  let doc = await documentRow(companyId, id);
  if (doc.status === "AUTHORIZED") return doc;

  // Confere cadastro antes de qualquer passo que congele a nota.
  const pre = await loadNfe(companyId, id, new Date());
  if (pre.problems.length > 0) throw problemsError(pre.problems);

  const supabase = await createClient();
  if (doc.status === "DRAFT") {
    if (doc.number === null || doc.number === undefined) await assignNumber(companyId, doc);
    const calc = await supabase.rpc("fn_calculate_fiscal_document", { p_fiscal_document_id: id });
    if (calc.error) throw rpcFailure(calc.error);
    doc = await documentRow(companyId, id);
  }
  if (doc.status === "CALCULATED") {
    if (doc.number === null || doc.number === undefined) throw validationError("Esta nota foi calculada sem número. Cancele-a e gere outra a partir do pedido.");
    const ready = await supabase.rpc("fn_mark_fiscal_document_ready", { p_fiscal_document_id: id });
    if (ready.error) throw rpcFailure(ready.error);
  }
  doc = await documentRow(companyId, id);
  if (doc.status !== "READY") throw validationError(`Esta nota está "${String(doc.status)}" e não pode ser emitida.`);

  const issuedAt = new Date();
  const { input, problems } = await loadNfe(companyId, id, issuedAt);
  if (problems.length > 0) throw problemsError(problems);
  const { proc, protocol } = authorizeXml(input, new Date(issuedAt.getTime() + 2000));
  const issued = await supabase.rpc("fn_issue_fiscal_document_education", {
    p_fiscal_document_id: id,
    p_access_key: input.accessKey,
    p_protocol: protocol,
    p_xml: proc,
  });
  if (issued.error) throw rpcFailure(issued.error);
  return issued.data as Row;
}

// POST /api/fiscal-documents/:id/issue-education
export async function issueFiscalDocumentEducation(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.authorize", "fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const data = await issueEducation(companyId, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

async function pickEstablishment(companyId: string, wanted?: string): Promise<Row> {
  let query = createAdminClient().from("fiscal_establishments").select("*").eq("company_id", companyId).eq("status", "active");
  if (wanted) query = query.eq("id", wanted);
  const { data, error } = await query.order("created_at").limit(1);
  if (error) throw translatePostgresError(error);
  const row = (data as Row[] | null)?.[0];
  if (!row) throw validationError("Cadastre o estabelecimento emitente em Fiscal › Configuração NF-e antes de emitir.");
  return row;
}

/** Natureza de venda adequada: CFOP 5xxx para o mesmo estado, 6xxx para outro. */
async function pickSaleNature(companyId: string, interstate: boolean): Promise<string> {
  const admin = createAdminClient();
  const { data: natures, error } = await admin.from("fiscal_operation_natures").select("id, default_cfop_id").eq("company_id", companyId).eq("direction", "SAIDA").eq("status", "active");
  if (error) throw translatePostgresError(error);
  const cfopIds = (natures ?? []).map((n: Row) => n.default_cfop_id).filter(Boolean) as string[];
  const { data: cfops } = cfopIds.length ? await admin.from("fiscal_cfops").select("id, code").eq("company_id", companyId).in("id", cfopIds) : { data: [] };
  const codeOf = new Map(((cfops ?? []) as Row[]).map((c) => [String(c.id), String(c.code)]));
  const wantedDigit = interstate ? "6" : "5";
  const match = (natures ?? []).find((n: Row) => (codeOf.get(String(n.default_cfop_id)) ?? "").startsWith(wantedDigit));
  if (!match) {
    throw validationError(`Falta uma natureza de venda com CFOP ${wantedDigit}xxx (${interstate ? "fora do estado" : "dentro do estado"}). Use "Configuração inicial" em Fiscal › Configuração NF-e.`);
  }
  return String(match.id);
}

// POST /api/sales-orders/:id/issue-nfe-education  { fiscalEstablishmentId? }
export async function issueSalesOrderNfeEducation(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.create", "fiscal_documents.authorize", "fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const body = ((await request.json().catch(() => ({}))) ?? {}) as { fiscalEstablishmentId?: string };
    const admin = createAdminClient();
    const { data: order, error } = await admin.from("sales_orders").select("id, customer_id").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!order) throw notFoundError("Pedido de venda");
    const { data: customer } = await admin.from("customers").select("state").eq("company_id", companyId).eq("id", order.customer_id).maybeSingle();
    const establishment = await pickEstablishment(companyId, body.fiscalEstablishmentId);
    const interstate = String(customer?.state ?? "").trim().toUpperCase() !== String(establishment.state ?? "").trim().toUpperCase();
    const natureId = await pickSaleNature(companyId, interstate);

    const supabase = await createClient();
    const created = await supabase.rpc("fn_create_fiscal_document_from_sales_order", {
      p_sales_order_id: id,
      p_fiscal_establishment_id: establishment.id,
      p_operation_nature_id: natureId,
      p_notes: null,
    });
    if (created.error) throw rpcFailure(created.error);
    const doc = created.data as Row;
    const data = await issueEducation(companyId, String(doc.id));
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// GET /api/fiscal-documents/:id/xml[?inline=1]
export async function getFiscalDocumentXml(request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.view");
    const { id } = await context.params;
    const doc = await documentRow(companyId, id);
    const { data, error } = await createAdminClient()
      .from("fiscal_document_files")
      .select("content")
      .eq("company_id", companyId)
      .eq("fiscal_document_id", id)
      .eq("file_type", "XML_AUTHORIZED")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw translatePostgresError(error);
    const xml = (data?.content as string | undefined) ?? "";
    if (!xml) throw notFoundError("XML da nota (a nota ainda não foi emitida)");
    const inline = new URL(request.url).searchParams.get("inline") === "1";
    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${String(doc.access_key ?? id)}-procNFe.xml"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

const SETUP_CFOPS = [
  { code: "5101", description: "Venda de produção do estabelecimento", scope: "INTERNAL" },
  { code: "5102", description: "Venda de mercadoria adquirida ou recebida de terceiros", scope: "INTERNAL" },
  { code: "6101", description: "Venda de produção do estabelecimento", scope: "INTERSTATE" },
  { code: "6102", description: "Venda de mercadoria adquirida ou recebida de terceiros", scope: "INTERSTATE" },
] as const;

const SETUP_NATURES = [
  { code: "VENDA-UF", name: "Venda de mercadoria (dentro do estado)", cfop: "5102" },
  { code: "VENDA-FORA", name: "Venda de mercadoria (fora do estado)", cfop: "6102" },
] as const;

// POST /api/fiscal-documents/education-setup — CFOPs e naturezas de venda que faltarem.
export async function setupNfeEducation() {
  try {
    const { companyId } = await requireAccess("fiscal_cfops.create", "fiscal_operation_natures.create");
    const admin = createAdminClient();
    const { data: existing } = await admin.from("fiscal_cfops").select("id, code").eq("company_id", companyId).in("code", SETUP_CFOPS.map((c) => c.code));
    const have = new Map(((existing ?? []) as Row[]).map((c) => [String(c.code), String(c.id)]));
    const missing = SETUP_CFOPS.filter((c) => !have.has(c.code));
    if (missing.length > 0) {
      const { data, error } = await admin.from("fiscal_cfops").insert(missing.map((c) => ({ company_id: companyId, code: c.code, description: c.description, direction: "SAIDA", scope: c.scope, status: "active" }))).select("id, code");
      if (error) throw translatePostgresError(error);
      for (const c of (data ?? []) as Row[]) have.set(String(c.code), String(c.id));
    }
    const { data: natures } = await admin.from("fiscal_operation_natures").select("code").eq("company_id", companyId).in("code", SETUP_NATURES.map((n) => n.code));
    const haveNature = new Set(((natures ?? []) as Row[]).map((n) => String(n.code)));
    const newNatures = SETUP_NATURES.filter((n) => !haveNature.has(n.code));
    if (newNatures.length > 0) {
      const { error } = await admin.from("fiscal_operation_natures").insert(newNatures.map((n) => ({ company_id: companyId, code: n.code, name: n.name, direction: "SAIDA", default_cfop_id: have.get(n.cfop), status: "active" })));
      if (error) throw translatePostgresError(error);
    }
    return NextResponse.json({ success: true, data: { cfopsCreated: missing.length, naturesCreated: newNatures.length } });
  } catch (error) {
    return jsonError(error);
  }
}
