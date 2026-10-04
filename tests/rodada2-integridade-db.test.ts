// Rodada 2 do teste com 48 usuários em 7 empresas — regras das migrations
// 0081–0088 executadas de verdade no PostgreSQL com o esquema do ATLAS.ERP.
// POC_DATABASE_OWNER_URL: conexão do DONO de um banco DESCARTÁVEL (nunca
// produção). Tudo numa única transação desfeita no fim.
//
// A concorrência real (duas sessões ao mesmo tempo) é comprovada pelo roteiro
// E2E da rodada (docs/homologacao/RELATORIO-TESTE-48-USUARIOS-7-EMPRESAS.md,
// rodada 2). Aqui ficam as garantias que não dependem do relógio: o índice
// único recusa o 2º título, a 2ª separação/expedição é recusada, a reserva é
// consumida na expedição, o cancelamento depois da separação libera a
// reserva, a numeração/autorização fiscal e a simulação.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";

describe("rodada 2 — integridade do pedido (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const operator = randomUUID();
  let product = "";
  let customer = "";
  let location = "";
  let otherLocation = "";
  let warehouse = "";

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const asOwner = async () => {
    await db.query("reset role");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
  };
  const as = async (sub: string) => {
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
  };
  /** Executa esperando erro, sem perder a transação do teste. */
  const rejects = async (sql: string, params: unknown[], pattern: RegExp) => {
    const sp = `sp_${Math.random().toString(36).slice(2, 8)}`;
    await db.query(`savepoint ${sp}`);
    await assert.rejects(db.query(sql, params), pattern);
    await db.query(`rollback to savepoint ${sp}`);
  };
  const newProduct = async (code: string, qty: number, loc = location, unit = "UN") => {
    await asOwner();
    const id = (await one<{ id: string }>("insert into public.products (company_id, code, name, unit, status) values ($1, $2 || '-' || substr(md5(random()::text), 1, 6), 'Produto do teste da rodada 2', $3, 'active') returning id", [COMPANY, code, unit])).id;
    await as(operator);
    if (qty) await db.query("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => $4)", [COMPANY, id, loc, qty]);
    return id;
  };
  const newOrder = async (quantity: number, productId = product) => {
    await as(operator);
    const so = await one<{ data: { id: string } }>(
      "select to_json(r) data from public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r",
      [COMPANY, customer, JSON.stringify([{ product_id: productId, description: "Item do teste da rodada 2", quantity, unit_price: 10 }])]
    );
    await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.data.id]);
    await db.query("select public.fn_approve_sales_order($1)", [so.data.id]);
    return so.data.id;
  };
  const reserve = (orderId: string, loc = location) =>
    db.query("select public.fn_reserve_sales_order_stock(p_order_id => $1, p_location_id => $2, p_idempotency_key => null)", [orderId, loc]);
  const pickAll = async (orderId: string) => {
    const pl = await one<{ id: string }>("select (public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)).id", [COMPANY, orderId, warehouse]);
    await db.query("select public.fn_start_picking($1)", [pl.id]);
    const items = (await db.query("select id, requested_quantity from pick_list_items where pick_list_id = $1", [pl.id])).rows;
    for (const it of items) await db.query("select public.fn_pick_item($1, $2, null, null, null, null, false)", [it.id, it.requested_quantity]);
    await db.query("select public.fn_complete_pick_list($1)", [pl.id]);
    return pl.id;
  };
  const orderItem = (orderId: string) => one<{ id: string }>("select id from sales_order_items where order_id = $1", [orderId]);
  const createShipment = async (orderId: string, qty: number, loc = location) => {
    const it = await orderItem(orderId);
    return one<{ id: string }>(
      "select (public.fn_create_shipment(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_items => $4::jsonb)).id",
      [COMPANY, orderId, warehouse, JSON.stringify([{ sales_order_item_id: it.id, location_id: loc, quantity: qty }])]
    );
  };
  const shipmentSql = async (orderId: string, qty: number, loc = location) => {
    const it = await orderItem(orderId);
    return {
      sql: "select public.fn_create_shipment(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_items => $4::jsonb)",
      params: [COMPANY, orderId, warehouse, JSON.stringify([{ sales_order_item_id: it.id, location_id: loc, quantity: qty }])],
    };
  };
  const ship = async (shipmentId: string) => {
    await db.query("select public.fn_add_shipment_package($1, 1, 2, null, null, null, null, null)", [shipmentId]);
    await db.query("select public.fn_mark_shipment_ready($1)", [shipmentId]);
    await db.query("select public.fn_pack_shipment($1)", [shipmentId]);
    await db.query("select public.fn_approve_shipment($1)", [shipmentId]);
    await db.query("select public.fn_ship_shipment($1, null)", [shipmentId]);
  };
  const reservedOf = async (productId: string, loc = location) =>
    Number((await one<{ r: string }>("select coalesce(sum(reserved),0) r from stock_balances where company_id = $1 and product_id = $2 and location_id = $3", [COMPANY, productId, loc])).r);

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'teste.rodada2@example.com', now())", [operator]);
    const u = await one<{ id: string }>(
      "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'Teste Rodada 2', 'teste.rodada2@example.com', 'teste.rodada2', 'active') returning id",
      [COMPANY, operator]
    );
    await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = 'admin'", [u.id, COMPANY]);
    customer = (await one<{ id: string }>(
      "insert into public.customers (company_id, code, type, name, document, state, status) values ($1, 'CLI-R2-' || substr(md5(random()::text), 1, 6), 'company', 'Cliente do teste da rodada 2', '11222333000181', 'MG', 'active') returning id",
      [COMPANY]
    )).id;
    warehouse = (await one<{ id: string }>("insert into public.warehouses (company_id, code, name, status) values ($1, 'DEP-R2-' || substr(md5(random()::text), 1, 6), 'Depósito do teste', 'active') returning id", [COMPANY])).id;
    location = (await one<{ id: string }>("insert into public.warehouse_locations (company_id, code, name, warehouse_id, status, purpose) values ($1, 'LOC-R2-A-' || substr(md5(random()::text), 1, 6), 'Local A', $2, 'active', 'STOCK') returning id", [COMPANY, warehouse])).id;
    otherLocation = (await one<{ id: string }>("insert into public.warehouse_locations (company_id, code, name, warehouse_id, status, purpose) values ($1, 'LOC-R2-B-' || substr(md5(random()::text), 1, 6), 'Local B', $2, 'active', 'STOCK') returning id", [COMPANY, warehouse])).id;
    product = await newProduct("TESTE-R2", 100);
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  // ------------------------------------------------------------ recebível (0081)
  test("R48-01: índice único recusa o 2º título ATIVO do mesmo pedido", async () => {
    const orderId = await newOrder(2);
    await db.query("select public.fn_generate_accounts_receivable_from_sales_order($1)", [orderId]);
    await asOwner();
    await rejects(
      "insert into public.accounts_receivable (company_id, customer_id, description, origin_type, origin_id, original_amount, issue_date, due_date) values ($1, $2, 'duplicado', 'sales_order', $3, 20, current_date, current_date)",
      [COMPANY, customer, orderId],
      /accounts_receivable_origin_active_unique|duplicate key/
    );
  });

  test("R48-01: geração idempotente diz se criou ou se já existia", async () => {
    const orderId = await newOrder(3);
    const first = await one<{ j: { created: boolean; receivable: { id: string; code: string } } }>("select public.fn_generate_receivable_for_sales_order($1) j", [orderId]);
    const again = await one<{ j: { created: boolean; receivable: { id: string } } }>("select public.fn_generate_receivable_for_sales_order($1) j", [orderId]);
    assert.equal(first.j.created, true);
    assert.equal(again.j.created, false);
    assert.equal(again.j.receivable.id, first.j.receivable.id);
    const n = await one<{ n: number }>("select count(*)::int n from accounts_receivable where origin_id = $1 and status <> 'CANCELLED'", [orderId]);
    assert.equal(n.n, 1);
  });

  // ------------------------------------------------------------ separação e expedição (0081)
  test("R48-06 (G1): 2ª separação aberta do mesmo pedido é recusada nomeando a existente", async () => {
    const orderId = await newOrder(2);
    await reserve(orderId);
    const pl = await one<{ code: string }>("select (public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)).code", [COMPANY, orderId, warehouse]);
    await rejects("select public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)", [COMPANY, orderId, warehouse], new RegExp(`já tem a separação ${pl.code} em aberto`));
  });

  test("R48-06 (G3) / R2-02: 2ª expedição (mesmo em sequência) não passa do reservado", async () => {
    const orderId = await newOrder(4);
    await reserve(orderId);
    await pickAll(orderId);
    await createShipment(orderId, 4);
    const s = await shipmentSql(orderId, 4);
    await rejects(s.sql, s.params, /maior que o reservado ainda livre para expedição \(0\)/);
  });

  test("R2-03: expedição só a partir do local onde o estoque foi reservado para o pedido", async () => {
    const p = await newProduct("TESTE-R2-H2", 4, location);
    await db.query("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => 4)", [COMPANY, p, otherLocation]);
    const x = await newOrder(4, p);
    await reserve(x, location);
    const a = await newOrder(4, p);
    await reserve(a, otherLocation);
    await pickAll(a);
    const s = await shipmentSql(a, 4, location);
    await rejects(s.sql, s.params, /não tem reserva suficiente neste local/);
  });

  test("R48-11: expedição consome a reserva (consumida, não 'active') e o saldo reservado zera", async () => {
    const p = await newProduct("TESTE-R2-R11", 10);
    const orderId = await newOrder(4, p);
    await reserve(orderId);
    await pickAll(orderId);
    const sh = await createShipment(orderId, 4);
    await ship(sh.id);
    const r = await one<{ status: string; consumed: string }>(
      "select max(r.status) status, sum(i.consumed_quantity) consumed from stock_reservations r join stock_reservation_items i on i.reservation_id = r.id where r.reference_id = $1",
      [orderId]
    );
    assert.equal(r.status, "consumed");
    assert.equal(Number(r.consumed), 4);
    assert.equal(await reservedOf(p), 0);
  });

  test("R2-01: pedido separado (pronto para expedir) sem expedição cancela e libera a reserva", async () => {
    const p = await newProduct("TESTE-R2-H1C", 10);
    const orderId = await newOrder(3, p);
    await reserve(orderId);
    await pickAll(orderId);
    await db.query("select public.fn_cancel_sales_order($1)", [orderId]);
    const so = await one<{ status: string }>("select status from sales_orders where id = $1", [orderId]);
    assert.equal(so.status, "cancelled");
    assert.equal(await reservedOf(p), 0);
    const act = await one<{ n: number }>("select count(*)::int n from stock_reservations where reference_id = $1 and status = 'active'", [orderId]);
    assert.equal(act.n, 0);
  });

  test("R2-01 / R2-16: com separação aberta o cancelamento é recusado nomeando a separação", async () => {
    const orderId = await newOrder(2);
    await reserve(orderId);
    const pl = await one<{ code: string }>("select (public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)).code", [COMPANY, orderId, warehouse]);
    await rejects("select public.fn_cancel_sales_order($1)", [orderId], new RegExp(`separação ${pl.code} está em aberto`));
  });

  test("R2-01: cancelamento depois de expedição parcial libera só o que restou", async () => {
    const p = await newProduct("TESTE-R2-PARC", 10);
    const orderId = await newOrder(5, p);
    await reserve(orderId);
    await pickAll(orderId);
    const sh = await createShipment(orderId, 2);
    await ship(sh.id);
    await db.query("select public.fn_cancel_sales_order($1)", [orderId]);
    const it = await one<{ shipped: string; reserved: string; cancelled: string }>("select shipped_quantity shipped, reserved_quantity reserved, cancelled_quantity cancelled from sales_order_items where order_id = $1", [orderId]);
    assert.deepEqual([Number(it.shipped), Number(it.reserved), Number(it.cancelled)], [2, 2, 3]);
    assert.equal(await reservedOf(p), 0, "nenhuma reserva presa");
  });

  test("R48-17/22: mensagens do banco sem UUID e sem 4 casas decimais", async () => {
    const orderId = await newOrder(4);
    await reserve(orderId);
    await pickAll(orderId);
    const s = await shipmentSql(orderId, 5);
    const sp = "sp_msg";
    await db.query(`savepoint ${sp}`);
    const err = await db.query(s.sql, s.params).then(() => null, (e: Error) => e.message);
    await db.query(`rollback to savepoint ${sp}`);
    assert.ok(err, "recusou");
    assert.doesNotMatch(err!, /[0-9a-f]{8}-[0-9a-f]{4}-/);
    assert.doesNotMatch(err!, /\d\.\d{4}\b/);
    assert.match(err!, /TESTE-R2/);
  });

  test("R48-15 (sequencial; a corrida real é comprovada no E2E): o 2º pedido fica com a parcial do que sobrou", async () => {
    const p = await newProduct("TESTE-R2-C", 10);
    const a = await newOrder(8, p);
    const b = await newOrder(7, p);
    await reserve(a);
    await reserve(b);
    const sb = await one<{ status: string }>("select status from sales_orders where id = $1", [b]);
    assert.equal(sb.status, "reservation_pending");
    assert.equal(await reservedOf(p), 10);
  });

  // ------------------------------------------------------------ fiscal (0082/0083/0087/0088)
  const fiscalDoc = async () => {
    await asOwner();
    const est = await one<{ id: string }>(
      "insert into public.fiscal_establishments (company_id, code, name, cnpj, tax_regime, state) values ($1, 'EST-R2-' || substr(md5(random()::text), 1, 6), 'Estabelecimento do teste', lpad(floor(random() * 1e14)::bigint::text, 14, '0'), 'SIMPLES_NACIONAL', 'MG') returning id",
      [COMPANY]
    );
    const nat = await one<{ id: string }>("insert into public.fiscal_operation_natures (company_id, code, name, direction) values ($1, 'NAT-R2-' || substr(md5(random()::text), 1, 6), 'Venda (teste)', 'SAIDA') returning id", [COMPANY]);
    await as(operator);
    await db.query("select public.fn_create_document_sequence($1, 'FISCAL_DOCUMENT', '1', null, 9, $2, 'Série do teste')", [COMPANY, est.id]);
    const doc = await one<{ id: string }>(
      "select (public.fn_create_fiscal_document(p_company_id => $1, p_fiscal_establishment_id => $2, p_type => 'NFE', p_direction => 'SAIDA', p_operation_nature_id => $3, p_customer_id => $4)).id",
      [COMPANY, est.id, nat.id, customer]
    );
    await db.query(
      "select public.fn_add_fiscal_document_item(p_fiscal_document_id => $1, p_product_id => $2, p_quantity => 2, p_unit_price => 50, p_ncm_code => '84713012', p_cfop_code => '5102', p_origin_code => '0', p_unit => 'UN')",
      [doc.id, product]
    );
    return { doc: doc.id, est: est.id, nat: nat.id };
  };

  test("R2-04/05/06: o papel com fiscal_documents.calculate numera; numera depois de pronto; não renumera", async () => {
    const { doc } = await fiscalDoc();
    await db.query("select public.fn_calculate_fiscal_document($1)", [doc]);
    await db.query("select public.fn_mark_fiscal_document_ready($1)", [doc]);
    const a = await one<{ number: number }>("select (public.fn_assign_fiscal_document_number($1, '1')).number", [doc]);
    assert.ok(a.number >= 1, "numerou o documento já pronto");
    await rejects("select public.fn_assign_fiscal_document_number($1, '1')", [doc], /já tem o número/);
  });

  test("R2-07: autorização manual exige número e chave de 44 dígitos com DV", async () => {
    const { doc } = await fiscalDoc();
    await db.query("select public.fn_calculate_fiscal_document($1)", [doc]);
    await db.query("select public.fn_mark_fiscal_document_ready($1)", [doc]);
    await rejects("select public.fn_authorize_fiscal_document($1, '123', 'manual', null)", [doc], /sem número/);
    await db.query("select public.fn_assign_fiscal_document_number($1, '1')", [doc]);
    await rejects("select public.fn_authorize_fiscal_document($1, '123', 'manual', null)", [doc], /Chave de acesso inválida/);
    const key = await one<{ k: string }>("select public.fn_fiscal_simulated_access_key($1) k", [doc]);
    await db.query("select public.fn_authorize_fiscal_document($1, $2, 'PROTOCOLO-TESTE', null)", [doc, key.k]);
    assert.equal((await one<{ status: string }>("select status from fiscal_documents where id = $1", [doc])).status, "AUTHORIZED");
  });

  test("R2-08: número de documento de saída não se repete na série", async () => {
    const { doc } = await fiscalDoc();
    const n = await one<{ number: number }>("select (public.fn_assign_fiscal_document_number($1, '1')).number", [doc]);
    const { doc: doc2 } = await fiscalDoc();
    await asOwner();
    const est = await one<{ e: string }>("select fiscal_establishment_id e from fiscal_documents where id = $1", [doc]);
    await db.query("update fiscal_documents set fiscal_establishment_id = $2 where id = $1", [doc2, est.e]);
    await rejects("update fiscal_documents set number = $2, series = '1' where id = $1", [doc2, n.number], /fiscal_documents_own_number_unique|duplicate key/);
  });

  test("simulação: recusa sem provedor configurado e em documento de produção; autoriza com provedor; cancela", async () => {
    const { doc, est } = await fiscalDoc();
    await db.query("select public.fn_assign_fiscal_document_number($1, '1')", [doc]);
    await db.query("select public.fn_calculate_fiscal_document($1)", [doc]);
    await db.query("select public.fn_mark_fiscal_document_ready($1)", [doc]);
    await asOwner();
    await db.query("update fiscal_documents set environment = 'HOMOLOGATION' where id = $1", [doc]);
    await as(operator);
    await rejects("select public.fn_simulate_fiscal_authorization($1)", [doc], /provedor de simulação configurado/);
    await db.query("select public.fn_configure_fiscal_provider($1, 'SIMULACAO', 'HOMOLOGATION', '{}'::jsonb)", [est]);
    await asOwner();
    await db.query("update fiscal_documents set environment = 'PRODUCTION' where id = $1", [doc]);
    await as(operator);
    await rejects("select public.fn_simulate_fiscal_authorization($1)", [doc], /só pode ser usada em documentos de homologação/);
    await asOwner();
    await db.query("update fiscal_documents set environment = 'HOMOLOGATION' where id = $1", [doc]);
    await as(operator);
    await db.query("select public.fn_simulate_fiscal_authorization($1)", [doc]);
    const d = await one<{ status: string; protocol: string; access_key: string }>("select status, protocol, access_key from fiscal_documents where id = $1", [doc]);
    assert.equal(d.status, "AUTHORIZED");
    assert.match(d.protocol, /^SIMULACAO-/);
    assert.match(d.access_key, /^\d{44}$/);
    const valid = await one<{ v: boolean }>("select public.fn_fiscal_access_key_is_valid($1) v", [d.access_key]);
    assert.equal(valid.v, true, "a chave simulada tem DV correto");
    await rejects("select public.fn_simulate_fiscal_authorization($1)", [doc], /já foi autorizado \(simulação\)/);
    await rejects("select public.fn_simulate_fiscal_cancellation($1, 'curta')", [doc], /pelo menos 15 caracteres/);
    await db.query("select public.fn_simulate_fiscal_cancellation($1, 'Cancelamento de teste da rodada 2')", [doc]);
    assert.equal((await one<{ status: string }>("select status from fiscal_documents where id = $1", [doc])).status, "CANCELLED");
  });

  test("simulação: rejeita com código próprio quando o CFOP não é do destino (SIM-106)", async () => {
    const { doc, est } = await fiscalDoc();
    await asOwner();
    await db.query("update fiscal_document_items set cfop_code = '6102' where fiscal_document_id = $1", [doc]);
    await db.query("update fiscal_documents set environment = 'HOMOLOGATION' where id = $1", [doc]);
    await as(operator);
    await db.query("select public.fn_configure_fiscal_provider($1, 'SIMULACAO', 'HOMOLOGATION', '{}'::jsonb)", [est]);
    await db.query("select public.fn_assign_fiscal_document_number($1, '1')", [doc]);
    await db.query("select public.fn_calculate_fiscal_document($1)", [doc]);
    await db.query("select public.fn_mark_fiscal_document_ready($1)", [doc]);
    await db.query("select public.fn_simulate_fiscal_authorization($1)", [doc]);
    const d = await one<{ status: string; return_code: string | null }>("select status, return_code from fiscal_documents where id = $1", [doc]);
    assert.equal(d.status, "REJECTED");
    const att = await one<{ error_code: string }>("select error_code from fiscal_authorization_attempts where fiscal_document_id = $1 order by attempt_number desc limit 1", [doc]);
    assert.equal(att.error_code, "SIM-106");
  });

  test("R2-19: gerar a NF-e de um pedido que já tem documento devolve created=false e não cria outro", async () => {
    const orderId = await newOrder(1);
    const { est, nat } = await fiscalDoc();
    await as(operator);
    const first = await one<{ id: string }>(
      "select (public.fn_create_fiscal_document(p_company_id => $1, p_fiscal_establishment_id => $2, p_type => 'NFE', p_direction => 'SAIDA', p_operation_nature_id => $3, p_customer_id => $4, p_source_type => 'sales_order', p_source_id => $5)).id",
      [COMPANY, est, nat, customer, orderId]
    );
    const r = await one<{ j: { created: boolean; document: { id: string } } }>(
      "select public.fn_generate_fiscal_document_for_sales_order($1, $2, $3, null) j", [orderId, est, nat]
    );
    assert.equal(r.j.created, false, "não diz 'criado' para o documento que já existia");
    assert.equal(r.j.document.id, first.id);
    const n = await one<{ n: number }>("select count(*)::int n from fiscal_documents where source_id = $1 and status <> 'CANCELLED'", [orderId]);
    assert.equal(n.n, 1);
  });

  test("R2-13: eventos do documento gravados na mesma transação ficam em ordem de horário", async () => {
    const { doc } = await fiscalDoc();
    await asOwner();
    await db.query("insert into fiscal_document_events (company_id, fiscal_document_id, event_type, message) values ($1, $2, 'OTHER', 'primeiro')", [COMPANY, doc]);
    await db.query("insert into fiscal_document_events (company_id, fiscal_document_id, event_type, message) values ($1, $2, 'OTHER', 'segundo')", [COMPANY, doc]);
    const ev = (await db.query("select message from fiscal_document_events where fiscal_document_id = $1 and message in ('primeiro','segundo') order by created_at, message desc", [doc])).rows;
    assert.deepEqual(ev.map((e) => e.message), ["primeiro", "segundo"], "horários distintos na mesma transação");
  });

  // ------------------------------------------------------------ B18 (0085) e auditoria (0086)
  test("B18: item do pedido sem unidade herda a unidade do produto", async () => {
    const pid = await newProduct("TESTE-R2-CX", 0, location, "CX");
    await as(operator);
    const so = await one<{ data: { id: string } }>(
      "select to_json(r) data from public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r",
      [COMPANY, customer, JSON.stringify([{ product_id: pid, description: "Sem unidade", quantity: 1, unit_price: 10 }])]
    );
    const it = await one<{ unit: string }>("select unit from sales_order_items where order_id = $1", [so.data.id]);
    assert.equal(it.unit, "CX");
  });

  test("R2-18: criação e envio do pedido aparecem na trilha com o autor real", async () => {
    await as(operator);
    const so = await one<{ data: { id: string; code: string } }>(
      "select to_json(r) data from public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r",
      [COMPANY, customer, JSON.stringify([{ product_id: product, description: "Item auditado", quantity: 1, unit_price: 10 }])]
    );
    await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.data.id]);
    await asOwner();
    const me = await one<{ id: string; name: string }>("select id, name from users where auth_user_id = $1", [operator]);
    const rows = (await db.query("select action, user_id, actor_label, new_data->>'code' code from audit_logs where entity = 'sales_orders' and entity_id = $1 order by created_at, action", [so.data.id])).rows;
    const create = rows.find((r) => r.action === "CREATE");
    const submit = rows.find((r) => r.action === "SUBMIT");
    assert.ok(create, "linha CREATE na trilha");
    assert.ok(submit, "linha SUBMIT na trilha");
    for (const r of [create, submit]) {
      assert.equal(r.user_id, me.id, "autor = usuário da sessão");
      assert.equal(r.actor_label, me.name, "nome do autor, não 'system'");
    }
    assert.equal(create.code, so.data.code);
  });
});
