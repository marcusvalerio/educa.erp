// Reserva de estoque do pedido de venda executada de verdade no PostgreSQL
// com o esquema do ATLAS.ERP. POC_DATABASE_OWNER_URL: conexão do DONO de um banco
// DESCARTÁVEL (ver poc/neon-full/README.md; nunca produção) — o dono prepara
// os logins de teste com a mesma marca do aceite de convite (0072) e as ações
// rodam como "authenticated", pela RLS e pelas funções do banco. Tudo numa
// única transação desfeita no fim: o banco não guarda nada do teste.
//
// Cobre a correção da migration 0074 (fn_reserve_sales_order_stock gravava o
// retorno composto de fn_create_reservation numa variável de linha pelo
// "select f() into", o que quebrava com "invalid input syntax for type uuid")
// e o que depende da reserva: separação (pick list), liberação, contas a
// receber e o RBAC da ação.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";

describe("reserva de estoque do pedido (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const operator = randomUUID(); // login com papel admin (tem sales_orders.reserve)
  const reader = randomUUID(); // login com papel leitura (sem sales_orders.reserve)
  let product = "";
  let customer = "";
  let location = "";
  let warehouse = "";

  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  // Dono do banco + marca do aceite oficial de convite (0072).
  const asOwner = async () => {
    await db.query("reset role");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
  };
  const as = async (sub: string) => {
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
  };
  const balance = (productId: string) =>
    one<{ on_hand: string; reserved: string; available: string }>(
      "select coalesce(sum(on_hand),0) on_hand, coalesce(sum(reserved),0) reserved, coalesce(sum(available),0) available from stock_balances where company_id = $1 and product_id = $2 and location_id = $3 and lot_id is null",
      [COMPANY, productId, location]
    );
  const newOrder = async (quantity: number) => {
    const so = await one<{ data: { id: string } }>(
      "select to_json(r) data from public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb) r",
      [COMPANY, customer, JSON.stringify([{ product_id: product, description: "Item do teste", quantity, unit_price: 10 }])]
    );
    await db.query("select public.fn_submit_sales_order_for_approval($1)", [so.data.id]);
    await db.query("select public.fn_approve_sales_order($1)", [so.data.id]);
    return so.data.id;
  };
  const reserve = (orderId: string) =>
    one<{ data: { status: string } }>("select to_json(r) data from public.fn_reserve_sales_order_stock(p_order_id => $1, p_location_id => $2, p_idempotency_key => null) r", [orderId, location]);

  before(async () => {
    await db.connect();
    await db.query("begin");
    await asOwner();
    for (const [sub, role, login] of [[operator, "admin", "teste.reserva.op"], [reader, "leitura", "teste.reserva.leitura"]]) {
      await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `${login}@example.com`]);
      const u = await one<{ id: string }>(
        "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id",
        [COMPANY, sub, login, `${login}@example.com`]
      );
      await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [u.id, COMPANY, role]);
    }
    // Produto novo (saldo zerado e conhecido), cliente e local de estoque do seed fictício.
    product = (await one<{ id: string }>("insert into public.products (company_id, code, name, unit, status) values ($1, 'TESTE-RESERVA', 'Produto do teste de reserva', 'UN', 'active') returning id", [COMPANY])).id;
    customer = (await one<{ id: string }>("select id from public.customers where company_id = $1 order by code limit 1", [COMPANY])).id;
    const loc = await one<{ id: string; warehouse_id: string }>("select id, warehouse_id from public.warehouse_locations where company_id = $1 and warehouse_id is not null order by code limit 1", [COMPANY]);
    location = loc.id;
    warehouse = loc.warehouse_id;
    await as(operator);
    await db.query("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => 10)", [COMPANY, product, location]);
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  test("pedido aprovado → reservar → reserva ativa, estoque reservado e pedido 'reserved'", async () => {
    await as(operator);
    const orderId = await newOrder(3);
    const r = await reserve(orderId);
    assert.equal(r.data.status, "reserved");

    const res = await one<{ n: string; status: string; qty: string }>(
      "select count(*) n, max(r.status) status, coalesce(sum(i.quantity),0) qty from stock_reservations r join stock_reservation_items i on i.reservation_id = r.id where r.reference_type = 'sales_order' and r.reference_id = $1",
      [orderId]
    );
    assert.equal(Number(res.n), 1, "uma reserva, um item");
    assert.equal(res.status, "active");
    assert.equal(Number(res.qty), 3);

    const item = await one<{ reserved_quantity: string }>("select reserved_quantity from sales_order_items where order_id = $1", [orderId]);
    assert.equal(Number(item.reserved_quantity), 3);

    const b = await balance(product);
    assert.deepEqual([Number(b.on_hand), Number(b.reserved), Number(b.available)], [10, 3, 7], "reserva reduz o disponível, não o físico");
  });

  test("reserva parcial fica 'reservation_pending' e a 2ª chamada reserva só o que falta", async () => {
    await as(operator);
    const orderId = await newOrder(12); // disponível: 7
    assert.equal((await reserve(orderId)).data.status, "reservation_pending");
    assert.equal(Number((await one<{ q: string }>("select reserved_quantity q from sales_order_items where order_id = $1", [orderId])).q), 7);

    await db.query("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => 20)", [COMPANY, product, location]);
    assert.equal((await reserve(orderId)).data.status, "reserved");
    assert.equal(Number((await one<{ q: string }>("select reserved_quantity q from sales_order_items where order_id = $1", [orderId])).q), 12, "não reserva de novo o que já estava reservado");
    const n = await one<{ n: string }>("select count(*) n from stock_reservations where reference_type = 'sales_order' and reference_id = $1", [orderId]);
    assert.equal(Number(n.n), 2, "uma reserva por chamada que reservou algo");
    // Saldo final: 30 físicos, 3 (1º pedido) + 12 (este) reservados.
    const b = await balance(product);
    assert.deepEqual([Number(b.on_hand), Number(b.reserved), Number(b.available)], [30, 15, 15]);
  });

  test("pedido totalmente reservado não é reservado de novo", async () => {
    await as(operator);
    const orderId = await newOrder(1);
    await reserve(orderId);
    await db.query("savepoint again");
    await assert.rejects(reserve(orderId), /Só é possível reservar estoque de um pedido aprovado/);
    await db.query("rollback to savepoint again");
  });

  test("expedição: a separação (pick list) nasce da reserva ativa", async () => {
    await as(operator);
    const orderId = await newOrder(2);
    await reserve(orderId);
    await db.query("select public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)", [COMPANY, orderId, warehouse]);
    const so = await one<{ status: string }>("select status from sales_orders where id = $1", [orderId]);
    assert.equal(so.status, "picking");
    const items = await one<{ n: string }>("select count(*) n from pick_list_items i join pick_lists p on p.id = i.pick_list_id where p.sales_order_id = $1", [orderId]);
    assert.ok(Number(items.n) >= 1);
  });

  test("liberar a reserva devolve o disponível", async () => {
    await as(operator);
    const orderId = await newOrder(4);
    await reserve(orderId);
    const before = await balance(product);
    await db.query("select public.fn_release_sales_order_reservation($1)", [orderId]);
    const after = await balance(product);
    assert.equal(Number(after.available) - Number(before.available), 4);
    assert.equal(Number(after.on_hand), Number(before.on_hand));
  });

  test("financeiro: contas a receber do pedido reservado", async () => {
    await as(operator);
    const orderId = await newOrder(5);
    await reserve(orderId);
    await db.query("select public.fn_generate_accounts_receivable_from_sales_order(p_sales_order_id => $1)", [orderId]);
    const ar = await one<{ n: string; total: string }>("select count(*) n, coalesce(sum(original_amount),0) total from accounts_receivable where origin_type = 'sales_order' and origin_id = $1", [orderId]);
    assert.equal(Number(ar.n), 1);
    assert.equal(Number(ar.total), 50);
  });

  test("RBAC: papel sem sales_orders.reserve é recusado e nada é reservado", async () => {
    await as(operator);
    const orderId = await newOrder(1);
    await as(reader);
    await db.query("savepoint rbac");
    await assert.rejects(reserve(orderId), /Permissão negada \(sales_orders\.reserve\)/);
    await db.query("rollback to savepoint rbac");
    await as(operator);
    const n = await one<{ n: string }>("select count(*) n from stock_reservations where reference_id = $1", [orderId]);
    assert.equal(Number(n.n), 0);
  });
});
