import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/auth/context";
import { ApiError, forbiddenError, notFoundError, translatePostgresError, unauthorizedError, validationError } from "@/lib/database/errors";
import { isHomologation } from "@/lib/environment";
import { isSimulatedProtocol } from "@/lib/fiscal/simulation";
import type { SimulatedDocumentPayload, SimulatedParty } from "@/lib/fiscal/simulated-document";
import { jsonError } from "./response";

// Fiscal SIMULADO da homologação (migration 0082). Nenhuma rota daqui fala
// com SEFAZ, certificado ou provedor real: a autorização é feita pelo
// provedor SIMULACAO dentro do banco, que só aceita documento de homologação
// com o provedor configurado no estabelecimento. Fora de APP_ENV=homologacao
// as rotas de autorização/cancelamento simulados respondem 404.

type RouteContext = { params: Promise<{ id: string }> };

async function requireAccess(permissionCode: string): Promise<{ companyId: string }> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorizedError();
  if (!(await hasPermission(ctx.companyId, permissionCode))) throw forbiddenError(permissionCode);
  return { companyId: ctx.companyId };
}

function requireHomologation() {
  if (!isHomologation()) throw new ApiError("NOT_FOUND", "A simulação fiscal só existe no ambiente de homologação.", 404);
}

function rpcError(error: { message?: string; code?: string }): ApiError {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("permissão negada")) return new ApiError("FORBIDDEN", error.message ?? "", 403);
  if (message.includes("não encontrad")) return new ApiError("NOT_FOUND", error.message ?? "", 404);
  if (message.includes("já foi autorizado") || message.includes("já está cancelado") || message.includes("já está autorizado")) {
    return new ApiError("ALREADY_DONE", error.message ?? "", 409);
  }
  if (message.includes("só é possível") || message.includes("não pode ser")) return new ApiError("INVALID_STATUS_TRANSITION", error.message ?? "", 409);
  return translatePostgresError(error);
}

export async function simulateFiscalAuthorization(_request: NextRequest, context: RouteContext) {
  try {
    requireHomologation();
    await requireAccess("fiscal_documents.submit_authorization");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_simulate_fiscal_authorization", { p_fiscal_document_id: id });
    if (error) throw rpcError(error);
    const doc = (Array.isArray(data) ? data[0] : data) as { code: string; status: string; access_key: string | null } | null;
    const message = doc?.status === "AUTHORIZED"
      ? `Documento ${doc.code} autorizado na SIMULAÇÃO (sem valor fiscal).`
      : `Documento ${doc?.code ?? ""} rejeitado na simulação. Veja o motivo nos eventos do documento.`;
    return NextResponse.json({ success: true, data: doc, message });
  } catch (error) {
    return jsonError(error);
  }
}

