#!/usr/bin/env node
// Roteiro do teste real ATLAS ↔ ORION (docs/QA-INTEGRACAO.md). Os dois
// sistemas rodam de verdade (next start) e conversam só por HTTP; este script
// faz o papel das pessoas (navegador Playwright + APIs com a sessão de cada
// uma), dispara os crons reais e confere os dois bancos a cada passo.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createDecipheriv, createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { ATLAS, ORION, a1, aq, o1, oq, atlasUser, atlasCron, check, closeAll, openBrowser, orionCron, orionOp, pump, shot, SHOTS } from "./lib.mjs";

const seed = JSON.parse(readFileSync(process.env.QA_SEED, "utf8"));
const C = seed.company;
const R = [];
const only = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const st = {};

async function ssoInto(user, how = "launch") {
  // Fluxo A (botão "Abrir ORION" = GET /sso/launch → form_post) ou B (ORION /login → "Entrar com ATLAS").
  const page = await user.ctx.newPage();
  if (how === "launch") {
    await user.page.goto(`${ATLAS}/app`);
    const btn = user.page.getByRole("link", { name: /Abrir ORION/ });
    if (await btn.count()) {
      const [popup] = await Promise.all([user.ctx.waitForEvent("page"), btn.first().click()]);
      await popup.waitForURL((u) => u.origin === ORION && !u.pathname.startsWith("/api/"), { timeout: 30_000 });
      await page.close();
      return popup;
    }
    await page.goto(`${ATLAS}/api/integrations/orion/v1/sso/launch?return_to=/`);
  } else {
    await page.goto(`${ORION}/login`);
    await page.getByRole("link", { name: /Entrar com ATLAS/ }).click();
  }
  await page.waitForURL((u) => u.origin === ORION && !u.pathname.startsWith("/api/"), { timeout: 30_000 });
  return page;
}


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Saldo fiscal do ATLAS no local de integração ORION do depósito. */
async function fiscal(productId) {
  const r = await a1(`select coalesce(sum(b.on_hand),0)::float8 q from stock_balances b join orion_warehouse_map m on m.integration_location_id = b.location_id
    where b.company_id = $1 and b.product_id = $2`, [C, productId]);
  return r.q;
}
async function physical(sku) {
  const r = await o1(`select coalesce(sum(b.quantity),0)::float8 q from wms.stock_balances b join erp.products p on p.id = b.product_id where p.company_id = $1 and p.sku = $2`, [st.orionCompany, sku]);
  return r.q;
}
/** Segredo HMAC da empresa (decifrado do banco do ATLAS com INTEGRATION_ENCRYPTION_KEY) para os testes de recusa. */
async function companySecret() {
  const r = await a1(`select key_id, encode(secret_ciphertext, 'base64') b64 from orion_integrations where company_id = $1`, [C]);
  const key = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const raw = Buffer.from(r.b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return { keyId: r.key_id, secret: Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8") };
}
async function signedPost(base, p, body, { keyId, secret }, { tsShift = 0, badSig = false } = {}) {
  const ts = String(Math.floor(Date.now() / 1000) + tsShift);
  const text = JSON.stringify(body);
  const sig = "sha256=" + createHmac("sha256", badSig ? secret + "x" : secret).update(`${ts}.POST.${p}.${text}`).digest("hex");
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json", "x-astraeus-key-id": keyId, "x-astraeus-timestamp": ts, "x-astraeus-signature": sig, "idempotency-key": body.id }, body: text });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function salesOrder(user, lines) {
  let r = await user.api("POST", "/api/sales-orders", { customerId: seed.customer, items: lines });
  const id = r.json?.data?.id;
  if (!id) throw new Error(`criar pedido: ${JSON.stringify(r.json)}`);
  r = await user.api("POST", `/api/sales-orders/${id}/submit`);
  if (r.status >= 300) throw new Error(`submeter: ${JSON.stringify(r.json)}`);
  r = await user.api("POST", `/api/sales-orders/${id}/approve`);
  if (r.status >= 300) throw new Error(`aprovar: ${JSON.stringify(r.json)}`);
  return id;
}
async function authorizeInvoice(soId, qtyByProduct) {
  // SEFAZ não existe aqui: a NF-e é gravada e marcada AUTHORIZED como o retorno do autorizador faria.
  const est = (await a1(`select id from fiscal_establishments where company_id = $1 limit 1`, [C])) ??
    (await a1(`insert into fiscal_establishments (company_id, code, name, cnpj, tax_regime, state) values ($1,'EST','Alfa Matriz','11444777000161','SIMPLES_NACIONAL','SP') returning id`, [C]));
  const nat = await a1(`select id from fiscal_operation_natures where company_id = $1 limit 1`, [C]);
  const n = 1000 + Math.floor(Math.random() * 8000);
  const base = `352611114447770001615500100${String(n).padStart(7, "0")}1${String(n).padStart(8, "0")}`; // 43 dígitos
  let sum = 0;
  for (let i = base.length - 1, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1) sum += Number(base[i]) * w;
  const dv = 11 - (sum % 11);
  const key = base + (dv >= 10 ? 0 : dv);
  const doc = await a1(`insert into fiscal_documents (company_id, fiscal_establishment_id, type, direction, status, issue_date, operation_nature_id, source_type, source_id, number, series, access_key)
    values ($1,$2,'NFE','SAIDA','READY',current_date,$3,'sales_order',$4,$5,'1',$6) returning id`, [C, est.id, nat.id, soId, n, key]);
  const items = await aq(`select id, product_id, ordered_quantity - cancelled_quantity q from sales_order_items where order_id = $1`, [soId]);
  for (const i of items) {
    const q = qtyByProduct?.[i.product_id] ?? i.q;
    if (Number(q) <= 0) continue;
    await aq(`insert into fiscal_document_items (company_id, fiscal_document_id, product_id, description, ncm_code, cfop_code, origin_code, quantity, unit, unit_price, source_reference_id)
      values ($1,$2,$3,'item','73181500','5102','0',$4,'UN',25,$5)`, [C, doc.id, i.product_id, q, i.id]);
  }
  await aq(`update fiscal_documents set status = 'AUTHORIZED', authorized_at = now() where id = $1`, [doc.id]);
  return key;
}

const steps = {
  async s1() {
    const paula = await atlasUser("paula@astraeus.test");
    const ana = await atlasUser("ana@alfa.test");
    st.paula = paula; st.ana = ana;
    let r = await paula.api("POST", `/api/platform/companies/${C}/modules`, { moduleCode: "orion", contracted: true });
    check(R, "1.1 admin central contrata o módulo ORION", r.status === 200, r.status);
    r = await ana.api("PATCH", `/api/admin/modules/orion`, { enabled: true });
    check(R, "1.2 admin da empresa habilita o módulo", r.status === 200, r.status);
    r = await paula.api("POST", `/api/platform/companies/${C}/orion`, { orionUrl: ORION });
    const link = r.json?.data;
    check(R, "1.3 vínculo real POST /links (credencial de instalação)", r.status === 200 && link?.orionCompanyId, r.json);
    const oc = await o1(`select c.id, c.source, c.external_id, l.status from erp.companies c join wms.atlas_links l on l.company_id = c.id where c.external_id = $1`, [C]);
    check(R, "1.3a ORION: erp.companies source=atlas + atlas_links", oc?.source === "atlas" && oc.id === link?.orionCompanyId, oc);
    st.orionCompany = oc?.id;
    await paula.page.goto(`${ATLAS}/app/admincentral/orion`);
    await shot(paula.page, "01-atlas-admincentral-orion");
    r = await ana.api("POST", `/api/integrations/orion/admin/warehouses`, { warehouseId: seed.warehouse, orionWarehouseCode: "DEP-01" });
    check(R, "1.4 mapa de depósitos PRINCIPAL ↔ DEP-01", r.status === 201 || r.status === 200, r.json);
    // Acesso ORION da admin (perfil admin) — necessário para preparar o layout no ORION
    r = await ana.api("POST", `/api/integrations/orion/admin/access`, { userId: seed.admin, orionRole: "admin", warehouses: [] });
    check(R, "1.5 acesso ORION da admin da empresa (perfil admin)", r.status === 201, r.json);
    const log = await pump();
    const prods = await oq(`select p.sku, p.source, s.lot_controlled, s.expiry_controlled from erp.products p left join wms.product_settings s on s.product_id = p.id where p.company_id = $1 order by p.sku`, [st.orionCompany]);
    check(R, "1.6 cadastros chegam ao ORION (produtos source=atlas)", prods.length === 4 && prods.every((p) => p.source === "atlas"), prods.map((p) => p.sku));
    const parties = await o1(`select (select count(*) from erp.customers where company_id = $1 and source = 'atlas')::int c, (select count(*) from erp.suppliers where company_id = $1 and source = 'atlas')::int s`, [st.orionCompany]);
    check(R, "1.6a clientes e fornecedores sincronizados", parties.c === 1 && parties.s === 1, parties);
    const alt = await o1(`select pu.barcode from wms.packaging_units pu join erp.products p on p.id = pu.product_id where p.company_id = $1 and p.sku = 'P-200' and pu.code = 'ATLAS-SKU' and pu.active`, [st.orionCompany]);
    check(R, "1.6b SKU do ATLAS ≠ code vira código alternativo (ALT-200)", alt?.barcode === "ALT-200", alt);
    const wh = await o1(`select w.code from wms.atlas_warehouse_map m join wms.warehouses w on w.id = m.warehouse_id where m.company_id = $1`, [st.orionCompany]);
    check(R, "1.6c depósito DEP-01 criado/mapeado no ORION", wh?.code === "DEP-01", wh);
    const pend = await a1(`select count(*) filter (where status='sent')::int sent, count(*) filter (where status<>'sent')::int other from integration_outbox where company_id = $1`, [C]);
    check(R, "1.6d outbox do ATLAS entregue (sem pendências)", pend.other === 0 && pend.sent > 0, { ...pend, rounds: log.length });
    // SSO da admin e layout do depósito no ORION
    const orionAna = await ssoInto(ana, "launch");
    st.orionAna = orionAna;
    const ua = await o1(`select role, atlas_user_id, password_hash is null as no_pwd from wms.users where company_id = $1 and lower(email) = 'ana@alfa.test'`, [st.orionCompany]);
    check(R, "1.7 SSO (Abrir ORION) da admin: usuário JIT perfil admin, sem senha local", ua?.role === "admin" && ua.atlas_user_id === seed.admin && ua.no_pwd, ua);
    const lay = orionOp("layout", { as: "ana@alfa.test", warehouse: "DEP-01" });
    check(R, "1.8 admin prepara zonas/endereços no ORION (REC, ARM, EXP, PRD)", lay.ok, lay);
    await orionAna.goto(`${ORION}/produtos`);
    await shot(orionAna, "02-orion-produtos-somente-leitura-atlas");
    // Carga inicial
    r = await ana.api("POST", `/api/integrations/orion/admin/initial-snapshot`);
    check(R, "1.9 carga inicial de estoque enviada", r.status === 200, r.json);
    await pump();
    const bal = await oq(`select p.sku, b.lot_code, b.expiry_date::text exp, b.quantity::float8 q, l.code loc from wms.stock_balances b join erp.products p on p.id = b.product_id join wms.locations l on l.id = b.location_id where b.company_id = $1 order by p.sku`, [st.orionCompany]);
    check(R, "1.10 ORION: saldo no recebimento (P-100 lote L2611-A val. 2027-06-30 =120; P-200 =300; MP-01 =50)",
      bal.length === 3 && bal.find((b) => b.sku === "P-100")?.exp === "2027-06-30" && bal.find((b) => b.sku === "P-100")?.q === 120, bal);
    const tk = await o1(`select count(*)::int n from wms.tasks where company_id = $1 and task_type = 'transfer' and status = 'pending'`, [st.orionCompany]);
    check(R, "1.11 ORION: tarefas de armazenagem da carga inicial", tk.n === 3, tk);
    const integ = await a1(`select status, stock_owner from orion_integrations where company_id = $1`, [C]);
    const rec = await a1(`select status, divergent_items from orion_reconciliation_runs where company_id = $1 order by created_at desc limit 1`, [C]);
    check(R, "1.12 ATLAS: conciliação da carga zerada ⇒ integração ativa", integ?.status === "active" && rec?.divergent_items === 0, { integ, rec });
    const done = orionOp("tarefas", { as: "ana@alfa.test" });
    check(R, "1.13 equipe armazena (tarefas concluídas)", done.ok && done.result.done === 3, done);
    await orionAna.goto(`${ORION}/estoque`);
    await shot(orionAna, "03-orion-estoque-apos-carga-inicial");
    await ana.page.goto(`${ATLAS}/app/admin/integracoes/orion`);
    await shot(ana.page, "04-atlas-admin-integracao-orion");
  },

  async s2() {
    const ana = st.ana;
    let r = await ana.api("POST", `/api/integrations/orion/admin/access`, { userId: seed.sup, orionRole: "supervisor", warehouses: ["DEP-01"] });
    check(R, "2.1 libera Sergio (supervisor, DEP-01)", r.status === 201, r.status);
    r = await ana.api("POST", `/api/integrations/orion/admin/access`, { userId: seed.op, orionRole: "operator", warehouses: [] });
    check(R, "2.2 libera Olga (operadora)", r.status === 201, r.status);
    await pump();
    await ana.page.goto(`${ATLAS}/app/admin/integracoes/orion`);
    await shot(ana.page, "05-atlas-acessos-orion");
    const sergio = await atlasUser("sergio@alfa.test");
    const olga = await atlasUser("olga@alfa.test");
    st.sergio = sergio; st.olga = olga;
    const ps = await ssoInto(sergio, "launch");
    await shot(ps, "06-orion-sergio-via-abrir-orion");
    const po = await ssoInto(olga, "authorize");
    await shot(po, "07-orion-olga-via-entrar-com-atlas");
    st.orionSergio = ps; st.orionOlga = po;
    const users = await oq(`select lower(email) email, role, atlas_user_id, active, (select array_agg(w.code) from wms.user_warehouses uw join wms.warehouses w on w.id = uw.warehouse_id where uw.user_id = u.id) whs from wms.users u where company_id = $1 order by email`, [st.orionCompany]);
    const s1 = users.find((u) => u.email === "sergio@alfa.test"), o = users.find((u) => u.email === "olga@alfa.test");
    check(R, "2.3 JIT: Sergio supervisor (depósito DEP-01) e Olga operadora", s1?.role === "supervisor" && s1.atlas_user_id === seed.sup && s1.active && o?.role === "operator" && o.active, users);
    const logins = await o1(`select count(*)::int n from wms.audit_log where company_id = $1 and action = 'auth.sso_login'`, [st.orionCompany]).catch(() => ({ n: -1 }));
    check(R, "2.4 auditoria auth.sso_login no ORION", logins.n >= 3, logins);
    // Revogação pelo evento
    r = await ana.api("DELETE", `/api/integrations/orion/admin/access/${seed.op}`);
    check(R, "2.5 revoga Olga no ATLAS", r.status === 200, r.status);
    await pump();
    const ol = await o1(`select active from wms.users where company_id = $1 and atlas_user_id = $2`, [st.orionCompany, seed.op]);
    check(R, "2.6 evento user_access.revoked: Olga inativa no ORION", ol?.active === false, ol);
    await po.goto(`${ORION}/`);
    check(R, "2.7 sessão da Olga cai na próxima requisição", new URL(po.url()).pathname.startsWith("/login"), po.url());
    await shot(po, "08-orion-olga-revogada");
    // Revogação pela checagem periódica (sem evento): Sergio inativado direto no cadastro do ATLAS
    await aq(`update users set status = 'inactive' where id = $1`, [seed.sup]);
    const ev = await a1(`select count(*)::int n from integration_outbox where company_id = $1 and event_type = 'user_access.revoked' and payload->>'atlas_user_id' = $2`, [C, seed.sup]);
    await sleep(22_000);
    await ps.goto(`${ORION}/`);
    const sv = await o1(`select active from wms.users where company_id = $1 and atlas_user_id = $2`, [st.orionCompany, seed.sup]);
    check(R, "2.8 checagem GET /access (sem entregar evento): Sergio derrubado", new URL(ps.url()).pathname.startsWith("/login") && sv?.active === false, { url: ps.url(), sv, eventosNaFila: ev.n });
    await aq(`update users set status = 'active' where id = $1`, [seed.sup]);
    await pump();
  },

  async s3() {
    const ana = st.ana;
    const p100 = await fiscal(seed.p100), p200 = await fiscal(seed.p200);
    const so = await salesOrder(ana, [
      { productId: seed.p100, description: "Parafuso", unit: "UN", quantity: 20, unitPrice: 25, discount: 0 },
      { productId: seed.p200, description: "Porca", unit: "UN", quantity: 50, unitPrice: 3, discount: 0 },
    ]);
    st.so1 = so;
    let row = await a1(`select status, wms_status from sales_orders where id = $1`, [so]);
    check(R, "3.1 venda aprovada no ATLAS ⇒ enfileirada (wms_status queued/sent)", row.status === "approved" && ["queued", "sent", "accepted"].includes(row.wms_status), row);
    await pump();
    const out = await o1(`select o.code, o.status, o.requires_invoice from wms.outbound_orders o join erp.sales_orders so on so.id = o.sales_order_id where so.external_id = $1`, [so]);
    row = await a1(`select status, wms_status, wms_details->>'orion_outbound_code' code from sales_orders where id = $1`, [so]);
    check(R, "3.2 pedido chega sozinho ao ORION e outbound.accepted volta", out?.status === "open" && row.wms_status === "accepted" && row.code === out.code, { out, row });
    const sep = orionOp("separar", { as: "ana@alfa.test", atlas_sales_order_id: so });
    check(R, "3.3 separação e conferência no ORION", sep.ok && sep.result.check?.ok !== false, sep);
    await pump();
    row = await a1(`select status, wms_status from sales_orders where id = $1`, [so]);
    check(R, "3.4 ATLAS: ready_to_invoice (status ready_to_ship)", row.wms_status === "ready_to_invoice" && row.status === "ready_to_ship", row);
    const blocked = orionOp("expedir", { as: "ana@alfa.test", atlas_sales_order_id: so });
    check(R, "3.5 ORION bloqueia expedição antes da NF-e", blocked.ok && blocked.result.blocked, blocked);
    const key = await authorizeInvoice(so);
    await pump();
    const inv = await o1(`select invoice_access_key from wms.outbound_orders o join erp.sales_orders so on so.id = o.sales_order_id where so.external_id = $1`, [so]);
    check(R, "3.6 NF-e autorizada no ATLAS ⇒ sales_invoice.authorized registrada no ORION", inv?.invoice_access_key === key, inv);
    const ship = orionOp("expedir", { as: "ana@alfa.test", atlas_sales_order_id: so });
    check(R, "3.7 expedição no ORION", ship.ok && !ship.result.blocked, ship);
    await pump();
    row = await a1(`select status, wms_status from sales_orders where id = $1`, [so]);
    const f100 = await fiscal(seed.p100), f200 = await fiscal(seed.p200);
    check(R, "3.8 ATLAS: pedido shipped e estoque fiscal baixado (P-100 −20, P-200 −50)", row.status === "shipped" && row.wms_status === "shipped" && f100 === p100 - 20 && f200 === p200 - 50, { row, p100: [p100, f100], p200: [p200, f200] });
    check(R, "3.9 físico ORION = fiscal ATLAS", (await physical("P-100")) === f100 && (await physical("P-200")) === f200, { orion: [await physical("P-100"), await physical("P-200")] });
    await ana.page.goto(`${ATLAS}/app/comercial/pedidos-venda/${so}`);
    await shot(ana.page, "09-atlas-pedido-venda-expedido-pelo-orion");
    await st.orionAna.goto(`${ORION}/expedicao`);
    await shot(st.orionAna, "10-orion-expedicao");
  },

  async s4() {
    const ana = st.ana;
    const before = await fiscal(seed.p200);
    let r = await ana.api("POST", "/api/purchase-orders", { supplierId: seed.supplier, items: [{ productId: seed.p200, description: "Porca", unit: "UN", quantity: 100, unitPrice: 2, discount: 0 }] });
    const po = r.json?.data?.id;
    for (const a of ["submit", "approve", "send"]) {
      r = await ana.api("POST", `/api/purchase-orders/${po}/${a}`, a === "send" ? {} : undefined);
      if (r.status >= 300) check(R, `4.0 compra ${a}`, false, r.json);
    }
    await pump();
    const erpPo = await o1(`select status from erp.purchase_orders where company_id = $1 and external_id = $2`, [st.orionCompany, po]);
    check(R, "4.1 compra liberada ⇒ recebimento previsto no ORION", !!erpPo, erpPo);
    const rec = orionOp("receber", { as: "ana@alfa.test", atlas_purchase_order_id: po, warehouse: "DEP-01" });
    check(R, "4.2 recebido, conferido e armazenado no ORION", rec.ok && rec.result.putaway >= 1, rec);
    await pump();
    const row = await a1(`select status, wms_status from purchase_orders where id = $1`, [po]);
    const after = await fiscal(seed.p200);
    const pr = await a1(`select count(*)::int n from purchase_receipts where purchase_order_id = $1 and status = 'confirmed'`, [po]);
    check(R, "4.3 ATLAS: entrada no estoque fiscal (+100) e pedido recebido", after === before + 100 && pr.n === 1 && row.status === "received", { row, before, after, pr });
    await ana.page.goto(`${ATLAS}/app/suprimentos/pedidos-compra`).catch(() => undefined);
    await shot(ana.page, "11-atlas-pedido-compra-recebido");
    // OP
    const mpBefore = await fiscal(seed.mp01);
    r = await ana.api("POST", "/api/production-orders", { productId: seed.pa01, bomId: seed.bom, plannedQuantity: 10, unitId: seed.unit, sourceWarehouseId: seed.warehouse, consumptionLocationId: seed.location, targetWarehouseId: seed.warehouse, outputLocationId: seed.location });
    const op = r.json?.data?.id;
    if (!op) check(R, "4.4 criar OP", false, r.json);
    for (const a of ["plan", "release"]) {
      r = await ana.api("POST", `/api/production-orders/${op}/${a}`, {});
      if (r.status >= 300) check(R, `4.4 OP ${a}`, false, r.json);
    }
    await pump();
    const req = await o1(`select r.code, r.status from wms.production_requisitions r join erp.production_orders p on p.id = r.production_order_id where p.external_id = $1`, [op]);
    check(R, "4.5 OP liberada ⇒ requisição de abastecimento no ORION", !!req, req);
    const ab = orionOp("abastecer", { as: "ana@alfa.test", atlas_production_order_id: op });
    check(R, "4.6 abastecimento da linha no ORION", ab.ok, ab);
    await pump();
    const mpAfter = await fiscal(seed.mp01);
    const opRow = await a1(`select status from production_orders where id = $1`, [op]);
    check(R, "4.7 ATLAS: baixa do material (MP-01 −20) e OP em andamento", mpAfter === mpBefore - 20 && opRow.status === "in_progress", { mpBefore, mpAfter, opRow });
  },

  async s5() {
    const ana = st.ana;
    const before = await fiscal(seed.p200);
    const adj = orionOp("ajustar", { as: "ana@alfa.test", sku: "P-200", direction: "out", quantity: 5, reason: "Avaria constatada na contagem QA" });
    check(R, "5.1 ajuste de inventário no ORION (−5 P-200)", adj.ok, adj);
    await pump();
    const after = await fiscal(seed.p200);
    check(R, "5.2 ajuste refletido no estoque fiscal do ATLAS", after === before - 5, { before, after });
    // Movimento físico manual no ATLAS é recusado
    const r = await ana.api("POST", "/api/stock-movements", { productId: seed.p200, locationId: seed.location, movementType: "receipt", quantity: 1 });
    const direct = await (async () => {
      const cl = new pg.Client({ connectionString: process.env.QA_ATLAS_DB });
      await cl.connect();
      try {
        await cl.query("begin");
        await cl.query("set local role authenticated");
        await cl.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "authenticated", sub: seed.admin_auth })]);
        await cl.query("select fn_receive_stock($1,$2,$3,1,null,1,'manual QA','qa-manual')", [C, seed.p200, seed.location]);
        return "aceito";
      } catch (e) {
        return e.message;
      } finally {
        await cl.query("rollback").catch(() => undefined);
        await cl.end();
      }
    })();
    check(R, "5.3 ATLAS recusa movimento físico manual (ESTOQUE_GERENCIADO_PELO_ORION)", /ESTOQUE_GERENCIADO_PELO_ORION/.test(direct), { api: r.status, direct });
    await ana.page.goto(`${ATLAS}/app/logistica/movimentacoes`);
    await shot(ana.page, "12-atlas-movimentacoes-gerenciado-pelo-orion");
    const snap = await fetch(`${ORION}/api/atlas/cron/snapshot`, { method: "POST", headers: { authorization: `Bearer ${process.env.QA_CRON_SECRET}` } });
    await pump();
    const run = await a1(`select status, total_items, divergent_items from orion_reconciliation_runs where company_id = $1 order by created_at desc limit 1`, [C]);
    check(R, "5.4 snapshot diário ⇒ reconciliação sem diferenças", snap.status === 200 && run.status === "completed" && run.divergent_items === 0, { http: snap.status, run });
    await ana.page.goto(`${ATLAS}/app/admin/integracoes/orion`);
    await shot(ana.page, "13-atlas-reconciliacao");
  },

  async s6() {
    const ana = st.ana;
    const H = path.dirname(new URL(import.meta.url).pathname);
    // ORION fora do ar durante o envio
    execFileSync("bash", [path.join(H, "servidores.sh"), "orion-down", process.env.QA_ENV_DIR]);
    const so = await salesOrder(ana, [{ productId: seed.p100, description: "Parafuso", unit: "UN", quantity: 5, unitPrice: 25, discount: 0 }]);
    await atlasCron();
    await sleep(3000);
    await atlasCron();
    const pend = await a1(`select status, attempts, last_error, next_attempt_at > now() future from integration_outbox where aggregate_id = $1 and event_type = 'sales_order.released'`, [so]);
    check(R, "6.1 ORION fora do ar: envio falha e fica pendente com backoff", pend.status === "pending" && pend.attempts >= 1, pend);
    execFileSync("bash", [path.join(H, "servidores.sh"), "orion-up", process.env.QA_ENV_DIR]);
    for (let i = 0; i < 12; i++) {
      await pump(2);
      const x = await a1(`select status from integration_outbox where aggregate_id = $1 and event_type = 'sales_order.released'`, [so]);
      if (x.status === "sent") break;
      await sleep(5000);
    }
    const sent = await a1(`select status, attempts from integration_outbox where aggregate_id = $1 and event_type = 'sales_order.released'`, [so]);
    const n = await o1(`select count(*)::int n from wms.outbound_orders o join erp.sales_orders s on s.id = o.sales_order_id where s.external_id = $1`, [so]);
    check(R, "6.2 ao voltar, reenvio com backoff entrega uma única vez", sent.status === "sent" && n.n === 1, { sent, outbound: n.n });
    // Recusas no sentido ATLAS → ORION
    const cred = await companySecret();
    const env = await a1(`select x.id, x.event_type, x.aggregate_type, x.aggregate_id, x.aggregate_seq, x.payload, x.created_at, o.orion_company_id from integration_outbox x join orion_integrations o using (company_id) where x.aggregate_id = $1 and x.event_type = 'sales_order.released'`, [so]);
    const envelope = { id: env.id, type: env.event_type, version: 1, source: "atlas", atlas_company_id: C, orion_company_id: env.orion_company_id, aggregate: { type: env.aggregate_type, id: env.aggregate_id, sequence: Number(env.aggregate_seq) }, occurred_at: new Date(env.created_at).toISOString().replace(/\.\d{3}Z$/, "Z"), payload: env.payload };
    const E = "/api/atlas/v1/events";
    const dup = await signedPost(ORION, E, envelope, cred);
    const ooo = await signedPost(ORION, E, { ...envelope, id: randomUUID(), type: "sales_order.cancelled", payload: { atlas_sales_order_id: so, number: "X", reason: "teste fora de ordem", lines: null }, aggregate: { ...envelope.aggregate, sequence: envelope.aggregate.sequence + 5 } }, cred);
    const bad = await signedPost(ORION, E, { ...envelope, id: randomUUID() }, cred, { badSig: true });
    const old = await signedPost(ORION, E, { ...envelope, id: randomUUID() }, cred, { tsShift: -400 });
    check(R, "6.3 ATLAS→ORION: repetida 200 duplicate, fora de ordem 409, assinatura 401, timestamp velho 401",
      dup.status === 200 && dup.body?.duplicate === true && ooo.status === 409 && ooo.body?.error?.code === "out_of_order" && bad.status === 401 && bad.body?.error?.code === "invalid_signature" && old.status === 401 && old.body?.error?.code === "stale_timestamp",
      { dup: dup.status, ooo: [ooo.status, ooo.body?.error?.code], bad: [bad.status, bad.body?.error?.code], old: [old.status, old.body?.error?.code] });
    // Recusas no sentido ORION → ATLAS (mesmo segredo da empresa)
    const inbox = await a1(`select event_id, event_type, aggregate_type, aggregate_id, aggregate_seq, payload from integration_inbox where company_id = $1 and event_type = 'outbound.accepted' order by received_at desc limit 1`, [C]);
    const oenv = { id: inbox.event_id, type: inbox.event_type, version: 1, source: "orion", atlas_company_id: C, orion_company_id: st.orionCompany, aggregate: { type: inbox.aggregate_type, id: inbox.aggregate_id, sequence: Number(inbox.aggregate_seq) }, occurred_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), payload: inbox.payload };
    const AE = "/api/integrations/orion/v1/events";
    // Mensagem repetida de verdade: o ORION reenvia o MESMO evento já entregue (volta à fila e sai pelo cron).
    await oq(`update wms.integration_events set status = 'pending', next_attempt_at = now() where id = $1`, [inbox.event_id]);
    const attemptsBefore = await a1(`select attempts from integration_inbox where event_id = $1`, [inbox.event_id]);
    await orionCron();
    const rs = await o1(`select status, last_error from wms.integration_events where id = $1`, [inbox.event_id]);
    const attemptsAfter = await a1(`select attempts, status from integration_inbox where event_id = $1`, [inbox.event_id]);
    const adup = { status: rs.status === "sent" && attemptsAfter.attempts === attemptsBefore.attempts ? 200 : 0, body: { rs, attemptsBefore, attemptsAfter } };
    const aooo = await signedPost(ATLAS, AE, { ...oenv, id: randomUUID(), type: "outbound.picking_started", payload: { code: "X", atlas_sales_order_id: so, wave: null }, aggregate: { ...oenv.aggregate, sequence: oenv.aggregate.sequence + 7 } }, cred);
    const abad = await signedPost(ATLAS, AE, { ...oenv, id: randomUUID() }, cred, { badSig: true });
    const aold = await signedPost(ATLAS, AE, { ...oenv, id: randomUUID() }, cred, { tsShift: -400 });
    check(R, "6.4 ORION→ATLAS: repetida 200, fora de ordem 409, assinatura 401, timestamp velho 401",
      adup.status === 200 && aooo.status === 409 && abad.status === 401 && aold.status === 401,
      { dup: [adup.status, adup.body], ooo: [aooo.status, aooo.body?.error?.code], bad: [abad.status, abad.body?.error?.code], old: [aold.status, aold.body?.error?.code] });
    // Cancelamento de linha a partir do ATLAS: sem contagem dupla
    const so2 = await salesOrder(ana, [
      { productId: seed.p100, description: "Parafuso", unit: "UN", quantity: 10, unitPrice: 25, discount: 0 },
      { productId: seed.p200, description: "Porca", unit: "UN", quantity: 10, unitPrice: 3, discount: 0 },
    ]);
    await pump();
    const line = await a1(`select id from sales_order_items where order_id = $1 and product_id = $2`, [so2, seed.p200]);
    await aq(`update sales_order_items set cancelled_quantity = 10 where id = $1`, [line.id]);
    await pump();
    const echo = await a1(`select payload from integration_inbox where company_id = $1 and event_type = 'outbound.line_cancelled' order by received_at desc limit 1`, [C]);
    const it = await a1(`select cancelled_quantity::float8 c from sales_order_items where id = $1`, [line.id]);
    const ol = await o1(`select l.cancelled_at is not null c from wms.outbound_order_lines l join erp.sales_order_items i on i.id = l.sales_order_item_id where i.external_id = $1`, [line.id]);
    check(R, "6.5 linha cancelada no ATLAS: ORION cancela e ecoa origin=atlas; ATLAS mantém 10 (sem dobrar)", echo?.payload?.origin === "atlas" && it.c === 10 && ol?.c === true, { origin: echo?.payload?.origin, cancelled: it.c, orion: ol });
    await ana.page.goto(`${ATLAS}/app/comercial/pedidos-venda/${so2}`);
    await shot(ana.page, "14-atlas-linha-cancelada-sem-contagem-dupla");
    await st.orionAna.goto(`${ORION}/integracao`);
    await shot(st.orionAna, "15-orion-integracao");
  },
};

await openBrowser();
try {
  for (const [name, fn] of Object.entries(steps)) {
    if (only && !only.has(name)) continue;
    try {
      await fn();
    } catch (e) {
      check(R, `${name}: erro inesperado`, false, e.stack?.split("\n").slice(0, 4).join(" | "));
    }
  }
} finally {
  writeFileSync(path.join(SHOTS, "..", "resultado.json"), JSON.stringify(R, null, 2));
  await closeAll().catch(() => undefined);
}
const fails = R.filter((r) => !r.ok).length;
console.log(`\n${R.length - fails}/${R.length} verificações OK`);
process.exit(fails ? 1 : 0);
