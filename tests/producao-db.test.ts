// Produção de ponta a ponta no PostgreSQL real: estrutura (BOM) → ordem →
// planejar → liberar (reserva os materiais) → iniciar → consumir → apontar
// produção → concluir. Estoque exato (sem sobra) para pegar travas de reserva.
// POC_DATABASE_OWNER_URL: banco DESCARTÁVEL. Tudo numa transação desfeita.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const COMPANY = "00000000-0000-0000-0000-000000000001";
const ADMIN_AUTH = "9126ce02-9fdd-468b-955b-4b47becc0fea";

describe("Produção de ponta a ponta (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
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
  const ids: Record<string, string> = {};
  const balance = async (product: string, location: string) => {
    const b = await one<{ on_hand: string; reserved: string }>("select coalesce(sum(on_hand),0) on_hand, coalesce(sum(reserved),0) reserved from stock_balances where product_id = $1 and location_id = $2", [product, location]);
    return [Number(b.on_hand), Number(b.reserved)];
  };

  before(async () => {
    await db.connect();
    await db.query("begin");
    const unit = await one<{ id: string; code: string }>("select id, code from units where company_id = $1 and code = 'UN'", [COMPANY]);
    ids.unit = unit.id;
    const wh = await one<{ id: string; code: string }>("select id, code from warehouses where company_id = $1 order by created_at limit 1", [COMPANY]);
    ids.wh = wh.id;
    ids.loc = (await one<{ id: string }>(
      "insert into warehouse_locations (company_id, code, warehouse, warehouse_id, location_type) values ($1, 'T-PROD', $2, $3, 'Prateleira') returning id",
      [COMPANY, wh.code, wh.id]
    )).id;
    for (const [k, code, name] of [["fg", "PRD-FG", "Quadro montado"], ["c1", "PRD-C1", "Disjuntor"], ["c2", "PRD-C2", "Caixa de quadro"]]) {
      ids[k] = (await one<{ id: string }>("insert into products (company_id, code, name, unit, unit_id, cost_price, production_type) values ($1, $2, $3, 'UN', $4, 0, $5) returning id", [COMPANY, code, name, ids.unit, k === "fg" ? "manufactured" : "purchased"])).id;
    }
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  test("estrutura, ordem, liberação, consumo, apontamento e conclusão", async () => {
    await asAdmin();
    // Componentes: exatamente o necessário para 5 quadros (2 disjuntores + 1 caixa cada).
    await db.query("select fn_receive_stock($1, $2, $3, 10, null, 20, 'entrada', null)", [COMPANY, ids.c1, ids.loc]);
    await db.query("select fn_receive_stock($1, $2, $3, 5, null, 50, 'entrada', null)", [COMPANY, ids.c2, ids.loc]);

    const bom = (await one<{ id: string }>("select id from fn_create_bom($1, $2, 1, $3, current_date, null, null)", [COMPANY, ids.fg, ids.unit])).id;
    await db.query("select fn_add_bom_item($1, $2, 2, $3, 0, 1, false, null)", [bom, ids.c1, ids.unit]);
    await db.query("select fn_add_bom_item($1, $2, 1, $3, 0, 2, false, null)", [bom, ids.c2, ids.unit]);
    await db.query("select fn_activate_bom($1)", [bom]);

    const op = (await one<{ id: string }>(
      "select id from fn_create_production_order($1, $2, 5, $3, $4, $5, $4, $5, $6, 'medium', current_date, null, null)",
      [COMPANY, ids.fg, ids.unit, ids.wh, ids.loc, bom]
    )).id;
    const steps = ["fn_plan_production_order($1, current_date)", "fn_release_production_order($1)", "fn_start_production_order($1)"];
    for (const s of steps) {
      const r = await attempt(`select ${s}`, [op]);
      assert.ok(r.ok, `${s}: ${r.error}`);
    }
    assert.deepEqual(await balance(ids.c1, ids.loc), [10, 10], "liberação reserva os disjuntores");

    for (const m of (await db.query("select id, reserved_quantity from production_order_materials where production_order_id = $1", [op])).rows) {
      const r = await attempt("select fn_consume_production_material($1, $2, null, null, null)", [m.id, m.reserved_quantity]);
      assert.ok(r.ok, `consumo: ${r.error}`);
    }
    assert.deepEqual(await balance(ids.c1, ids.loc), [0, 0], "consumo baixa e libera a reserva (estoque exato)");
    assert.deepEqual(await balance(ids.c2, ids.loc), [0, 0]);

    const out = await attempt("select fn_register_production_output($1, 5, 0, null, null, null)", [op]);
    assert.ok(out.ok, `apontamento: ${out.error}`);
    assert.deepEqual(await balance(ids.fg, ids.loc), [5, 0], "produto acabado entra no estoque");

    const done = await attempt("select fn_complete_production_order($1)", [op]);
    assert.ok(done.ok, `conclusão: ${done.error}`);
    const o = await one<{ status: string; produced_quantity: string; material_cost: string }>("select status, produced_quantity, material_cost from production_orders where id = $1", [op]);
    assert.equal(o.status, "completed");
    assert.equal(Number(o.produced_quantity), 5);
    assert.equal(Number(o.material_cost), 10 * 20 + 5 * 50, "custo de material = consumo valorizado");

    const rep = await one<{ produced_quantity: string; completed_orders: number }>("select * from fn_report_production($1, current_date - 1, current_date + 1)", [COMPANY]);
    assert.ok(Number(rep.produced_quantity) >= 5);
    assert.ok(Number(rep.completed_orders) >= 1);
    await asOwner();
  });

  test("0123: concluir sem 'Consumir materiais' dá baixa no reservado (nada fica preso na reserva)", async () => {
    await asAdmin();
    await db.query("select fn_receive_stock($1, $2, $3, 4, null, 20, 'entrada', null)", [COMPANY, ids.c1, ids.loc]);
    await db.query("select fn_receive_stock($1, $2, $3, 2, null, 50, 'entrada', null)", [COMPANY, ids.c2, ids.loc]);
    const bom = (await one<{ id: string }>("select id from product_boms where product_id = $1 and status = 'active' limit 1", [ids.fg])).id;
    const op = (await one<{ id: string }>(
      "select id from fn_create_production_order($1, $2, 2, $3, $4, $5, $4, $5, $6, 'medium', current_date, null, null)",
      [COMPANY, ids.fg, ids.unit, ids.wh, ids.loc, bom]
    )).id;
    for (const s of ["fn_plan_production_order($1, current_date)", "fn_release_production_order($1)", "fn_start_production_order($1)"]) await db.query(`select ${s}`, [op]);
    // apontar 1 de 2 sem consumir: metade do material sai e o produto pronto tem custo
    await db.query("select fn_register_production_output($1, 1, 0, null, null, null)", [op]);
    assert.deepEqual(await balance(ids.c1, ids.loc), [2, 2], "metade dos disjuntores baixada no apontamento");
    const fgCost = await one<{ c: string }>("select average_unit_cost c from product_cost_balances where product_id = $1 and location_id = $2", [ids.fg, ids.loc]);
    assert.ok(Number(fgCost.c) > 0, "produto pronto não entra com custo zero");
    await db.query("select fn_register_production_output($1, 1, 0, null, null, null)", [op]);
    const r = await attempt("select fn_complete_production_order($1)", [op]);
    assert.ok(r.ok, r.error);
    assert.deepEqual(await balance(ids.c1, ids.loc), [0, 0], "disjuntores saíram e a reserva foi liberada");
    assert.deepEqual(await balance(ids.c2, ids.loc), [0, 0]);
    const o = await one<{ material_cost: string }>("select material_cost from production_orders where id = $1", [op]);
    assert.equal(Number(o.material_cost), 4 * 20 + 2 * 50);
    await asOwner();
  });
});