export async function simulateFiscalCancellation(request: NextRequest, context: RouteContext) {
  try {
    requireHomologation();
    await requireAccess("fiscal_documents.cancel");
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 15) throw validationError("Informe a justificativa do cancelamento com pelo menos 15 caracteres.");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("fn_simulate_fiscal_cancellation", { p_fiscal_document_id: id, p_reason: reason });
    if (error) throw rpcError(error);
    const doc = (Array.isArray(data) ? data[0] : data) as { code: string } | null;
    return NextResponse.json({ success: true, data: doc, message: `Documento ${doc?.code ?? ""} cancelado na simulação.` });
  } catch (error) {
    return jsonError(error);
  }
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/** Dados para o documento visual simulado (somente leitura, via RLS). */
export async function getSimulatedFiscalDocument(_request: NextRequest, context: RouteContext) {
  try {
    const { companyId } = await requireAccess("fiscal_documents.view");
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: doc, error } = await supabase.from("fiscal_documents").select("*").eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error) throw translatePostgresError(error);
    if (!doc) throw notFoundError("Documento fiscal");

    const [est, nature, items, events, customer, supplier] = await Promise.all([
      supabase.from("fiscal_establishments").select("*").eq("id", doc.fiscal_establishment_id).maybeSingle(),
      doc.operation_nature_id ? supabase.from("fiscal_operation_natures").select("name").eq("id", doc.operation_nature_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("fiscal_document_items").select("*").eq("fiscal_document_id", id).order("created_at"),
      supabase.from("fiscal_document_events").select("event_type, message, protocol, created_at").eq("fiscal_document_id", id).order("created_at"),
      doc.customer_id ? supabase.from("customers").select("*").eq("id", doc.customer_id).maybeSingle() : Promise.resolve({ data: null }),
      doc.supplier_id ? supabase.from("suppliers").select("*").eq("id", doc.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const itemIds = (items.data ?? []).map((i: { id: string }) => i.id);
    const taxes = itemIds.length
      ? await supabase.from("fiscal_document_item_taxes").select("*").in("fiscal_document_item_id", itemIds)
      : { data: [] as Record<string, unknown>[] };
    let sourceCode: string | null = null;
    if (doc.source_type === "sales_order" && doc.source_id) {
      sourceCode = ((await supabase.from("sales_orders").select("code").eq("id", doc.source_id).maybeSingle()).data as { code?: string } | null)?.code ?? null;
    } else if (doc.source_type === "purchase_receipt" && doc.source_id) {
      sourceCode = ((await supabase.from("purchase_receipts").select("code").eq("id", doc.source_id).maybeSingle()).data as { code?: string } | null)?.code ?? null;
    }

    const e = (est.data ?? {}) as Record<string, string | null>;
    const c = (customer.data ?? supplier.data ?? {}) as Record<string, string | null>;
    const party = (x: Record<string, string | null>, name: string | null): SimulatedParty => ({
      name,
      document: x.document ?? x.cnpj ?? null,
      stateRegistration: x.state_registration ?? null,
      address: [x.address, x.address_number].filter(Boolean).join(", ") || null,
      city: x.city ?? null,
      state: x.state ?? null,
      zipCode: x.zip_code ?? null,
    });
    const taxMap = new Map<string, { base: number; amount: number; rate: number }>();
    for (const t of (taxes.data ?? []) as Record<string, unknown>[]) {
      const key = String(t.tax_type ?? "IMPOSTO");
      const cur = taxMap.get(key) ?? { base: 0, amount: 0, rate: num(t.rate) };
      cur.base += num(t.calculation_basis);
      cur.amount += num(t.amount);
      taxMap.set(key, cur);
    }
    const payload: SimulatedDocumentPayload = {
      id: doc.id,
      code: doc.code,
      type: doc.type,
      model: doc.model ?? "55",
      series: doc.series,
      number: doc.number,
      direction: doc.direction,
      status: doc.status,
      environment: doc.environment,
      issueDate: doc.issue_date,
      accessKey: doc.access_key,
      protocol: doc.protocol,
      authorizedAt: doc.authorized_at,
      simulated: isSimulatedProtocol(doc.protocol) || doc.environment === "HOMOLOGATION",
      operationNature: (nature.data as { name?: string } | null)?.name ?? null,
      issuer: party(e, e.name ?? null),
      partner: {
        ...party(c, (c.name ?? c.legal_name ?? c.trade_name) ?? null),
        role: doc.customer_id ? "destinatario" : "remetente",
      },
      items: ((items.data ?? []) as Record<string, unknown>[]).map((i) => ({
        id: String(i.id),
        description: (i.description as string) ?? null,
        ncmCode: (i.ncm_code as string) ?? null,
        cfopCode: (i.cfop_code as string) ?? null,
        unit: (i.unit as string) ?? null,
        quantity: num(i.quantity),
        unitPrice: num(i.unit_price),
        discount: num(i.discount),
        total: num(i.total_amount),
      })),
      taxes: [...taxMap.entries()].map(([taxType, t]) => ({ taxType, base: t.base, rate: t.rate, amount: t.amount })),
      totals: {
        products: num(doc.products_amount), discount: num(doc.discount_amount), freight: num(doc.freight_amount),
        insurance: num(doc.insurance_amount), other: num(doc.other_expenses_amount), taxes: num(doc.taxes_amount), total: num(doc.total_amount),
      },
      events: ((events.data ?? []) as Record<string, string | null>[]).map((ev) => ({ type: String(ev.event_type), message: ev.message, protocol: ev.protocol, at: String(ev.created_at) })),
      sourceType: doc.source_type,
      sourceCode,
    };
    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    return jsonError(error);
  }
}
