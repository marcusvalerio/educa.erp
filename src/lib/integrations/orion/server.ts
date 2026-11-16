import "server-only";

import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/api/response";
import { dbError, parseJson, requireCompanyUser, requirePlatformMember } from "@/lib/api/governance";
import { ApiError, validationError } from "@/lib/database/errors";
import { getSessionIdentity } from "@/lib/auth/session";
import { resolveActiveAppUser } from "@/lib/auth/context";
import {
  capabilities,
  orionConfigSchema,
  orionDiscardSchema,
  orionGrantAccessSchema,
  orionLinkSchema,
  orionWarehouseMapSchema,
} from "@/lib/validations/orion";
import { decryptSecret, encryptSecret, generateKeyId, generateSecret } from "./crypto";
import { authenticate, handleAccessCheck, handleDocumentState, handleInboundBatch, handleInboundEvent } from "./inbound";
import { processOutbox } from "./outbox";
import { linkCompany, type LinkRequest } from "./client";
import { buildJwks, buildLaunchClaims, errorPage, launchPage, safeReturnTo, signLaunchToken, validState, type AccessGrant } from "./sso";
import type { OrionDb } from "./types";

// Rotas da integração ORION no ATLAS (Next 16, route handlers). A regra
// mora no banco (0126/0127); aqui só HTTP ↔ banco, assinatura e SSO.

const ok = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status });
const adminDb = () => createAdminClient() as unknown as OrionDb;
const decrypt = (b64: string) => decryptSecret(b64);

function appUrl(request: NextRequest): string {
  return (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin).replace(/\/+$/, "");
}

function headersOf(request: NextRequest) {
  return { get: (n: string) => request.headers.get(n) };
}
function pathWithQuery(request: NextRequest): string {
  const u = new URL(request.url);
  return `${u.pathname}${u.search}`;
}

/** Dispara o processador da outbox logo após a resposta (§4.4). */
export function kickOutbox(): void {
  try {
    after(async () => {
      try {
        await processOutbox({ db: adminDb(), decrypt, maxRounds: 3 });
      } catch (error) {
        console.error("[orion] outbox:", (error as Error).message);
      }
    });
  } catch {
    // fora de um contexto de requisição: o cron cuida
  }
}

// ------------------------------------------------------------ servidor-a-servidor (ORION → ATLAS)
export async function postEvents(request: NextRequest) {
  try {
    const body = await request.text();
    const r = await handleInboundEvent({ db: adminDb(), decrypt }, { method: "POST", pathWithQuery: pathWithQuery(request), headers: headersOf(request), body });
    return NextResponse.json(r.body, { status: r.status });
  } catch (error) {
    console.error("[orion] events:", (error as Error).message);
    return NextResponse.json({ status: "rejected", event_id: null, error: { code: "internal_error", message: "Erro interno.", retryable: true } }, { status: 500 });
  }
}

export async function postEventsBatch(request: NextRequest) {
  try {
    const body = await request.text();
    const r = await handleInboundBatch({ db: adminDb(), decrypt }, { method: "POST", pathWithQuery: pathWithQuery(request), headers: headersOf(request), body });
    return NextResponse.json(r.body, { status: r.status });
  } catch (error) {
    console.error("[orion] events/batch:", (error as Error).message);
    return NextResponse.json({ status: "rejected", event_id: null, error: { code: "internal_error", message: "Erro interno.", retryable: true } }, { status: 500 });
  }
}

export async function getAccess(request: NextRequest) {
  try {
    const r = await handleAccessCheck({ db: adminDb(), decrypt }, { method: "GET", pathWithQuery: pathWithQuery(request), headers: headersOf(request), body: "" }, request.nextUrl.searchParams.get("atlas_user_id"));
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[orion] access:", (error as Error).message);
    return NextResponse.json({ error: { code: "internal_error", retryable: true } }, { status: 500 });
  }
}

