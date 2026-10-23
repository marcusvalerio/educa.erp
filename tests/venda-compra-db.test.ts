// 0108 no PostgreSQL real: venda só com estoque reservado e conta a pagar
// automática no recebimento confirmado. POC_DATABASE_OWNER_URL: dono de um
// banco DESCARTÁVEL (nunca produção), com a empresa e o administrador de
// exemplo. Tudo numa transação desfeita.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";
const ADMIN_AUTH = "9126ce02-9fdd-468b-955b-4b47becc0fea";

describe("Venda com estoque e conta a pagar da compra (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0] as T;
  const attempt = async (sql: string, params: unknown[] = []) => {
    await db.query("savepoint t");
    try {
      const r = await db.query(sql, params);
      await db.query("release savepoint t");
      return { ok: true as const, rows: r.rows, error: "" };
    } catch (e) {
      await db.query("rollback to savepoint t");
      return { ok: false as const, rows: [], error: (e as Error).message };
    }
  };
  const asAdmin = async () => {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: ADMIN_AUTH, role: "authenticated" })]);
  };
  const asOwner = () => db.query("reset role");
  const ids = { supplier: randomUUID(), product: randomUUID(), loc: "", po: randomUUID(), poi: randomUUID(), receipt: randomUUID(), customer: randomUUID(), order: randomUUID(), est: randomUUID(), nature: randomUUID() };

  before(async () => {
    await db.connect();
    await db.query("begin");
    const unit = (await one<{ code: string }>("select code from units where company_id = $1 order by code limit 1", [COMPANY])).code;
    ids.loc = (await one<{ id: string }>(
      "insert into warehouse_locations (company_id, code, warehouse, warehouse_id, location_type) select company_id, 'T-VC', code, id, 'Prateleira' from warehouses where company_id = $1 limit 1 returning id",
      [COMPANY]
    )).id;
    await db.query("insert into suppliers (id, company_id, code, legal_name, document) values ($1, $2, 'FOR-VC', 'Fornecedor VC', '11222333000181')", [ids.supplier, COMPANY]);
    await db.query("insert into products (id, company_id, code, name, unit, ncm) values ($1, $2, 'PRD-VC', 'Produto VC', $3, '48202000')", [ids.product, COMPANY, unit]);
    await db.query("insert into purchase_orders (id, company_id, code, supplier_id, status, payment_terms) values ($1, $2, 'PC-VC', $3, 'sent', '30/60')", [ids.po, COMPANY, ids.supplier]);
    await db.query("insert into purchase_order_items (id, company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, $4, 'Produto VC', $5, 10, 12.5)", [ids.poi, COMPANY, ids.po, ids.product, unit]);
    await db.query("insert into purchase_receipts (id, company_id, code, purchase_order_id, supplier_id, status) values ($1, $2, 'REC-VC', $3, $4, 'draft')", [ids.receipt, COMPANY, ids.po, ids.supplier]);
    await db.query(
      "insert into purchase_receipt_items (company_id, receipt_id, purchase_order_item_id, product_id, quantity_received, unit, destination_location_id, accepted_quantity) values ($1, $2, $3, $4, 10, $5, $6, 10)",
      [COMPANY, ids.receipt, ids.poi, ids.product, unit, ids.loc]
    );
    await db.query("insert into customers (id, company_id, code, name, document) values ($1, $2, 'CLI-VC', 'Cliente VC', '11444777000161')", [ids.customer, COMPANY]);
    await db.query("insert into sales_orders (id, company_id, code, customer_id, status) values ($1, $2, 'PV-VC', $3, 'approved')", [ids.order, COMPANY, ids.customer]);
    await db.query(
      "insert into fiscal_establishments (id, company_id, code, name, cnpj, tax_regime, state) values ($1, $2, 'EST-VC', 'Estab VC', '11222333000181', 'SIMPLES_NACIONAL', 'SP')",
      [ids.est, COMPANY]
    );
    await db.query("insert into fiscal_operation_natures (id, company_id, code, name, direction) values ($1, $2, 'NAT-VC', 'Venda', 'SAIDA')", [ids.nature, COMPANY]);
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  test("recebimento confirmado gera a conta a pagar com parcelas da condição do pedido (30/60)", async () => {
    await db.query("update purchase_receipts set status = 'confirmed', received_at = '2026-10-21T12:00:00Z' where id = $1", [ids.receipt]);
    const ap = await one<{ id: string; original_amount: string; supplier_id: string; origin_type: string; due_date: string }>(
      "select id, original_amount, supplier_id, origin_type, due_date::text from accounts_payable where origin_id = $1",
      [ids.receipt]
    );
    assert.equal(Number(ap.original_amount), 125);
    assert.equal(ap.supplier_id, ids.supplier);
    assert.equal(ap.origin_type, "purchase_receipt");
    assert.equal(ap.due_date, "2026-11-20");
    const parts = (await db.query("select installment_number, due_date::text, amount from accounts_payable_installments where payable_id = $1 order by 1", [ap.id])).rows;
    assert.deepEqual(parts.map((p) => [p.installment_number, p.due_date, Number(p.amount)]), [
      [1, "2026-11-20", 62.5],
      [2, "2026-12-20", 62.5],
    ]);
    // Uma conta por recebimento, mesmo se o status for regravado.
    await db.query("update purchase_receipts set status = 'draft' where id = $1", [ids.receipt]);
    await db.query("update purchase_receipts set status = 'confirmed' where id = $1", [ids.receipt]);
    const n = await one<{ n: number }>("select count(*)::int n from accounts_payable where origin_id = $1", [ids.receipt]);
    assert.equal(n.n, 1);
  });

  test("0116: NF de entrada do recebimento (itens do recebimento, conferida, uma só)", async () => {
    await asAdmin();
    const doc = await one<{ id: string; direction: string; status: string; supplier_id: string; source_type: string }>(
      "select id, direction, status, supplier_id, source_type from fn_register_purchase_entry_invoice($1)",
      [ids.receipt]
    );
    assert.equal(doc.direction, "ENTRADA");
    assert.equal(doc.status, "READY");
    assert.equal(doc.supplier_id, ids.supplier);
    assert.equal(doc.source_type, "purchase_receipt");
    const again = await one<{ id: string }>("select id from fn_register_purchase_entry_invoice($1)", [ids.receipt]);
    assert.equal(again.id, doc.id);
    await asOwner();
    const tot = await one<{ q: string; v: string }>("select sum(quantity) q, sum(quantity * unit_price) v from fiscal_document_items where fiscal_document_id = $1", [doc.id]);
    assert.deepEqual([Number(tot.q), Number(tot.v)], [10, 125]);
  });

  test("a função interna não é chamável por usuários", async () => {
    await asAdmin();
    assert.match((await attempt("select public.fn_payable_from_receipt_internal($1)", [ids.receipt])).error, /permission denied/);
    await asOwner();
  });

  test("sem estoque reservado não fatura; com reserva, fatura", async () => {
    await asAdmin();
    assert.match(
      (await attempt("select * from fn_create_fiscal_document_from_sales_order($1, $2, $3, null)", [ids.order, ids.est, ids.nature])).error,
      /Reserve o estoque do pedido antes de faturar/
    );
    await asOwner();
    await db.query("update sales_orders set status = 'reservation_pending' where id = $1", [ids.order]);
    await asAdmin();
    assert.match((await attempt("select * from fn_create_fiscal_document_from_sales_order($1, $2, $3, null)", [ids.order, ids.est, ids.nature])).error, /Reserve o estoque/);
    await asOwner();
    await db.query("update sales_orders set status = 'reserved' where id = $1", [ids.order]);
    await asAdmin();
    const r = await attempt("select status from fn_create_fiscal_document_from_sales_order($1, $2, $3, null)", [ids.order, ids.est, ids.nature]);
    assert.ok(r.ok, r.error);
    await asOwner();
  });

  test("venda completa: reserva → separação → expedição → expedir baixa o estoque", async () => {
    await asOwner();
    const unit = (await one<{ code: string }>("select code from units where company_id = $1 order by code limit 1", [COMPANY])).code;
    const prod = (await one<{ id: string }>("insert into products (company_id, code, name, unit) values ($1, 'PRD-VC2', 'Produto venda', $2) returning id", [COMPANY, unit])).id;
    const order = (await one<{ id: string }>("insert into sales_orders (company_id, code, customer_id, status) values ($1, 'PV-VC2', $2, 'approved') returning id", [COMPANY, ids.customer])).id;
    const item = (await one<{ id: string }>(
      "insert into sales_order_items (company_id, order_id, product_id, description, unit, ordered_quantity, unit_price) values ($1, $2, $3, 'Produto venda', $4, 4, 10) returning id",
      [COMPANY, order, prod, unit]
    )).id;
    await asAdmin();
    // 0115: estoque exatamente igual ao pedido (4) — expedir não pode travar na própria reserva.
    await db.query("select fn_receive_stock($1, $2, $3, 4, null, 5, 'entrada teste', null)", [COMPANY, prod, ids.loc]);
    const r = await attempt("select fn_reserve_sales_order_stock($1, $2, null)", [order, ids.loc]);
    assert.ok(r.ok, r.error);
    const wh = (await one<{ warehouse_id: string }>("select warehouse_id from warehouse_locations where id = $1", [ids.loc])).warehouse_id;
    const pick = (await one<{ id: string }>("select id from fn_create_pick_list($1, $2, $3, null)", [COMPANY, order, wh])).id;
    await db.query("select fn_start_picking($1)", [pick]);
    for (const it of (await db.query("select id, requested_quantity from pick_list_items where pick_list_id = $1", [pick])).rows) {
      await db.query("select fn_pick_item($1, $2, null, null, null, null, false)", [it.id, it.requested_quantity]);
    }
    await db.query("select fn_complete_pick_list($1)", [pick]);
    const ship = (await one<{ id: string }>("select id from fn_create_shipment($1, $2, $3, $4::jsonb, $5)", [
      COMPANY, order, wh, JSON.stringify([{ sales_order_item_id: item, location_id: ids.loc, quantity: 4 }]), pick,
    ])).id;
    for (const f of ["fn_mark_shipment_ready", "fn_pack_shipment", "fn_approve_shipment"]) await db.query(`select ${f}($1)`, [ship]);
    await db.query("select fn_ship_shipment($1, null)", [ship]);
    await asOwner();
    const bal = await one<{ on_hand: string; reserved: string }>("select on_hand, reserved from stock_balances where product_id = $1 and location_id = $2", [prod, ids.loc]);
    assert.deepEqual([Number(bal.on_hand), Number(bal.reserved)], [0, 0], "4 entraram, 4 saíram na expedição, reserva liberada");
    const st = await one<{ status: string }>("select status from sales_orders where id = $1", [order]);
    assert.equal(st.status, "shipped");
  });
});
