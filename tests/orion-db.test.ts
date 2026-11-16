// Integração ATLAS ↔ ORION no banco (PGlite com o esquema completo do
// ATLAS, migrations 0126/0127): vínculo, mapa de depósitos, acesso de
// funcionários, gatilhos da outbox (cadastros, pedidos, NF-e), carga
// inicial, aplicação de TODOS os eventos o2a.* das fixtures do contrato,
// idempotência, ordem, guarda de estoque e isolamento multiempresa.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { createAtlasDb, ownerQuery, pgliteDataClient, seedCompany, type SeededCompany } from "./helpers/atlas-pglite";

const id = (n: string) => `0a7a5000-0000-4000-8000-${n.padStart(12, "0")}`;
const ORION_CO = "0410e000-0000-4000-8000-000000000001";
const fx = (name: string) => JSON.parse(readFileSync(path.join(process.cwd(), "docs/contrato", name), "utf8")) as Record<string, unknown> & { payload: Record<string, unknown> };

type Client = ReturnType<typeof pgliteDataClient>;
let db: PGlite;
let A: SeededCompany;
let B: SeededCompany;
let svc: Client;
let adminA: Client;
let adminB: Client;

const num = (v: unknown) => Number(v);
async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  return (await ownerQuery<T>(db, sql, params))[0];
}
async function receive(env: Record<string, unknown>, company = A.companyId) {
  const r = await svc.rpc("fn_orion_receive_event", { p_company_id: company, p_envelope: env, p_reprocess: false });
  assert.equal(r.error, null, r.error?.message);
  return r.data as { http: number; body: { status: string; duplicate?: boolean; error?: { code: string; message: string; expected_sequence?: number } } };
}
async function applyOk(name: string, mutate?: (e: ReturnType<typeof fx>) => void) {
  const env = fx(name);
  mutate?.(env);
  const r = await receive(env);
  assert.ok(r.http === 202 || r.http === 200, `${name}: ${JSON.stringify(r)}`);
  return r;
}
async function balance(productId: string, warehouse: "801" | "802", lot: string | null = null) {
  const r = await one<{ q: string }>(
    `select coalesce(sum(b.on_hand),0) q from stock_balances b join orion_warehouse_map m on m.integration_location_id = b.location_id
     left join product_lots l on l.id = b.lot_id where b.product_id = $1 and m.warehouse_id = $2 and l.lot_number is not distinct from $3`,
    [productId, id(warehouse), lot]
  );
  return num(r.q);
}
async function outbox(type: string) {
  return ownerQuery<{ id: string; payload: Record<string, unknown>; aggregate_seq: string; status: string }>(
    db, "select id, payload, aggregate_seq, status from integration_outbox where company_id = $1 and event_type = $2 order by created_at, aggregate_seq", [A.companyId, type]);
}
async function markAllSent() {
  const rows = await ownerQuery<{ id: string }>(db, "select id from integration_outbox where status = 'pending' order by aggregate_seq");
  for (const r of rows) {
    const res = await svc.rpc("fn_orion_outbox_result", { p_id: r.id, p_ok: true, p_http_status: 202, p_error: null, p_retryable: false, p_response: null });
    assert.equal(res.error, null);
  }
}