export async function getCapabilities(request: NextRequest) {
  const auth = await authenticate({ db: adminDb(), decrypt }, { method: "GET", pathWithQuery: pathWithQuery(request), headers: headersOf(request), body: "" });
  if (!auth.ok) return NextResponse.json(auth.result.body, { status: auth.result.status });
  return NextResponse.json(capabilities());
}

export async function getDocument(request: NextRequest, context: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await context.params;
  const r = await handleDocumentState({ db: adminDb(), decrypt }, { method: "GET", pathWithQuery: pathWithQuery(request), headers: headersOf(request), body: "" }, type, id);
  return NextResponse.json(r.body, { status: r.status });
}

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** GET (Vercel Cron) ou POST /api/integrations/orion/v1/outbox/process — protegido por CRON_SECRET. */
export async function runOutbox(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const stats = await processOutbox({ db: adminDb(), decrypt });
    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    console.error("[orion] outbox:", (error as Error).message);
    return NextResponse.json({ ok: false, error: "Falha ao processar a outbox." }, { status: 500 });
  }
}

// ------------------------------------------------------------ JWKS e SSO
export function getJwks() {
  try {
    return NextResponse.json(buildJwks(), { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (error) {
    console.error("[orion] jwks:", (error as Error).message);
    return NextResponse.json({ keys: [] }, { status: 500 });
  }
}

function html(page: { html: string; headers: Record<string, string> }, status = 200) {
  return new NextResponse(page.html, { status, headers: page.headers });
}

/** Fluxo A (launch) e B (authorize, com state) — §2.3. */
export async function ssoLaunch(request: NextRequest, withState: boolean) {
  const identity = await getSessionIdentity().catch(() => null);
  if (!identity) {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login, 303);
  }
  const state = withState ? validState(request.nextUrl.searchParams.get("state")) : null;
  if (withState && !state) return html(errorPage("invalid_state", 400), 400);
  const user = await resolveActiveAppUser(identity.authUserId);
  if (!user.data) return html(errorPage("user_inactive"), 403);
  if (!process.env.ATLAS_SSO_PRIVATE_JWK) return html(errorPage("not_configured", 503), 503);
  const { data, error } = await adminDb().rpc("fn_orion_access_status", { p_company_id: user.data.company_id, p_user_id: user.data.id });
  if (error) return html(errorPage("internal", 500), 500);
  const access = data as Record<string, unknown> & { active: boolean; reason?: string; orion_url?: string; orion_company_id?: string };
  if (!access.active || !access.orion_url || !access.orion_company_id) return html(errorPage(access.reason ?? "access_revoked"), 403);
  const grant: AccessGrant = {
    atlas_user_id: user.data.id,
    atlas_company_id: user.data.company_id,
    orion_company_id: access.orion_company_id,
    email: String(access.email),
    name: String(access.name),
    orion_role: access.orion_role as AccessGrant["orion_role"],
    access_version: Number(access.access_version),
    warehouses: (access.warehouses as string[]) ?? [],
  };
  const claims = buildLaunchClaims({ issuer: appUrl(request), grant, returnTo: safeReturnTo(request.nextUrl.searchParams.get("return_to")), state });
  const token = await signLaunchToken(claims);
  return html(launchPage(access.orion_url, token));
}

/** Situação do próprio usuário (botão "Abrir ORION" e telas "Gerenciado pelo ORION"). */
export async function getMyOrion() {
  try {
    const { supabase } = await requireCompanyUser();
    const { data, error } = await supabase.rpc("fn_orion_my_access");
    if (error) throw dbError(error);
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

// ------------------------------------------------------------ admin da empresa
export async function getCompanyOverview() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const [integration, map, warehouses, access, users, counts] = await Promise.all([
      supabase.from("orion_integrations").select("company_id, status, orion_url, orion_company_id, key_id, stock_owner, sales_release_status, purchase_release_status, production_release_status, auto_send, require_invoice_before_ship, cutover_at, last_outbound_success_at, last_inbound_success_at, activated_at").eq("company_id", companyId).maybeSingle(),
      supabase.from("orion_warehouse_map").select("warehouse_id, orion_warehouse_code, integration_location_id").eq("company_id", companyId),
      supabase.from("warehouses").select("id, code, name, status").eq("company_id", companyId).order("code"),
      supabase.from("orion_user_access").select("user_id, orion_role, warehouses, status, version, granted_at, revoked_at, revoke_reason").eq("company_id", companyId),
      supabase.from("users").select("id, name, email, status").eq("company_id", companyId).order("name"),
      supabase.from("integration_outbox").select("status, created_at").eq("company_id", companyId).in("status", ["pending", "failed"]).order("created_at").limit(500),
    ]);
    if (integration.error) throw dbError(integration.error);
    const pending = (counts.data ?? []).filter((r) => r.status === "pending");
    return ok({
      integration: integration.data,
      warehouseMap: map.data ?? [],
      warehouses: warehouses.data ?? [],
      access: access.data ?? [],
      users: users.data ?? [],
      queue: {
        pending: pending.length,
        failed: (counts.data ?? []).filter((r) => r.status === "failed").length,
        oldestPendingAt: pending[0]?.created_at ?? null,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function putCompanyConfig(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const body = await parseJson(request, orionConfigSchema);
    const { error } = await supabase.rpc("fn_orion_update_config", {
      p_company_id: companyId,
      p_sales_release_status: body.salesReleaseStatus,
      p_purchase_release_status: body.purchaseReleaseStatus,
      p_production_release_status: body.productionReleaseStatus,
      p_auto_send: body.autoSend,
      p_require_invoice_before_ship: body.requireInvoiceBeforeShip,
    });
    if (error) throw dbError(error);
    kickOutbox();
    return ok({ saved: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function postWarehouseMap(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const body = await parseJson(request, orionWarehouseMapSchema);
    const { data, error } = await supabase.rpc("fn_orion_map_warehouse", { p_company_id: companyId, p_warehouse_id: body.warehouseId, p_orion_code: body.orionWarehouseCode });
    if (error) throw dbError(error);
    kickOutbox();
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function postGrantAccess(request: NextRequest) {
  try {
    const { supabase } = await requireCompanyUser();
    const body = await parseJson(request, orionGrantAccessSchema);
    const { data, error } = await supabase.rpc("fn_orion_grant_access", { p_user_id: body.userId, p_orion_role: body.orionRole, p_warehouses: body.warehouses });
    if (error) throw dbError(error);
    kickOutbox();
    return ok(data, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function deleteAccess(_request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    const { supabase } = await requireCompanyUser();
    const { userId } = await context.params;
    const { data, error } = await supabase.rpc("fn_orion_revoke_access", { p_user_id: userId });
    if (error) throw dbError(error);
    kickOutbox();
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function getEvents(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const sp = request.nextUrl.searchParams;
    const direction = sp.get("direction") === "in" ? "in" : "out";
    const status = sp.get("status");
    const type = sp.get("type");
    const doc = sp.get("document");
    const table = direction === "in" ? "integration_inbox" : "integration_outbox";
    let q = supabase.from(table).select("*").eq("company_id", companyId);
    if (status) q = q.eq("status", status);
    if (type) q = q.eq("event_type", type);
    if (doc && /^[0-9a-f-]{36}$/i.test(doc)) q = q.eq("aggregate_id", doc);
    const { data, error } = await q.order(direction === "in" ? "received_at" : "created_at", { ascending: false }).limit(200);
    if (error) throw dbError(error);
    return ok(data ?? []);
  } catch (error) {
    return jsonError(error);
  }
}

export async function postOutboxAction(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  try {
    const { supabase } = await requireCompanyUser();
    const { id, action } = await context.params;
    if (action === "retry") {
      const { error } = await supabase.rpc("fn_orion_outbox_retry", { p_id: id });
      if (error) throw dbError(error);
      kickOutbox();
    } else if (action === "discard") {
      const body = await parseJson(request, orionDiscardSchema);
      const { error } = await supabase.rpc("fn_orion_outbox_discard", { p_id: id, p_reason: body.reason });
      if (error) throw dbError(error);
    } else if (action === "reprocess") {
      const { data, error } = await supabase.rpc("fn_orion_inbox_reprocess", { p_event_id: id });
      if (error) throw dbError(error);
      return ok(data);
    } else {
      throw validationError("Ação desconhecida.");
    }
    return ok({ id, action });
  } catch (error) {
    return jsonError(error);
  }
}

export async function postInitialSnapshot() {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const { data, error } = await supabase.rpc("fn_orion_initial_snapshot", { p_company_id: companyId });
    if (error) throw dbError(error);
    kickOutbox();
    return ok(data);
  } catch (error) {
    return jsonError(error);
  }
}

export async function getReconciliation(request: NextRequest) {
  try {
    const { supabase, companyId } = await requireCompanyUser();
    const runs = await supabase.from("orion_reconciliation_runs").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(30);
    if (runs.error) throw dbError(runs.error);
    const runId = request.nextUrl.searchParams.get("run") ?? (runs.data?.[0]?.id as string | undefined);
    let items: Record<string, unknown>[] = [];
    if (runId) {
      const r = await supabase.from("orion_reconciliation_items").select("product_id, lot_code, warehouse_id, atlas_qty, orion_qty, delta").eq("run_id", runId).neq("delta", 0).limit(2000);
      if (r.error) throw dbError(r.error);
      items = r.data ?? [];
      const ids = [...new Set(items.map((i) => i.product_id as string))];
      if (ids.length) {
        const prods = await supabase.from("products").select("id, code, name").in("id", ids);
        const byId = new Map((prods.data ?? []).map((p) => [p.id as string, p]));
        items = items.map((i) => ({ ...i, product_code: byId.get(i.product_id as string)?.code ?? null, product_name: byId.get(i.product_id as string)?.name ?? null }));
      }
    }
    if (request.nextUrl.searchParams.get("format") === "csv") {
      const lines = ["produto;descricao;lote;deposito;atlas;orion;diferenca", ...items.map((i) => [i.product_code, i.product_name, i.lot_code ?? "", i.warehouse_id, i.atlas_qty, i.orion_qty, i.delta].map((v) => String(v ?? "").replace(/;/g, ",")).join(";"))];
      return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=reconciliacao-orion.csv" } });
    }
    return ok({ runs: runs.data ?? [], runId: runId ?? null, items });
  } catch (error) {
    return jsonError(error);
  }
}

/** POST /api/{sales,purchase,production}-orders/[id]/send-to-wms */
export function sendToWms(type: "sales_order" | "purchase_order" | "production_order") {
  return async (_request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    try {
      const { supabase } = await requireCompanyUser();
      const { id } = await context.params;
      const { data, error } = await supabase.rpc("fn_orion_send_document", { p_type: type, p_id: id });
      if (error) throw dbError(error);
      kickOutbox();
      return ok({ outboxId: data, wmsStatus: "queued" }, 202);
    } catch (error) {
      return jsonError(error);
    }
  };
}

// ------------------------------------------------------------ admin central (plataforma)
export async function getPlatformCompanyOrion(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const allowed = await supabase.rpc("has_platform_permission", { p_code: "platform.companies.view" });
    if (allowed.error || allowed.data !== true) throw new ApiError("FORBIDDEN", "Sem permissão (platform.companies.view).", 403);
    const admin = createAdminClient();
    const [mod, integ, out] = await Promise.all([
      admin.from("company_modules").select("contracted, enabled_by_company").eq("company_id", id).eq("module_code", "orion").maybeSingle(),
      admin.from("orion_integrations").select("status, orion_url, orion_company_id, key_id, stock_owner, cutover_at, last_outbound_success_at, last_inbound_success_at, activated_at, previous_secret_expires_at").eq("company_id", id).maybeSingle(),
      admin.from("integration_outbox").select("status").eq("company_id", id).in("status", ["pending", "failed"]).limit(1000),
    ]);
    return ok({
      module: mod.data ?? null,
      integration: integ.data ?? null,
      defaultOrionUrl: process.env.ORION_URL ?? null,
      installConfigured: !!(process.env.ORION_INSTALL_KEY_ID && process.env.ORION_INSTALL_SECRET),
      queue: { pending: (out.data ?? []).filter((r) => r.status === "pending").length, failed: (out.data ?? []).filter((r) => r.status === "failed").length },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Vincular (ou rotacionar o segredo) — POST {ORION}/api/atlas/v1/links com a
 * credencial de instalação; o segredo novo vai ao ORION uma única vez e fica
 * cifrado no ATLAS (o anterior vale por 24 h).
 */
export async function postPlatformCompanyOrion(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { supabase } = await requirePlatformMember();
    const { id } = await context.params;
    const [m1, m2] = await Promise.all([
      supabase.rpc("has_platform_permission", { p_code: "platform.modules.manage" }),
      supabase.rpc("has_platform_permission", { p_code: "platform.company_modules.manage" }),
    ]);
    if (m1.data !== true && m2.data !== true) throw new ApiError("FORBIDDEN", "Sem permissão (platform.company_modules.manage).", 403);
    const body = await parseJson(request, orionLinkSchema);
    const installKeyId = process.env.ORION_INSTALL_KEY_ID;
    const installSecret = process.env.ORION_INSTALL_SECRET;
    if (!installKeyId || !installSecret) throw new ApiError("NOT_CONFIGURED", "Defina ORION_INSTALL_KEY_ID e ORION_INSTALL_SECRET nesta instalação.", 503);
    const admin = createAdminClient();
    const company = await admin.rpc("fn_orion_payload_company", { p_company_id: id });
    if (company.error || !company.data) throw new ApiError("NOT_FOUND", "Empresa não encontrada.", 404);
    const existing = await admin.from("orion_integrations").select("key_id").eq("company_id", id).maybeSingle();
    const keyId = (existing.data?.key_id as string | undefined) ?? generateKeyId(id);
    const secret = generateSecret();
    const firstAdmin = await admin
      .from("users")
      .select("id, name, email, user_roles!inner(roles!inner(code))")
      .eq("company_id", id)
      .eq("status", "active")
      .eq("user_roles.roles.code", "admin")
      .limit(1)
      .maybeSingle();
    const { orionCompanyId } = await linkCompany({
      orionUrl: body.orionUrl,
      installKeyId,
      installSecret,
      request: {
        atlas_company_id: id,
        atlas_url: appUrl(request),
        key_id: keyId,
        secret,
        company: (company.data as { company: LinkRequest["company"] }).company,
        admin: firstAdmin.data ? { atlas_user_id: firstAdmin.data.id as string, email: firstAdmin.data.email as string, name: firstAdmin.data.name as string } : null,
      },
    });
    const { data, error } = await admin.rpc("fn_orion_link_company", {
      p_company_id: id,
      p_orion_url: body.orionUrl,
      p_key_id: keyId,
      p_secret_ciphertext_b64: encryptSecret(secret),
      p_orion_company_id: orionCompanyId,
      p_by: null,
    });
    if (error) throw dbError(error);
    kickOutbox();
    const d = data as { status: string; key_id: string; orion_company_id: string };
    return ok({ status: d.status, keyId: d.key_id, orionCompanyId: d.orion_company_id, rotated: !!existing.data });
  } catch (error) {
    if (error instanceof Error && !(error instanceof ApiError) && /ORION/.test(error.message)) {
      return jsonError(new ApiError("ORION_LINK_FAILED", error.message, 502));
    }
    return jsonError(error);
  }
}
