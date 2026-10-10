// Painéis Fiscal, Estoque e Produção (migration 0090) conferidos NUMERO A
// NUMERO no PostgreSQL real, não só "respondeu sem erro".
// POC_DATABASE_OWNER_URL: dono de um banco DESCARTÁVEL (nunca produção).
//
// Os dados sintéticos são gravados numa transação DESFEITA no fim. Para isolar
// a lógica de cálculo das dezenas de cadastros obrigatórios (estabelecimento,
// natureza de operação, estrutura de produto...), as linhas são inseridas com
// as FKs desligadas (session_replication_role = replica, só o dono pode) e
// religadas antes de chamar os relatórios, que rodam como usuário comum
// (role authenticated, RLS e checagem de permissão normais).
//
// Antes × depois: num banco sem a 0090 as três funções falham com
// 'column reference "…" is ambiguous'.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const url = process.env.POC_DATABASE_OWNER_URL;
const A = "00000000-0000-0000-0000-000000000001";

describe("painéis Fiscal, Estoque e Produção — valores (PostgreSQL real)", { skip: !url && "POC_DATABASE_OWNER_URL não definida" }, () => {
  const db = new Client({ connectionString: url });
  const B = randomUUID(); // outra empresa, com dados que NÃO podem aparecer em A
  const C = randomUUID(); // empresa sem nenhum dado
  const users = { adminA: randomUUID(), sellerA: randomUUID(), adminC: randomUUID() };
  const any = () => randomUUID();
  let step = 0;

  const as = async (auth: string) => {
    await db.query("reset role");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: auth, role: "authenticated" }), auth]);
  };
  const report = async (fn: string, auth: string, company: string, start: string, end: string) => {
    const sp = `r${++step}`;
    await db.query(`savepoint ${sp}`);
    try {
      await as(auth);
      const { rows } = await db.query(`select * from public.${fn}($1, $2, $3)`, [company, start, end]);
      await db.query(`release savepoint ${sp}`);
      return { ok: true as const, row: rows[0] as Record<string, string | number> };
    } catch (e) {
      await db.query(`rollback to savepoint ${sp}`);
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    } finally {
      await db.query("reset role");
    }
  };
  const num = (v: unknown) => Number(v);

  before(async () => {
    await db.connect();
    await db.query("begin");
    await db.query("select set_config('educa.auth_link', 'invitation', true)");
    await db.query("insert into public.companies (id, name) values ($1, 'Empresa B (relatórios)'), ($2, 'Empresa C (sem dados)')", [B, C]);
    // usuários: admin e vendedor de A (o vendedor não tem os 3 relatórios), admin de C
    const mk = async (auth: string, company: string, roleCompany: string, roleCode: string, name: string) => {
      await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())", [auth, `${name}@example.com`]);
      const u = (await db.query("insert into public.users (company_id, auth_user_id, name, email, login, status) values ($1, $2, $3, $4, $3, 'active') returning id", [company, auth, name, `${name}@example.com`])).rows[0].id;
      // empresa nova: usa o papel criado automaticamente na criação da empresa (0075)
      await db.query("insert into public.user_roles (user_id, role_id) select $1, id from public.roles where company_id = $2 and code = $3", [u, company === roleCompany ? roleCompany : company, roleCode]);
      const n = (await db.query("select count(*)::int n from public.user_roles where user_id = $1", [u])).rows[0].n;
      if (n !== 1) throw new Error(`papel ${roleCode} não encontrado na empresa ${company}`);
    };
    const t = randomUUID().slice(0, 6);
    await mk(users.adminA, A, A, "admin", `rel.admin.${t}`);
    await mk(users.sellerA, A, A, "vendedor", `rel.vend.${t}`);
    await mk(users.adminC, C, A, "admin", `rel.adminc.${t}`);

    await db.query("set local session_replication_role = replica");
    // ---- fiscal (A): set/2026 e out/2026; B tem um documento autorizado com imposto alto
    const fd = async (company: string, direction: string, status: string, date: string, taxes: number) =>
      db.query(
        "insert into public.fiscal_documents (company_id, fiscal_establishment_id, code, type, direction, status, issue_date, operation_nature_id, taxes_amount) values ($1, $2, $3, 'NFE', $4, $5, $6, $7, $8)",
        [company, any(), `DF-${randomUUID().slice(0, 8)}`, direction, status, date, any(), taxes]
      );
    await fd(A, "SAIDA", "AUTHORIZED", "2026-10-02", 100.5);
    await fd(A, "SAIDA", "AUTHORIZED", "2026-10-03", 49.5);
    await fd(A, "ENTRADA", "AUTHORIZED", "2026-10-04", 10);
    await fd(A, "SAIDA", "REJECTED", "2026-10-05", 999); // não autorizado: imposto não soma
    await fd(A, "SAIDA", "DENIED", "2026-10-05", 0);
    await fd(A, "SAIDA", "CANCELLED", "2026-10-06", 30);
    await fd(A, "SAIDA", "DRAFT", "2026-10-07", 0);
    await fd(A, "SAIDA", "READY", "2026-10-08", 0);
    await fd(A, "SAIDA", "AUTHORIZED", "2026-09-15", 77); // fora de outubro
    await fd(B, "SAIDA", "AUTHORIZED", "2026-10-02", 5000);

    // ---- estoque (A): 2 saldos com custo, 1 sem custo (custo nulo → 0), 1 zerado (fora da valorização); B com saldo
    const prod = [any(), any(), any(), any()];
    const loc = any();
    const bal = async (company: string, p: string, onHand: number, cost: number | null) => {
      await db.query("insert into public.stock_balances (company_id, product_id, location_id, on_hand) values ($1, $2, $3, $4)", [company, p, loc, onHand]);
      // custo médio é coluna calculada (total_value / quantity)
      if (cost !== null) await db.query("insert into public.product_cost_balances (company_id, product_id, location_id, quantity, total_value) values ($1, $2, $3, $4, $5)", [company, p, loc, onHand || 1, (onHand || 1) * cost]);
    };
    await bal(A, prod[0], 10, 2.5); // 25
    await bal(A, prod[1], 4, 12.25); // 49
    await bal(A, prod[2], 6, null); // 0 (sem custo)
    await bal(A, prod[3], 0, 3); // fora (on_hand = 0)
    await bal(B, any(), 1000, 1000);
    const mov = async (company: string, p: string, type: string, at: string) =>
      db.query("insert into public.stock_movements (company_id, product_id, location_id, movement_type, quantity, created_at) values ($1, $2, $3, $4, 1, $5)", [company, p, loc, type, at]);
    await mov(A, prod[0], "RECEIPT", "2026-10-01T10:00:00Z");
    await mov(A, prod[0], "RECEIPT", "2026-10-02T10:00:00Z");
    await mov(A, prod[0], "ISSUE", "2026-10-03T10:00:00Z"); // prod[0] teve saída no período
    await mov(A, prod[1], "TRANSFER_OUT", "2026-10-03T10:00:00Z");
    await mov(A, prod[1], "TRANSFER_IN", "2026-10-03T10:00:00Z");
    await mov(A, prod[2], "ADJUSTMENT_IN", "2026-10-04T10:00:00Z");
    await mov(A, prod[1], "ISSUE", "2026-09-20T10:00:00Z"); // saída fora do período
    await mov(B, any(), "RECEIPT", "2026-10-02T10:00:00Z");
    for (const [company, status] of [[A, "active"], [A, "active"], [A, "consumed"], [B, "active"]])
      await db.query("insert into public.stock_reservations (company_id, code, location_id, status) values ($1, $2, $3, $4)", [company, `RES-${randomUUID().slice(0, 6)}`, loc, status]);

    // ---- produção (A): ordens em vários status, quantidades e custos; refugo; B com ordem grande
    const po = async (company: string, status: string, produced: number, cost: number, at: string) =>
      (
        await db.query(
          "insert into public.production_orders (company_id, code, product_id, bom_id, planned_quantity, produced_quantity, unit_id, source_warehouse_id, consumption_location_id, target_warehouse_id, output_location_id, status, material_cost, created_at) values ($1, $2, $3, $4, 10, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id",
          [company, `OP-${randomUUID().slice(0, 6)}`, any(), any(), produced, any(), any(), any(), any(), any(), status, cost, at]
        )
      ).rows[0].id as string;
    const op1 = await po(A, "completed", 8, 120.4, "2026-10-01T10:00:00Z");
    await po(A, "in_progress", 3, 40, "2026-10-02T10:00:00Z");
    await po(A, "released", 0, 0, "2026-10-03T10:00:00Z");
    await po(A, "draft", 0, 0, "2026-10-04T10:00:00Z");
    await po(A, "cancelled", 0, 15, "2026-10-05T10:00:00Z");
    await po(A, "completed", 50, 999, "2026-09-10T10:00:00Z"); // fora do período
    await po(B, "completed", 5000, 50000, "2026-10-01T10:00:00Z");
    const scrap = async (company: string, q: number, at: string) =>
      db.query("insert into public.production_scrap (company_id, production_order_id, product_id, quantity, unit_id, reason, occurred_at) values ($1, $2, $3, $4, $5, 'teste', $6)", [company, op1, any(), q, any(), at]);
    await scrap(A, 1.5, "2026-10-02T10:00:00Z");
    await scrap(A, 0.25, "2026-10-03T10:00:00Z");
    await scrap(A, 9, "2026-09-02T10:00:00Z"); // fora
    await scrap(B, 300, "2026-10-02T10:00:00Z");
    await db.query("set local session_replication_role = origin");
  });

  after(async () => {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  });

  const OCT = ["2026-10-01", "2026-10-31"] as const;

  // ------------------------------------------------------------------ fiscal
  test("Fiscal — outubro da empresa A: contagens por direção/situação e impostos só dos autorizados", async () => {
    const r = await report("fn_report_fiscal", users.adminA, A, ...OCT);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.deepEqual(
      Object.fromEntries(Object.entries(r.row).map(([k, v]) => [k, num(v)])),
      { documents_count: 8, entradas_count: 1, saidas_count: 7, authorized_count: 3, rejected_count: 2, cancelled_count: 1, pending_count: 2, taxes_amount: 160 }
    );
  });

  test("Fiscal — o período muda o resultado (setembro: 1 autorizado, R$ 77)", async () => {
    const r = await report("fn_report_fiscal", users.adminA, A, "2026-09-01", "2026-09-30");
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (r.ok) {
      assert.equal(num(r.row.documents_count), 1);
      assert.equal(num(r.row.taxes_amount), 77);
    }
  });

  // ------------------------------------------------------------------ estoque
  test("Estoque — empresa A: quantidade e valor (custo nulo vale 0; saldo zerado fora), movimentos e reservas do período", async () => {
    const r = await report("fn_report_inventory", users.adminA, A, ...OCT);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.deepEqual(
      Object.fromEntries(Object.entries(r.row).map(([k, v]) => [k, num(v)])),
      // 10 + 4 + 6 = 20 un.; 10×2,50 + 4×12,25 + 6×0 = 74; 2 entradas; 1 saída; 2 transferências; 1 ajuste;
      // 2 reservas ativas; sem saída em outubro: prod[1] e prod[2] (prod[3] tem saldo 0)
      { total_quantity: 20, total_value: 74, receipts_count: 2, issues_count: 1, transfers_count: 2, adjustments_count: 1, reservations_active: 2, products_without_movement: 2 }
    );
  });

  // ------------------------------------------------------------------ produção
  test("Produção — empresa A em outubro: ordens por situação, produzido, custo de material e refugo", async () => {
    const r = await report("fn_report_production", users.adminA, A, ...OCT);
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.deepEqual(
      Object.fromEntries(Object.entries(r.row).map(([k, v]) => [k, num(v)])),
      { orders_count: 5, open_orders: 2, in_progress_orders: 1, completed_orders: 1, cancelled_orders: 1, produced_quantity: 11, consumed_material_cost: 175.4, scrap_quantity: 1.75 }
    );
  });

  // ---------------------------------------- empresa sem dados / período vazio
  test("empresa sem nenhum dado: os três painéis respondem com zeros (não erro, não nulo)", async () => {
    for (const fn of ["fn_report_fiscal", "fn_report_inventory", "fn_report_production"]) {
      const r = await report(fn, users.adminC, C, ...OCT);
      assert.ok(r.ok, `${fn}: ${r.ok ? "" : r.error}`);
      if (r.ok) for (const [k, v] of Object.entries(r.row)) assert.equal(num(v), 0, `${fn}.${k}`);
    }
  });

  test("período invertido (início depois do fim): zeros nos contadores do período, sem erro", async () => {
    const r = await report("fn_report_production", users.adminA, A, "2026-10-31", "2026-10-01");
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (r.ok) assert.equal(num(r.row.orders_count), 0);
  });

  // ------------------------------------------------- isolamento e permissão
  test("isolamento: o administrador de A pedindo os painéis da empresa B é recusado", async () => {
    for (const fn of ["fn_report_fiscal", "fn_report_inventory", "fn_report_production"]) {
      const r = await report(fn, users.adminA, B, ...OCT);
      assert.equal(r.ok, false, fn);
      if (!r.ok) assert.match(r.error, /Permissão negada/);
    }
  });

  test("permissão: o Vendedor (sem *_reports.view) é recusado nos três painéis", async () => {
    for (const fn of ["fn_report_fiscal", "fn_report_inventory", "fn_report_production"]) {
      const r = await report(fn, users.sellerA, A, ...OCT);
      assert.equal(r.ok, false, fn);
      if (!r.ok) assert.match(r.error, /Permissão negada \((fiscal|inventory|production)_reports\.view\)/);
    }
  });

  test("tipos e nomes de saída inalterados (o que a API e as telas leem)", async () => {
    const { rows } = await db.query(
      "select proname, pg_get_function_result(oid) r from pg_proc where proname in ('fn_report_fiscal','fn_report_inventory','fn_report_production') order by proname"
    );
    assert.deepEqual(rows.map((x) => x.r), [
      "TABLE(documents_count integer, entradas_count integer, saidas_count integer, authorized_count integer, rejected_count integer, cancelled_count integer, pending_count integer, taxes_amount numeric)",
      "TABLE(total_quantity numeric, total_value numeric, receipts_count integer, issues_count integer, transfers_count integer, adjustments_count integer, reservations_active integer, products_without_movement integer)",
      "TABLE(orders_count integer, open_orders integer, in_progress_orders integer, completed_orders integer, cancelled_orders integer, produced_quantity numeric, consumed_material_cost numeric, scrap_quantity numeric)",
    ]);
  });
});
