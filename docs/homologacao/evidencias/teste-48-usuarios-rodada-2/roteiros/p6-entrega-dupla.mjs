// R2-10 — duas confirmações de entrega SIMULTÂNEAS da mesma expedição, com duas
// conexões reais ao PostgreSQL (cada uma na sua transação). Roda num banco
// DESCARTÁVEL (DB=educa_base: sem 0081–0088; DB=educa_test: com as migrations).
const { default: pg } = await import("/home/user/educa-app/node_modules/pg/lib/index.js");
import { randomUUID } from "node:crypto";
const DB = process.env.DB;
const url = `postgres://postgres@127.0.0.1:55440/${DB}`;
const COMPANY = "00000000-0000-0000-0000-000000000001";
const sub = randomUUID();
const owner = new pg.Client({ connectionString: url });
await owner.connect();
const one = async (c, sql, p = []) => (await c.query(sql, p)).rows[0];
const asUser = async (c) => {
  await c.query("set role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, false), set_config('request.jwt.claim.sub', $2, false)", [JSON.stringify({ sub, role: "authenticated" }), sub]);
};
// Dados fictícios (commitados no banco descartável).
await owner.query("select set_config('educa.auth_link', 'invitation', false)");
await owner.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [sub, `entrega.${sub.slice(0, 8)}@example.com`]);
const u = await one(owner, "insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, 'Teste entrega', $3, $4, 'active') returning id", [COMPANY, sub, `entrega.${sub.slice(0, 8)}@example.com`, `entrega.${sub.slice(0, 8)}`]);
await owner.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = 'admin'", [u.id, COMPANY]);
const wh = await one(owner, "select w.id w, l.id l from warehouses w join warehouse_locations l on l.warehouse_id = w.id where w.company_id = $1 order by l.code limit 1", [COMPANY]);
const cust = await one(owner, "select id from customers where company_id = $1 limit 1", [COMPANY]);
const prod = await one(owner, "insert into public.products (company_id, code, name, unit, status) values ($1, 'ENT-' || substr(md5(random()::text),1,6), 'Produto entrega', 'UN', 'active') returning id", [COMPANY]);
await asUser(owner);
await owner.query("select public.fn_receive_stock(p_company_id => $1, p_product_id => $2, p_location_id => $3, p_quantity => 5)", [COMPANY, prod.id, wh.l]);
const so = await one(owner, "select (public.fn_create_sales_order(p_company_id => $1, p_customer_id => $2, p_items => $3::jsonb)).id", [COMPANY, cust.id, JSON.stringify([{ product_id: prod.id, description: "Item", quantity: 2, unit_price: 10 }])]);
await owner.query("select public.fn_submit_sales_order_for_approval($1)", [so.id]);
await owner.query("select public.fn_approve_sales_order($1)", [so.id]);
await owner.query("select public.fn_reserve_sales_order_stock(p_order_id => $1, p_location_id => $2, p_idempotency_key => null)", [so.id, wh.l]);
const pl = await one(owner, "select (public.fn_create_pick_list(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_notes => null)).id", [COMPANY, so.id, wh.w]);
await owner.query("select public.fn_start_picking($1)", [pl.id]);
for (const it of (await owner.query("select id, requested_quantity from pick_list_items where pick_list_id = $1", [pl.id])).rows) await owner.query("select public.fn_pick_item($1, $2, null, null, null, null, false)", [it.id, it.requested_quantity]);
await owner.query("select public.fn_complete_pick_list($1)", [pl.id]);
const soi = await one(owner, "select id from sales_order_items where order_id = $1", [so.id]);
const sh = await one(owner, "select (public.fn_create_shipment(p_company_id => $1, p_sales_order_id => $2, p_warehouse_id => $3, p_items => $4::jsonb)).id", [COMPANY, so.id, wh.w, JSON.stringify([{ sales_order_item_id: soi.id, location_id: wh.l, quantity: 2 }])]);
for (const f of ["select public.fn_add_shipment_package($1, 1, 2, null, null, null, null, null)", "select public.fn_mark_shipment_ready($1)", "select public.fn_pack_shipment($1)", "select public.fn_approve_shipment($1)", "select public.fn_ship_shipment($1, null)"]) await owner.query(f, [sh.id]);

// Duas confirmações ao mesmo tempo: cada conexão abre a transação, confirma e espera 300 ms antes do commit.
const conns = [new pg.Client({ connectionString: url }), new pg.Client({ connectionString: url })];
for (const c of conns) { await c.connect(); await asUser(c); }
const results = await Promise.all(conns.map(async (c, i) => {
  try {
    await c.query("begin");
    await c.query("select public.fn_confirm_delivery($1, $2)", [sh.id, `Recebedor ${i + 1}`]);
    await new Promise((r) => setTimeout(r, 300));
    await c.query("commit");
    return "ok";
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return `recusado: ${e.message}`;
  }
}));
await owner.query("reset role");
const ev = await one(owner, "select count(*)::int n from delivery_events where shipment_id = $1 and status = 'delivered'", [sh.id]);
console.log(JSON.stringify({ db: DB, results, eventos_entregue: ev.n }));
for (const c of [...conns, owner]) await c.end();
