// As 4 views financeiras/estoque (v_cash_flow_summary, v_cash_flow_projection,
// inventory_valuation, v_sales_order_item_margin) e as funções SECURITY
// DEFINER que as leem, com dados SINTÉTICOS em duas empresas e RLS real.
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca produção).
//
// Valores por empresa: Alfa = 1000, Beta = 2000 (saldo, a receber, estoque e
// receita do pedido), para que qualquer vazamento apareça como número da outra
// empresa. Antes da 0091 (banco igual ao de produção): anon lê as 4 views e
// cada usuário vê as duas empresas. Desde a 0094 só o dono e service_role
// (cliente administrativo) leem as views; os casos "segunda barreira" concedem
// SELECT a authenticated dentro da transaction do teste (desfeita no fim) para
// provar que, mesmo assim, o RLS das tabelas limita à empresa do usuário.
// Ver docs/homologacao/CONTENCAO-SEGURANCA.md.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const VIEWS = ["v_cash_flow_summary", "v_cash_flow_projection", "inventory_valuation", "v_sales_order_item_margin"] as const;
type Who = { auth: string; label: string };
type As = { grantViews?: boolean; role?: "service_role" };

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

  const as = async <T>(who: Who | null, fn: (c: Client) => Promise<T>, opts: As = {}): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const c = new Client({ connectionString: url });
    await c.connect();
    try {
      await c.query("begin");
      // Concessão temporária (só nesta transaction): simula alguém voltar a dar SELECT a authenticated.
      if (opts.grantViews) await c.query(`grant select on ${VIEWS.map((v) => `public.${v}`).join(", ")} to authenticated`);
      if (opts.role === "service_role") {
        await c.query("set local role service_role");
      } else if (who) {
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
  const rowsOf = async (who: Who, view: string, opts: As = { grantViews: true }) => {
    const r = await as(who, async (c) => (await c.query(`select * from public.${view} where company_id = any($1)`, [[alfa, beta]])).rows as Record<string, unknown>[], opts);
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

  test("1b — authenticated (qualquer papel, inclusive administrador) não consulta as 4 views (0094)", async () => {
    for (const who of [alfaAdmin, betaAdmin, alfaSemFinanceiro]) {
      for (const view of VIEWS) {
        const r = await as(who, (c) => c.query(`select 1 from public.${view} limit 1`));
        assert.ok(!r.ok && /permission denied/i.test(r.error), `${who.label} ${view}: ${r.ok ? "leu" : r.error}`);
      }
    }
  });

  test("1c — service_role (cliente administrativo do app) continua lendo as 4 views", async () => {
    for (const view of VIEWS) {
      const r = await as(null, async (c) => (await c.query(`select distinct company_id from public.${view} where company_id = any($1)`, [[alfa, beta]])).rows, { role: "service_role" });
      assert.ok(r.ok && r.value.length === 2, `${view}: ${r.ok ? JSON.stringify(r.value) : r.error}`);
    }
  });

  test("2 — segunda barreira: autenticado SEM permissão financeira/estoque não vê valores de nenhuma empresa", async () => {
    for (const view of VIEWS) {
      const rows = await rowsOf(alfaSemFinanceiro, view);
      assert.ok(rows.every((r) => r.company_id === alfa), `${view}: outra empresa`);
      const numbers = rows.flatMap((r) => Object.entries(r).filter(([k]) => /total|amount|value|quantity|balance/.test(k)).map(([, v]) => Number(v)));
      assert.ok(numbers.every((n) => n === 0), `${view}: valores visíveis sem permissão ${JSON.stringify(rows)}`);
    }
  });

  test("3 — segunda barreira: Alfa vê só a Alfa, com os próprios valores, nas 4 views", async () => {
    const s = await rowsOf(alfaAdmin, "v_cash_flow_summary");
    assert.deepEqual(s.map((r) => [r.company_id, Number(r.current_balance_total), Number(r.open_receivable_total)]), [[alfa, 1000, 1000]]);
    for (const view of VIEWS) {
      const rows = await rowsOf(alfaAdmin, view);
      assert.ok(rows.length > 0 && rows.every((r) => r.company_id === alfa), `${view}: ${JSON.stringify(rows.map((r) => r.company_id))}`);
    }
    assert.equal(Number((await rowsOf(alfaAdmin, "inventory_valuation"))[0].quantity), 1000);
    assert.equal(Number((await rowsOf(alfaAdmin, "v_sales_order_item_margin"))[0].revenue_amount), 1000);
  });

  test("4 — segunda barreira: Beta vê só a Beta, com os próprios valores, nas 4 views", async () => {
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

  test("7 — regras fiscais: fn_resolve_applicable_tax_rules só é executável pelo dono (0093, 0094)", async () => {
    const sig = "public.fn_resolve_applicable_tax_rules(uuid,uuid,uuid,text,uuid,uuid,text,text,text,uuid,uuid,date)";
    const { rows } = await owner.query(
      `select has_function_privilege('anon', '${sig}', 'execute') a, has_function_privilege('authenticated', '${sig}', 'execute') b,
              has_function_privilege('service_role', '${sig}', 'execute') s,
              (select count(*)::int from pg_proc p, aclexplode(p.proacl) x where p.oid = '${sig}'::regprocedure and x.grantee <> p.proowner) outros`
    );
    assert.deepEqual(rows[0], { a: false, b: false, s: false, outros: 0 });
    const call = "select * from public.fn_resolve_applicable_tax_rules($1, null, null, null, null, null, null, null, null, null, null, current_date)";
    const anon = await as(null, (c) => c.query(call, [beta]));
    assert.ok(!anon.ok && /permission denied/i.test(anon.error), anon.ok ? "anon executou" : anon.error);
    const user = await as(alfaAdmin, (c) => c.query(call, [beta]));
    assert.ok(!user.ok && /permission denied/i.test(user.error), user.ok ? "authenticated executou" : user.error);
    const service = await as(null, (c) => c.query(call, [beta]), { role: "service_role" });
    assert.ok(!service.ok && /permission denied/i.test(service.error), service.ok ? "service_role executou" : service.error);
  });

  test("6 — regressão: nenhuma view do schema public concede privilégio algum a anon/authenticated/PUBLIC nem roda com os direitos do dono", async () => {
    // has_table_privilege segue herança de papéis e PUBLIC; aclexplode pega concessão direta a PUBLIC (grantee 0).
    const privs = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const { rows } = await owner.query(
      `select c.relname,
              (select array_agg(r || ':' || p) from unnest(array['anon', 'authenticated']) r, unnest($1::text[]) p where has_table_privilege(r, c.oid, p)) as user_privs,
              exists (select 1 from aclexplode(c.relacl) x where x.grantee = 0 or x.grantee in ('anon'::regrole, 'authenticated'::regrole)) as public_grant,
              coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%' as invoker
       from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')`,
      [privs]
    );
    assert.ok(rows.length >= VIEWS.length, "views não encontradas");
    const bad = rows.filter((r) => r.user_privs || r.public_grant || !r.invoker);
    assert.deepEqual(bad, [], "view com privilégio para anon/authenticated/PUBLIC ou sem security_invoker");
  });
});
