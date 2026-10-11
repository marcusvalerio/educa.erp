// As 4 views financeiras/estoque (v_cash_flow_summary, v_cash_flow_projection,
// inventory_valuation, v_sales_order_item_margin) e as funções SECURITY
// DEFINER que as leem, com dados SINTÉTICOS em duas empresas e RLS real.
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca produção).
//
// Valores por empresa: Alfa = 1000, Beta = 2000 (saldo, a receber, estoque e
// receita do pedido), para que qualquer vazamento apareça como número da outra
// empresa. Antes da 0091 (banco igual ao de produção): anon lê as 4 views e
// cada usuário vê as duas empresas. Ver docs/homologacao/CONTENCAO-SEGURANCA.md.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const VIEWS = ["v_cash_flow_summary", "v_cash_flow_projection", "inventory_valuation", "v_sales_order_item_margin"] as const;
type Who = { auth: string; label: string };

describe("views financeiras e de estoque: isolamento por empresa (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const owner = new Client({ connectionString: url });
  const tag = randomUUID().slice(0, 8);
  const alfa = randomUUID();
  const beta = randomUUID();
  const VALUE: Record<string, number> = { [alfa]: 1000, [beta]: 2000 };
  const mk = (label: string): Who => ({ auth: randomUUID(), label });
  const alfaAdmin = mk("v.alfa.admin");
  const betaAdmin = mk("v.beta.admin");
  const alfaSemFinanceiro = mk("v.alfa.sem");

  const as = async <T>(who: Who | null, fn: (c: Client) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query("begin");
      if (who) {
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: who.auth, role: "authenticated" }), who.auth]);
      } else {
        await c.query("set local role anon");
      }
      return { ok: true, value: await fn(c) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      await c.query("rollback").catch(() => undefined);
      await c.end();
    }
  };
  const rowsOf = async (who: Who, view: string) => {
    const r = await as(who, async (c) => (await c.query(`select * from public.${view} where company_id = any($1)`, [[alfa, beta]])).rows as Record<string, unknown>[]);
    if (!r.ok) assert.fail(`${view}: ${r.error}`);
    return r.value;
  };
  const addUser = async (who: Who, company: string, role: string) => {
    await owner.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [who.auth, `${who.label}.${tag}@example.com`]);
    const u = await owner.query("insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $5, 'active') returning id", [company, who.auth, `${who.label} ${tag}`, `${who.label}.${tag}@example.com`, `${who.label}.${tag}`]);
    await owner.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [u.rows[0].id, company, role]);
  };

  before(async () => {
    await owner.connect();
    await owner.query("select set_config('educa.auth_link', 'invitation', false)");
    await owner.query("insert into public.companies (id, name) values ($1, $2), ($3, $4)", [alfa, `V-Alfa ${tag}`, beta, `V-Beta ${tag}`]);
    const role = await owner.query("insert into public.roles (company_id, code, name) values ($1, 'so_produtos', 'Só produtos') returning id", [alfa]);
    await owner.query("insert into public.role_permissions (role_id, permission_id) select $1, id from public.permissions where code = 'products.read'", [role.rows[0].id]);
    await addUser(alfaAdmin, alfa, "admin");
    await addUser(betaAdmin, beta, "admin");
    await addUser(alfaSemFinanceiro, alfa, "so_produtos");

    for (const company of [alfa, beta]) {
      const v = VALUE[company];
      await owner.query("insert into public.financial_accounts (company_id, code, name, type, current_balance, status) values ($1, 'CX', 'Caixa sintético', 'BANK', $2, 'active')", [company, v]);
      const cust = await owner.query("insert into public.customers (company_id, code, name, document, type) values ($1, 'CLI-V', 'Cliente sintético', '11222333000181', 'company') returning id", [company]);
      const ar = await owner.query("insert into public.accounts_receivable (company_id, code, customer_id, description, original_amount, due_date) values ($1, 'CR-V', $2, 'Título sintético', $3, current_date + 10) returning id", [company, cust.rows[0].id, v]);
      await owner.query("insert into public.accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount) values ($1, $2, 1, current_date + 10, $3)", [company, ar.rows[0].id, v]);
      const prod = await owner.query("insert into public.products (company_id, code, name, unit) values ($1, 'P-V', 'Produto sintético', 'UN') returning id", [company]);
      const loc = await owner.query(
        "insert into public.warehouse_locations (company_id, warehouse_id, code, status) select company_id, id, 'V-A01', 'active' from public.warehouses where company_id = $1 order by code limit 1 returning id",
        [company]
      );
      await owner.query("insert into public.stock_balances (company_id, product_id, location_id, on_hand) values ($1, $2, $3, $4)", [company, prod.rows[0].id, loc.rows[0].id, v]);
      const so = await owner.query("insert into public.sales_orders (company_id, code, customer_id) values ($1, 'PV-V', $2) returning id", [company, cust.rows[0].id]);
      await owner.query("insert into public.sales_order_items (company_id, order_id, product_id, description, ordered_quantity, unit_price) values ($1, $2, $3, 'Item sintético', 1, $4)", [company, so.rows[0].id, prod.rows[0].id, v]);
    }
  });

  after(async () => {
    await owner.end();
  });

  test("fixture: o dono (sem RLS) vê as duas empresas em cada view", async () => {
    for (const view of VIEWS) {
      const { rows } = await owner.query(`select distinct company_id from public.${view} where company_id = any($1)`, [[alfa, beta]]);
      assert.equal(rows.length, 2, view);
    }
  });

  test("1 — anon não consulta nenhuma das 4 views (permission denied)", async () => {
    for (const view of VIEWS) {
      const r = await as(null, (c) => c.query(`select 1 from public.${view} limit 1`));
      assert.ok(!r.ok && /permission denied/i.test(r.error), `${view}: ${r.ok ? "leu" : r.error}`);
    }
  });

  test("2 — autenticado SEM permissão financeira/estoque não vê valores de nenhuma empresa", async () => {
    for (const view of VIEWS) {
      const rows = await rowsOf(alfaSemFinanceiro, view);
      assert.ok(rows.every((r) => r.company_id === alfa), `${view}: outra empresa`);
      const numbers = rows.flatMap((r) => Object.entries(r).filter(([k]) => /total|amount|value|quantity|balance/.test(k)).map(([, v]) => Number(v)));
      assert.ok(numbers.every((n) => n === 0), `${view}: valores visíveis sem permissão ${JSON.stringify(rows)}`);
    }
  });

  test("3 — Alfa vê só a Alfa, com os próprios valores, nas 4 views", async () => {
    const s = await rowsOf(alfaAdmin, "v_cash_flow_summary");
    assert.deepEqual(s.map((r) => [r.company_id, Number(r.current_balance_total), Number(r.open_receivable_total)]), [[alfa, 1000, 1000]]);
    for (const view of VIEWS) {
      const rows = await rowsOf(alfaAdmin, view);
      assert.ok(rows.length > 0 && rows.every((r) => r.company_id === alfa), `${view}: ${JSON.stringify(rows.map((r) => r.company_id))}`);
    }
    assert.equal(Number((await rowsOf(alfaAdmin, "inventory_valuation"))[0].quantity), 1000);
    assert.equal(Number((await rowsOf(alfaAdmin, "v_sales_order_item_margin"))[0].revenue_amount), 1000);
  });

  test("4 — Beta vê só a Beta, com os próprios valores, nas 4 views", async () => {
    const s = await rowsOf(betaAdmin, "v_cash_flow_summary");
    assert.deepEqual(s.map((r) => [r.company_id, Number(r.current_balance_total), Number(r.open_receivable_total)]), [[beta, 2000, 2000]]);
    for (const view of VIEWS) {
      const rows = await rowsOf(betaAdmin, view);
      assert.ok(rows.length > 0 && rows.every((r) => r.company_id === beta), view);
    }
  });

  test("5 — funções SECURITY DEFINER que leem as views recusam outra empresa e anon", async () => {
    const fns = ["fn_margin_by_product", "fn_margin_by_customer", "fn_margin_by_order", "fn_report_executive", "fn_report_finance", "fn_report_inventory"];
    for (const fn of fns) {
      const cross = await as(alfaAdmin, (c) => c.query(`select * from public.${fn}($1, current_date - 30, current_date + 30)`, [beta]));
      assert.ok(!cross.ok, `${fn}: Alfa leu dados da Beta`);
      const anon = await as(null, (c) => c.query(`select * from public.${fn}($1, current_date - 30, current_date + 30)`, [alfa]));
      assert.ok(!anon.ok, `${fn}: anon executou`);
      const own = await as(alfaAdmin, (c) => c.query(`select * from public.${fn}($1, current_date - 30, current_date + 30)`, [alfa]));
      assert.ok(own.ok, `${fn}: Alfa não leu a própria empresa: ${own.ok ? "" : own.error}`);
    }
    // 0092: margem por pedido falhava sempre (min(uuid)); agora devolve a receita sintética da Alfa.
    const byOrder = await as(alfaAdmin, async (c) => (await c.query("select * from public.fn_margin_by_order($1, current_date - 30, current_date + 30)", [alfa])).rows);
    assert.ok(byOrder.ok && byOrder.value.length === 1 && Number(byOrder.value[0].revenue) === 1000, JSON.stringify(byOrder));
  });

  test("7 — regras fiscais: fn_resolve_applicable_tax_rules não é executável por anon nem por authenticated (0093)", async () => {
    const sig = "public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)";
    const { rows } = await owner.query(`select has_function_privilege('anon', '${sig}', 'execute') a, has_function_privilege('authenticated', '${sig}', 'execute') b`);
    assert.deepEqual(rows[0], { a: false, b: false });
    const r = await as(null, (c) => c.query("select * from public.fn_resolve_applicable_tax_rules($1, null, null, null, null, null, null, null, null, null, null, current_date)", [beta]));
    assert.ok(!r.ok && /permission denied/i.test(r.error), r.ok ? "anon executou" : r.error);
  });

  test("6 — regressão: nenhuma view do schema public concede SELECT a anon nem roda com os direitos do dono", async () => {
    const { rows } = await owner.query(
      `select c.relname, has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
              coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%' as invoker
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`
    );
    const bad = rows.filter((r) => r.anon_select || !r.invoker);
    assert.deepEqual(bad, [], "view acessível a anon ou sem security_invoker");
  });
});