/** Mesmas chaves e tipos (recursivo; null é compatível com qualquer tipo). */
function sameShape(actual: unknown, expected: unknown, where = "payload"): void {
  if (expected === null || actual === null) return;
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where}: esperado array`);
    if (expected.length && (actual as unknown[]).length) sameShape((actual as unknown[])[0], expected[0], `${where}[0]`);
    return;
  }
  if (typeof expected === "object") {
    assert.equal(typeof actual, "object", `${where}: esperado objeto`);
    assert.deepEqual(Object.keys(actual as object).sort(), Object.keys(expected as object).sort(), `${where}: chaves`);
    for (const k of Object.keys(expected as object)) sameShape((actual as Record<string, unknown>)[k], (expected as Record<string, unknown>)[k], `${where}.${k}`);
    return;
  }
  assert.equal(typeof actual, typeof expected, `${where}: tipo`);
}

describe("ORION no banco do ATLAS (PGlite)", () => {
  before(async () => {
    db = await createAtlasDb();
    A = await seedCompany(db, "Alfa Indústria", id("1"), id("101"));
    B = await seedCompany(db, "Beta Sem ORION");
    svc = pgliteDataClient(db, { role: "service_role" });
    adminA = pgliteDataClient(db, { role: "authenticated", sub: A.adminAuthId });
    adminB = pgliteDataClient(db, { role: "authenticated", sub: B.adminAuthId });
    const c = A.companyId;
    // Cadastros com os ids das fixtures.
    await ownerQuery(db, "insert into warehouses (id, company_id, code, name, type) values ($1, $3, 'CD-SP', 'CD São Paulo', 'standard'), ($2, $3, 'CD-RJ', 'CD Rio', 'standard')", [id("801"), id("802"), c]);
    for (const [n, code, name, batch] of [["201", "PA-1001", "Parafuso", true], ["202", "PA-1002", "Porca", false], ["203", "PA-1003", "Arruela", false], ["204", "KIT-500", "Kit", false]] as const) {
      await ownerQuery(db, "insert into products (id, company_id, code, sku, name, unit, unit_id, cost_price, batch_controlled) values ($1, $2, $3, $3, $4, 'UN', $5, 1, $6)", [id(n), c, code, name, A.unitId, batch]);
    }
    await ownerQuery(db, "update products set production_type = 'manufactured' where id = $1", [id("204")]);
    await ownerQuery(db, "insert into customers (id, company_id, code, name, document) values ($1, $2, 'CLI-0042', 'Beta Construções', '22333444000181')", [id("301"), c]);
    await ownerQuery(db, "insert into suppliers (id, company_id, code, legal_name, document) values ($1, $2, 'FOR-0007', 'Metalúrgica Gama', '33444555000149')", [id("401"), c]);
    // Estoque anterior ao ORION, num local comum do depósito 801.
    const loc = await one<{ id: string }>("insert into warehouse_locations (company_id, code, warehouse, warehouse_id, location_type) values ($1, 'A-01', 'CD-SP', $2, 'Prateleira') returning id", [c, id("801")]);
    const lot = await one<{ id: string }>("insert into product_lots (company_id, product_id, lot_number) values ($1, $2, 'L2610-01') returning id", [c, id("201")]);
    await ownerQuery(db, "select fn_post_stock_movement($1, $2, $3, 'RECEIPT', 1200, $4, 0.41)", [c, id("201"), loc.id, lot.id]);
    await ownerQuery(db, "select fn_post_stock_movement($1, $2, $3, 'RECEIPT', 80, null, 3.1)", [c, id("203"), loc.id]);
  });

  test("módulo orion nasce não contratado e as permissões orion.* ficam bloqueadas", async () => {
    const r = await adminA.rpc("has_permission", { p_company_id: A.companyId, p_code: "orion.access.manage" });
    assert.equal(r.data, false);
    const link = await svc.rpc("fn_orion_link_company", { p_company_id: A.companyId, p_orion_url: "https://orion.exemplo", p_key_id: "k", p_secret_ciphertext_b64: "AAAA", p_orion_company_id: ORION_CO, p_by: null });
    assert.match(link.error?.message ?? "", /não está contratado/);
  });

  test("vínculo: status activating, carga de cadastros na outbox e segredo fora do alcance de authenticated", async () => {
    await ownerQuery(db, "update company_modules set contracted = true, enabled_by_company = true where company_id = $1 and module_code = 'orion'", [A.companyId]);
    const link = await svc.rpc("fn_orion_link_company", { p_company_id: A.companyId, p_orion_url: "https://orion.exemplo/", p_key_id: "atlas-co-0a7a5000", p_secret_ciphertext_b64: Buffer.from("cifrado").toString("base64"), p_orion_company_id: ORION_CO, p_by: A.adminUserId });
    assert.equal(link.error, null, link.error?.message);
    const types = (await ownerQuery<{ event_type: string }>(db, "select distinct event_type from integration_outbox where company_id = $1", [A.companyId])).map((r) => r.event_type).sort();
    for (const t of ["company.upserted", "integration.activated", "unit.upserted", "product.upserted", "customer.upserted", "supplier.upserted"]) assert.ok(types.includes(t), t);
    const secret = await adminA.from("orion_integrations").select("secret_ciphertext").eq("company_id", A.companyId);
    assert.ok(secret.error, "authenticated não lê o segredo");
    const ok = await adminA.from("orion_integrations").select("status, key_id").eq("company_id", A.companyId).single();
    assert.equal((ok.data as { status: string }).status, "activating");
    const anon = await adminA.rpc("fn_orion_integration_secrets", { p_company_id: A.companyId, p_key_id: null });
    assert.ok(anon.error, "segredos só para service_role");
  });

  test("mapa de depósitos cria os locais ORION-<depósito>", async () => {
    for (const [w, code] of [["801", "DEP-01"], ["802", "DEP-02"]]) {
      const r = await adminA.rpc("fn_orion_map_warehouse", { p_company_id: A.companyId, p_warehouse_id: id(w), p_orion_code: code });
      assert.equal(r.error, null, r.error?.message);
    }
    const locs = await ownerQuery<{ code: string; managed_by: string }>(db, "select code, managed_by from warehouse_locations where company_id = $1 and code like 'ORION-%' order by code", [A.companyId]);
    assert.deepEqual(locs, [{ code: "ORION-CD-RJ", managed_by: "orion" }, { code: "ORION-CD-SP", managed_by: "orion" }]);
    const other = await adminB.rpc("fn_orion_map_warehouse", { p_company_id: A.companyId, p_warehouse_id: id("801"), p_orion_code: "X" });
    assert.ok(other.error, "admin de outra empresa não configura");
  });

  test("guarda de estoque: empresa ORION recusa movimento físico; outra empresa segue normal", async () => {
    const loc = await one<{ id: string }>("select id from warehouse_locations where company_id = $1 and code = 'A-01'", [A.companyId]);
    await assert.rejects(ownerQuery(db, "select fn_post_stock_movement($1, $2, $3, 'RECEIPT', 1)", [A.companyId, id("203"), loc.id]), /ESTOQUE_GERENCIADO_PELO_ORION/);
    const locB = await one<{ id: string }>("insert into warehouse_locations (company_id, code, warehouse, warehouse_id, location_type) values ($1, 'B-01', $2, $3, 'Prateleira') returning id", [B.companyId, B.warehouseCode, B.warehouseId]);
    const pB = await one<{ id: string }>("insert into products (company_id, code, name, unit, unit_id) values ($1, 'B-1', 'B', 'UN', $2) returning id", [B.companyId, B.unitId]);
    await ownerQuery(db, "select fn_post_stock_movement($1, $2, $3, 'RECEIPT', 5)", [B.companyId, pB.id, locB.id]);
  });

  test("acesso de funcionários: liberar (user_access.granted), checagem e isolamento", async () => {
    const g = await adminA.rpc("fn_orion_grant_access", { p_user_id: A.adminUserId, p_orion_role: "admin", p_warehouses: ["DEP-01"] });
    assert.equal(g.error, null, g.error?.message);
    const bad = await adminA.rpc("fn_orion_grant_access", { p_user_id: A.adminUserId, p_orion_role: "admin", p_warehouses: ["NAO-EXISTE"] });
    assert.ok(bad.error);
    const cross = await adminB.rpc("fn_orion_grant_access", { p_user_id: A.adminUserId, p_orion_role: "admin", p_warehouses: [] });
    assert.ok(cross.error, "admin de B não libera funcionário de A");
    const [ev] = await outbox("user_access.granted");
    sameShape(ev.payload, fx("a2o.user_access.granted.json").payload);
    // Ainda em ativação: acesso SSO só com integração ativa.
    const st = await svc.rpc("fn_orion_access_status", { p_company_id: A.companyId, p_user_id: A.adminUserId });
    assert.equal((st.data as { active: boolean }).active, false);
    const rlsB = await adminB.from("orion_user_access").select("user_id");
    assert.deepEqual(rlsB.data, [], "B não vê acessos de A");
    const outB = await adminB.from("integration_outbox").select("id");
    assert.deepEqual(outB.data, [], "B não vê a outbox de A");
  });

  test("payloads a2o de cadastros têm a forma das fixtures", async () => {
    const pairs: Array<[string, string]> = [
      ["company.upserted", "a2o.company.upserted.json"],
      ["integration.activated", "a2o.integration.activated.json"],
      ["unit.upserted", "a2o.unit.upserted.json"],
      ["product.upserted", "a2o.product.upserted.json"],
      ["customer.upserted", "a2o.customer.upserted.json"],
      ["supplier.upserted", "a2o.supplier.upserted.json"],
    ];
    for (const [type, file] of pairs) {
      const rows = await outbox(type);
      assert.ok(rows.length > 0, type);
      sameShape(rows.at(-1)!.payload, fx(file).payload, type);
    }
  });

  test("carga inicial: transfere para ORION-<depósito>, envia stock.initial_snapshot e ativa com reconciliação zerada", async () => {
    const blocked = await adminA.rpc("fn_orion_initial_snapshot", { p_company_id: A.companyId });
    assert.match(blocked.error?.message ?? "", /pendentes ou falhos/);
    await markAllSent();
    const r = await adminA.rpc("fn_orion_initial_snapshot", { p_company_id: A.companyId });
    assert.equal(r.error, null, r.error?.message);
    assert.equal(await balance(id("201"), "801", "L2610-01"), 1200);
    assert.equal(await balance(id("203"), "801"), 80);
    const snaps = await outbox("stock.initial_snapshot");
    assert.equal(snaps.length, 2, "um por depósito");
    sameShape(snaps[0].payload, fx("a2o.stock.initial_snapshot.json").payload);
    const env = fx("o2a.stock.balance_snapshot.json");
    env.id = "0410e000-0000-4000-8000-000000900201";
    Object.assign(env.payload, {
      snapshot_id: "0410e000-0000-4000-8000-000000000991", reason: "initial_load", as_of_event_id: null,
      items: [
        { atlas_product_id: id("201"), sku: "PA-1001", orion_warehouse_code: "DEP-01", lot_code: "L2610-01", on_hand: 1200, reserved: 0, blocked: 0, in_quarantine: 0 },
        { atlas_product_id: id("203"), sku: "PA-1003", orion_warehouse_code: "DEP-01", lot_code: null, on_hand: 80, reserved: 0, blocked: 0, in_quarantine: 0 },
      ],
    });
    (env.aggregate as { id: string }).id = "0410e000-0000-4000-8000-000000000991";
    await applyOk("o2a.stock.balance_snapshot.json", (e) => Object.assign(e, env));
    const st = await one<{ status: string }>("select status from orion_integrations where company_id = $1", [A.companyId]);
    assert.equal(st.status, "active");
    await markAllSent();
  });

  test("SSO/checagem: acesso ativo com as claims do contrato; revogar gera user_access.revoked", async () => {
    const st = await svc.rpc("fn_orion_access_status", { p_company_id: A.companyId, p_user_id: A.adminUserId });
    const d = st.data as Record<string, unknown>;
    assert.equal(d.active, true);
    assert.equal(d.orion_role, "admin");
    assert.equal(d.orion_company_id, ORION_CO);
    const my = await adminA.rpc("fn_orion_my_access");
    assert.equal((my.data as { active: boolean }).active, true);
    // outro funcionário: liberar e revogar
    const u2 = await one<{ id: string }>("insert into users (company_id, name, email, login) values ($1, 'Maria Souza', 'maria.souza@alfa.com.br', 'maria') returning id", [A.companyId]);
    assert.equal((await adminA.rpc("fn_orion_grant_access", { p_user_id: u2.id, p_orion_role: "supervisor", p_warehouses: ["DEP-01"] })).error, null);
    assert.equal((await adminA.rpc("fn_orion_revoke_access", { p_user_id: u2.id })).error, null);
    const rev = await svc.rpc("fn_orion_access_status", { p_company_id: A.companyId, p_user_id: u2.id });
    assert.deepEqual([(rev.data as { active: boolean }).active, (rev.data as { reason: string }).reason, (rev.data as { access_version: number }).access_version], [false, "access_revoked", 2]);
    const [ev] = await outbox("user_access.revoked");
    sameShape(ev.payload, fx("a2o.user_access.revoked.json").payload);
    // inativar no ATLAS também revoga
    await adminA.rpc("fn_orion_grant_access", { p_user_id: u2.id, p_orion_role: "operator", p_warehouses: [] });
    await ownerQuery(db, "update users set status = 'inactive' where id = $1", [u2.id]);
    const after = await ownerQuery<{ payload: { reason: string } }>(db, "select payload from integration_outbox where event_type = 'user_access.revoked' and aggregate_id = $1 order by aggregate_seq desc limit 1", [u2.id]);
    assert.equal(after[0].payload.reason, "user_inactive");
  });

  test("pedido de venda: aprovar enfileira sales_order.released (cadastros antes) com sequência por documento", async () => {
    const c = A.companyId;
    await ownerQuery(db, "insert into sales_orders (id, company_id, code, customer_id, status, expected_delivery_at, notes) values ($1, $2, 'PV-2026-00153', $3, 'pending_approval', '2026-11-18', 'Entregar no portão 2')", [id("501"), c, id("301")]);
    await ownerQuery(db, "insert into sales_order_items (id, company_id, order_id, product_id, description, unit, ordered_quantity, unit_price, created_at) values ($1, $3, $4, $5, 'Parafuso', 'UN', 500, 1, now()), ($2, $3, $4, $6, 'Arruela', 'UN', 40, 1, now() + interval '1 second')", [id("511"), id("512"), c, id("501"), id("201"), id("203")]);
    assert.equal((await outbox("sales_order.updated")).length, 0, "antes de enviar, itens não geram eventos");
    await ownerQuery(db, "update sales_orders set status = 'approved' where id = $1", [id("501")]);
    const so = await one<{ wms_status: string }>("select wms_status from sales_orders where id = $1", [id("501")]);
    assert.equal(so.wms_status, "queued");
    const [rel] = await outbox("sales_order.released");
    sameShape(rel.payload, fx("a2o.sales_order.released.json").payload);
    assert.equal(num(rel.aggregate_seq), 1);
    await markAllSent();
    assert.equal((await one<{ wms_status: string }>("select wms_status from sales_orders where id = $1", [id("501")])).wms_status, "sent");
    // alteração de quantidade → sales_order.updated (seq 2)
    await ownerQuery(db, "update sales_order_items set ordered_quantity = 450 where id = $1", [id("511")]);
    const [upd] = await outbox("sales_order.updated");
    sameShape(upd.payload, fx("a2o.sales_order.updated.json").payload);
    assert.equal(num(upd.aggregate_seq), 2);
    // reenviar manualmente: novo id, nova sequência
    const resend = await adminA.rpc("fn_orion_send_document", { p_type: "sales_order", p_id: id("501") });
    assert.equal(resend.error, null, resend.error?.message);
    assert.equal((await outbox("sales_order.released")).length, 2);
    await markAllSent();
  });

  test("ordem na outbox: seq N só é reivindicado depois de N-1 enviado", async () => {
    await ownerQuery(db, "update sales_orders set notes = 'n1' where id = $1", [id("501")]);
    await ownerQuery(db, "update sales_orders set notes = 'n2' where id = $1", [id("501")]);
    const claim1 = await svc.rpc("fn_orion_outbox_claim", { p_limit: 100 });
    const mine = (claim1.data as Array<{ id: string; aggregate_id: string; aggregate_seq: number }>).filter((r) => r.aggregate_id === id("501"));
    assert.equal(mine.length, 1, "só o primeiro do agregado");
    const fail = await svc.rpc("fn_orion_outbox_result", { p_id: mine[0].id, p_ok: false, p_http_status: 503, p_error: "fora", p_retryable: true, p_response: null });
    assert.equal((fail.data as { status: string }).status, "pending");
    assert.ok((fail.data as { attempts: number }).attempts === 1);
    await ownerQuery(db, "update integration_outbox set next_attempt_at = now() where id = $1", [mine[0].id]);
    await svc.rpc("fn_orion_outbox_result", { p_id: mine[0].id, p_ok: true, p_http_status: 202, p_error: null, p_retryable: false, p_response: null });
    const claim2 = await svc.rpc("fn_orion_outbox_claim", { p_limit: 100 });
    const next = (claim2.data as Array<{ id: string; aggregate_id: string; aggregate_seq: number }>).filter((r) => r.aggregate_id === id("501"));
    assert.equal(next.length, 1);
    assert.ok(Number(next[0].aggregate_seq) > Number(mine[0].aggregate_seq));
    // 20 tentativas → failed
    await ownerQuery(db, "update integration_outbox set attempts = 19 where id = $1", [next[0].id]);
    const last = await svc.rpc("fn_orion_outbox_result", { p_id: next[0].id, p_ok: false, p_http_status: 500, p_error: "x", p_retryable: true, p_response: null });
    assert.equal((last.data as { status: string }).status, "failed");
    const retry = await adminA.rpc("fn_orion_outbox_retry", { p_id: next[0].id });
    assert.equal(retry.error, null);
    await markAllSent();
  });

  test("eventos de saída: accepted → picking → ready_to_invoice → NF-e → shipped baixa o estoque fiscal", async () => {
    await applyOk("o2a.outbound.accepted.json");
    assert.equal((await one<{ wms_status: string }>("select wms_status from sales_orders where id = $1", [id("501")])).wms_status, "accepted");
    await applyOk("o2a.outbound.picking_started.json");
    assert.deepEqual(await one("select status, wms_status from sales_orders where id = $1", [id("501")]), { status: "picking", wms_status: "picking" });
    await applyOk("o2a.outbound.ready_to_invoice.json");
    assert.deepEqual(await one("select status, wms_status from sales_orders where id = $1", [id("501")]), { status: "ready_to_ship", wms_status: "ready_to_invoice" });

    // NF-e autorizada → sales_invoice.authorized
    const est = await one<{ id: string }>("insert into fiscal_establishments (company_id, code, name, cnpj, tax_regime, state) values ($1, 'EST', 'Estab', '11444777000161', 'SIMPLES_NACIONAL', 'SP') returning id", [A.companyId]);
    const nat = await one<{ id: string }>("select id from fiscal_operation_natures where company_id = $1 limit 1", [A.companyId]);
    assert.ok(nat, "natureza de operação semeada");
    {
      await ownerQuery(db, "insert into fiscal_documents (id, company_id, fiscal_establishment_id, type, direction, status, issue_date, operation_nature_id, source_type, source_id, number, series, access_key) values ($1, $2, $3, 'NFE', 'SAIDA', 'READY', current_date, $4, 'sales_order', $5, 12345, '1', '35261111444777000161550010000123451000123456')", [id("551"), A.companyId, est.id, nat.id, id("501")]);
      await ownerQuery(db, "insert into fiscal_document_items (company_id, fiscal_document_id, product_id, description, ncm_code, cfop_code, origin_code, quantity, unit, unit_price, source_reference_id) values ($1, $2, $3, 'Parafuso', '73181500', '5102', '0', 450, 'UN', 1, $4)", [A.companyId, id("551"), id("201"), id("511")]);
      await ownerQuery(db, "update fiscal_documents set status = 'AUTHORIZED', authorized_at = now() where id = $1", [id("551")]);
      const [inv] = await outbox("sales_invoice.authorized");
      assert.ok(inv, "sales_invoice.authorized enfileirado");
      sameShape(inv.payload, fx("a2o.sales_invoice.authorized.json").payload);
    }

    // estoque para a expedição (lote L2611-07) chega por um ajuste do ORION
    await applyOk("o2a.stock.adjusted.json", (e) => {
      e.id = "0410e000-0000-4000-8000-000000900301";
      (e.aggregate as { id: string }).id = "0410e000-0000-4000-8000-000000000682";
      e.payload.items = [{ atlas_product_id: id("201"), sku: "PA-1001", lot_code: "L2611-07", orion_warehouse_code: "DEP-01", delta: 450 }];
    });
    assert.equal(await balance(id("201"), "801", "L2611-07"), 450);
    await applyOk("o2a.outbound.shipped.json");
    assert.equal(await balance(id("201"), "801", "L2611-07"), 0);
    const so = await one<{ status: string; wms_status: string }>("select status, wms_status from sales_orders where id = $1", [id("501")]);
    assert.deepEqual(so, { status: "partially_shipped", wms_status: "shipped" });
    const cost = await one<{ n: string }>("select count(*) n from cost_movements cm join stock_movements sm on sm.id = cm.stock_movement_id where sm.reference_type = 'SHIPMENT' and sm.company_id = $1", [A.companyId]);
    assert.ok(num(cost.n) >= 1, "custo médio registrado na baixa");
    // linha 512 cancelada pelo armazém (fixture usa seq 5, igual à de outbound.cancelled)
    await applyOk("o2a.outbound.line_cancelled.json");
    assert.equal((await one<{ status: string }>("select status from sales_orders where id = $1", [id("501")])).status, "shipped");
  });

  test("idempotência e ordem na entrada", async () => {
    const dup = await receive(fx("o2a.outbound.shipped.json"));
    assert.deepEqual([dup.http, dup.body.duplicate], [200, true]);
    assert.equal(await balance(id("201"), "801", "L2611-07"), 0, "reentrega não baixa de novo");
    const changed = fx("o2a.outbound.shipped.json");
    changed.payload.carrier = "Outra";
    const conflict = await receive(changed);
    assert.deepEqual([conflict.http, conflict.body.error?.code], [400, "idempotency_conflict"]);
    // mesmo agregado com sequência obsoleta (5 de outbound.cancelled = 5 já aplicado) ⇒ duplicate
    const stale = await receive(fx("o2a.outbound.cancelled.json"));
    assert.deepEqual([stale.http, stale.body.duplicate], [200, true]);
    // lacuna ⇒ out_of_order
    const gap = fx("o2a.outbound.cancelled.json");
    gap.id = "0410e000-0000-4000-8000-000000900399";
    (gap.aggregate as { sequence: number }).sequence = 9;
    const r = await receive(gap);
    assert.deepEqual([r.http, r.body.error?.code, r.body.error?.expected_sequence], [409, "out_of_order", 6]);
  });

  test("multiempresa: envelope de A com a credencial de B é recusado; nada muda em A", async () => {
    await ownerQuery(db, "update company_modules set contracted = true, enabled_by_company = true where company_id = $1 and module_code = 'orion'", [B.companyId]);
    await svc.rpc("fn_orion_link_company", { p_company_id: B.companyId, p_orion_url: "https://orion.exemplo", p_key_id: "atlas-co-b", p_secret_ciphertext_b64: "AAAA", p_orion_company_id: "0410e000-0000-4000-8000-0000000000b2", p_by: null });
    const env = fx("o2a.stock.adjusted.json");
    const r = await receive(env, B.companyId);
    assert.deepEqual([r.http, r.body.error?.code], [403, "company_mismatch"]);
    assert.equal((await ownerQuery(db, "select 1 from integration_inbox where event_id = $1", [env.id])).length, 0);
  });

  test("ajuste avulso e inventário aprovado", async () => {
    await applyOk("o2a.stock.adjusted.json");
    assert.equal(await balance(id("203"), "801"), 78);
    await applyOk("o2a.inventory.approved.json");
    assert.equal(await balance(id("201"), "801", "L2610-01"), 1195);
  });

  test("transferência entre depósitos ATLAS diferentes", async () => {
    await applyOk("o2a.stock.transferred.json");
    assert.equal(await balance(id("201"), "801", "L2610-01"), 895);
    assert.equal(await balance(id("201"), "802", "L2610-01"), 300);
  });

  test("compra: purchase_order.released, divergência, recebimento (entrada + custo + conta a pagar) e desembaraço", async () => {
    const c = A.companyId;
    await ownerQuery(db, "insert into purchase_orders (id, company_id, code, supplier_id, status, issued_at, expected_delivery_at) values ($1, $2, 'PC-2026-00088', $3, 'approved', '2026-11-10', '2026-11-20'), ($4, $2, 'PC-2026-00089', $3, 'approved', '2026-11-10', null)", [id("601"), c, id("401"), id("602")]);
    await ownerQuery(db, "insert into purchase_order_items (id, company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, $4, 'Parafuso', 'UN', 5000, 0.42)", [id("611"), c, id("601"), id("201")]);
    await ownerQuery(db, "update purchase_orders set status = 'sent' where id = $1", [id("601")]);
    const [rel] = await outbox("purchase_order.released");
    sameShape(rel.payload, fx("a2o.purchase_order.released.json").payload);
    await applyOk("o2a.divergence.registered.json");
    await applyOk("o2a.receipt.completed.json");
    assert.equal(await balance(id("201"), "801", "L2611-07"), 2990);
    const po = await one<{ status: string }>("select status from purchase_orders where id = $1", [id("601")]);
    assert.equal(po.status, "partially_received");
    const rec = await one<{ status: string; n: string }>("select r.status, (select count(*) from purchase_receipt_items i where i.receipt_id = r.id) n from purchase_receipts r where r.purchase_order_id = $1", [id("601")]);
    assert.equal(rec.status, "confirmed");
    await applyOk("o2a.import.cleared.json");
    assert.ok((await one<{ d: { import: unknown } }>("select wms_details d from purchase_orders where id = $1", [id("602")])).d.import);
    // cancelamento depois do envio → purchase_order.cancelled
    await ownerQuery(db, "update purchase_orders set status = 'cancelled' where id = $1", [id("601")]);
    const [can] = await outbox("purchase_order.cancelled");
    sameShape(can.payload, fx("a2o.purchase_order.cancelled.json").payload);
  });

  test("produção: production_order.released, materiais entregues, sobras, apontamento e conclusão sem backflush", async () => {
    const c = A.companyId;
    const bom = await adminA.rpc("fn_create_bom", { p_company_id: c, p_product_id: id("204"), p_reference_quantity: 1, p_unit_id: A.unitId, p_valid_from: "2026-01-01", p_valid_until: null, p_notes: null });
    assert.equal(bom.error, null, bom.error?.message);
    const bomId = (bom.data as { id: string }).id;
    await adminA.rpc("fn_add_bom_item", { p_bom_id: bomId, p_component_product_id: id("201"), p_quantity: 10, p_unit_id: A.unitId, p_scrap_percentage: 0, p_sequence: 1, p_is_optional: false, p_notes: null });
    await adminA.rpc("fn_activate_bom", { p_bom_id: bomId });
    const loc = await one<{ id: string }>("select integration_location_id id from orion_warehouse_map where warehouse_id = $1", [id("801")]);
    await ownerQuery(db, `insert into production_orders (id, company_id, product_id, bom_id, planned_quantity, unit_id, source_warehouse_id, consumption_location_id, target_warehouse_id, output_location_id, priority, status, planned_date)
      values ($1, $2, $3, $4, 100, $5, $6, $7, $6, $7, 'medium', 'planned', '2026-11-17')`, [id("701"), c, id("204"), bomId, A.unitId, id("801"), loc.id]);
    await ownerQuery(db, "insert into production_order_materials (id, company_id, production_order_id, component_product_id, planned_quantity, unit_id) values ($1, $2, $3, $4, 1000, $5)", [id("711"), c, id("701"), id("201"), A.unitId]);
    await ownerQuery(db, "update production_orders set status = 'released' where id = $1", [id("701")]);
    const [rel] = await outbox("production_order.released");
    sameShape(rel.payload, fx("a2o.production_order.released.json").payload);
    // repõe saldo do lote L2610-01 (895 em 801) para entregar 1000
    await applyOk("o2a.stock.adjusted.json", (e) => {
      e.id = "0410e000-0000-4000-8000-000000900302";
      (e.aggregate as { id: string }).id = "0410e000-0000-4000-8000-000000000683";
      e.payload.items = [{ atlas_product_id: id("201"), sku: "PA-1001", lot_code: "L2610-01", orion_warehouse_code: "DEP-01", delta: 105 }];
    });
    await applyOk("o2a.production.materials_delivered.json");
    assert.equal(await balance(id("201"), "801", "L2610-01"), 0);
    assert.equal((await one<{ status: string }>("select status from production_orders where id = $1", [id("701")])).status, "in_progress");
    await applyOk("o2a.production.leftovers_returned.json");
    assert.equal(await balance(id("201"), "801", "L2610-01"), 12);
    await applyOk("o2a.production.output_received.json");
    assert.equal(await balance(id("204"), "801", "OP31-2611"), 98);
    const done = await adminA.rpc("fn_complete_production_order", { p_production_order_id: id("701") });
    assert.equal(done.error, null, done.error?.message);
    assert.equal(await balance(id("201"), "801", "L2610-01"), 12, "sem backflush");
  });

  test("devolução do cliente, exportação, documento recusado e saída cancelada pelo armazém", async () => {
    await applyOk("o2a.customer_return.completed.json");
    assert.equal(await balance(id("201"), "801", "L2611-07"), 2990 + 18);
    await ownerQuery(db, "insert into sales_orders (id, company_id, code, customer_id, status) values ($1, $2, 'PV-2026-00154', $3, 'approved')", [id("502"), A.companyId, id("301")]);
    await applyOk("o2a.export.packed.json");
    assert.equal((await one<{ d: { export: { incoterm: string } } }>("select wms_details d from sales_orders where id = $1", [id("502")])).d.export.incoterm, "FOB");
    await applyOk("o2a.document.rejected.json", (e) => { (e.payload as Record<string, unknown>).atlas_document_id = id("502"); (e.aggregate as { id: string }).id = id("502"); });
    assert.deepEqual(await one("select wms_status, wms_last_error from sales_orders where id = $1", [id("502")]), { wms_status: "rejected", wms_last_error: "Produto PA-1003 não sincronizado" });
    await applyOk("o2a.outbound.cancelled.json", (e) => {
      e.id = "0410e000-0000-4000-8000-000000900398";
      (e.aggregate as { id: string; sequence: number }).id = "0410e000-0000-4000-8000-000000000502";
      (e.aggregate as { id: string; sequence: number }).sequence = 4;
      e.payload.atlas_sales_order_id = id("502");
    });
    const so = await one<{ status: string; wms_status: string }>("select status, wms_status from sales_orders where id = $1", [id("502")]);
    assert.deepEqual(so, { status: "approved", wms_status: "cancelled" });
  });

  test("reconciliação diária: espera o evento as_of e lista diferenças", async () => {
    const r = await applyOk("o2a.stock.balance_snapshot.json");
    assert.equal(r.http, 202);
    let run = await one<{ status: string }>("select status from orion_reconciliation_runs where snapshot_id = '0410e000-0000-4000-8000-000000000990'");
    assert.equal(run.status, "waiting_events");
    await applyOk("o2a.stock.adjusted.json", (e) => {
      e.id = "0410e000-0000-4000-8000-000000900120";
      (e.aggregate as { id: string }).id = "0410e000-0000-4000-8000-000000000684";
      e.payload.items = [{ atlas_product_id: id("203"), sku: "PA-1003", lot_code: null, orion_warehouse_code: "DEP-01", delta: 1 }];
    });
    run = await one("select status, divergent_items from orion_reconciliation_runs where snapshot_id = '0410e000-0000-4000-8000-000000000990'");
    assert.equal(run.status, "completed");
    const item = await one<{ atlas_qty: string; orion_qty: string; delta: string }>("select atlas_qty, orion_qty, delta from orion_reconciliation_items i join orion_reconciliation_runs r on r.id = i.run_id where r.snapshot_id = '0410e000-0000-4000-8000-000000000990' and i.lot_code = 'L2610-01' and i.warehouse_id = $1", [id("801")]);
    assert.deepEqual([num(item.atlas_qty), num(item.orion_qty), num(item.delta)], [12, 895, 883]);
  });

  test("referência desconhecida ⇒ 422 unknown_reference, inbox 'failed' sem efeito parcial", async () => {
    const env = fx("o2a.outbound.accepted.json");
    env.id = "0410e000-0000-4000-8000-000000900397";
    (env.aggregate as { id: string }).id = "0410e000-0000-4000-8000-000000000599";
    env.payload.atlas_sales_order_id = id("599");
    const r = await receive(env);
    assert.deepEqual([r.http, r.body.error?.code], [422, "unknown_reference"]);
    assert.equal((await one<{ status: string }>("select status from integration_inbox where event_id = $1", [env.id])).status, "failed");
    const rep = await adminA.rpc("fn_orion_inbox_reprocess", { p_event_id: env.id });
    assert.equal((rep.data as { http: number }).http, 422);
  });

  test("dock.appointment_created é ignorado", async () => {
    const env = fx("o2a.outbound.accepted.json");
    Object.assign(env, { id: "0410e000-0000-4000-8000-000000900396", type: "dock.appointment_created", aggregate: { type: "dock", id: "0410e000-0000-4000-8000-000000000777", sequence: 1 }, payload: {} });
    const r = await receive(env);
    assert.deepEqual([r.http, r.body.status], [200, "ignored"]);
  });

  test("cancelar o pedido enviado gera um único sales_order.cancelled (sem line_cancelled por linha)", async () => {
    const c = A.companyId;
    await ownerQuery(db, "insert into sales_orders (id, company_id, code, customer_id, status) values ($1, $2, 'PV-X', $3, 'pending_approval')", [id("503"), c, id("301")]);
    await ownerQuery(db, "insert into sales_order_items (id, company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, $4, 'P', 'UN', 3, 1)", [id("513"), c, id("503"), id("201")]);
    await ownerQuery(db, "update sales_orders set status = 'approved' where id = $1", [id("503")]);
    const before = (await outbox("sales_order.line_cancelled")).length;
    const r = await adminA.rpc("fn_cancel_sales_order", { p_order_id: id("503") });
    assert.equal(r.error, null, r.error?.message);
    assert.equal((await outbox("sales_order.line_cancelled")).length, before);
    const cancelled = (await outbox("sales_order.cancelled")).filter((e) => e.payload.atlas_sales_order_id === id("503"));
    assert.equal(cancelled.length, 1);
    sameShape(cancelled[0].payload, fx("a2o.sales_order.cancelled.json").payload);
    // line_cancelled avulso
    await ownerQuery(db, "update sales_order_items set cancelled_quantity = cancelled_quantity + 0 where id = $1", [id("513")]);
  });

  test("suspensão: módulo desabilitado ⇒ company.deactivated, revoga acessos, status suspended", async () => {
    await ownerQuery(db, "update company_modules set enabled_by_company = false where company_id = $1 and module_code = 'orion'", [A.companyId]);
    const st = await one<{ status: string }>("select status from orion_integrations where company_id = $1", [A.companyId]);
    assert.equal(st.status, "suspended");
    const [ev] = await outbox("company.deactivated");
    sameShape(ev.payload, fx("a2o.company.deactivated.json").payload);
    const acc = await svc.rpc("fn_orion_access_status", { p_company_id: A.companyId, p_user_id: A.adminUserId });
    assert.equal((acc.data as { reason: string }).reason, "module_disabled");
    await ownerQuery(db, "update company_modules set enabled_by_company = true where company_id = $1 and module_code = 'orion'", [A.companyId]);
    assert.equal((await one<{ status: string }>("select status from orion_integrations where company_id = $1", [A.companyId])).status, "active");
  });
});
