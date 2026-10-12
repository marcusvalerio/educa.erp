// Rotas que dependem dos objetos tocados pela contenção (views financeiras e
// de estoque, funções de margem/relatórios que leem a view de margem), pelo
// app com sessão real. Para cada usuário e rota: status = 200 se o papel tem a
// permissão da rota, 403 se não tem (nunca 500); com 200, os números da API
// são os mesmos do banco lidos pelo dono, recortados na empresa do usuário.
// Sem sessão: 401. Roda igual antes e depois da contenção — a diferença entre
// as duas execuções é a evidência de regressão (deve ser nenhuma).
// Pré-requisito: e2e-crm-setup.mjs. Dados sintéticos com sufixo aleatório.
//   CRM_STATE=/fora/do/git.json PGDB=crm_app OUT=arquivo.json node poc/neon-full/e2e/e2e-contencao-rotas.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const state = JSON.parse(fs.readFileSync(process.env.CRM_STATE, "utf8"));
const APP = state.app;
const PGDB = process.env.PGDB ?? "crm_app";
const psql = (q) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-v", "ON_ERROR_STOP=1", "-Atc", q]).toString().trim();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : " — " + String(detail).slice(0, 260)}`);
};
const gama = state.companies.gama.id;
const delta = state.companies.delta.id;
const tag = crypto.randomBytes(3).toString("hex");
const start = "2026-01-01";
const end = "2026-12-31";

// Dados sintéticos nas duas empresas (valores distintos para detectar vazamento).
for (const [company, v] of [[gama, 1111], [delta, 2222]]) {
  psql(`do $$
  declare c uuid; ar uuid; p uuid; l uuid; so uuid;
  begin
    perform set_config('educa.auth_link', 'invitation', true);
    insert into financial_accounts (company_id, code, name, type, current_balance, status) values ('${company}', 'CX-${tag}', 'Caixa sintético ${tag}', 'BANK', ${v}, 'active');
    insert into customers (company_id, code, name, document, type) values ('${company}', 'CLI-${tag}', 'Cliente sintético ${tag}', '11222333000181', 'company') returning id into c;
    insert into accounts_receivable (company_id, code, customer_id, description, original_amount, due_date) values ('${company}', 'CR-${tag}', c, 'Título sintético', ${v}, current_date + 10) returning id into ar;
    insert into accounts_receivable_installments (company_id, receivable_id, installment_number, due_date, amount) values ('${company}', ar, 1, current_date + 10, ${v});
    insert into products (company_id, code, name, unit) values ('${company}', 'P-${tag}', 'Produto sintético ${tag}', 'UN') returning id into p;
    insert into warehouse_locations (company_id, warehouse_id, code, status) select company_id, id, 'C-${tag}', 'active' from warehouses where company_id = '${company}' order by code limit 1 returning id into l;
    insert into stock_balances (company_id, product_id, location_id, on_hand) values ('${company}', p, l, ${v});
    insert into sales_orders (company_id, code, customer_id) values ('${company}', 'PV-${tag}', c) returning id into so;
    insert into sales_order_items (company_id, order_id, product_id, description, ordered_quantity, unit_price) values ('${company}', so, p, 'Item sintético', 1, ${v});
  end $$`);
}

/** Função do banco executada como o usuário (papel authenticated + JWT), como o app faz por RPC. */
function asUser(email, sql) {
  const sub = psql(`select auth_user_id from users where email='${email}'`);
  const claims = JSON.stringify({ sub, role: "authenticated" });
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-At", "-c", `begin; set local role authenticated; select set_config('request.jwt.claims', '${claims}', true) is not null, set_config('request.jwt.claim.sub', '${sub}', true) is not null; ${sql}; rollback;`]).toString().trim().split("\n").filter((l) => l !== "t|t" && l !== "BEGIN" && l !== "ROLLBACK" && l !== "SET").pop();
}
const perm = (email, code) => psql(`select exists (select 1 from users u join user_roles ur on ur.user_id = u.id join role_permissions rp on rp.role_id = ur.role_id join permissions pe on pe.id = rp.permission_id where u.email = '${email}' and pe.code = '${code}')`) === "t";
const num = (x) => Math.round(Number(x ?? 0) * 100) / 100;
const routes = [
  {
    path: "/api/cash-flow-summary", perm: "financial_transactions.view",
    same: (d) => { const r = psql(`select coalesce(sum(current_balance_total),0)||'|'||coalesce(sum(open_receivable_total),0)||'|'||coalesce(sum(open_payable_total),0) from v_cash_flow_summary where company_id = '${gama}'`).split("|").map(num); return [r, [num(d.current_balance_total), num(d.open_receivable_total), num(d.open_payable_total)]]; },
  },
  {
    path: "/api/cash-flow-projection", perm: "financial_transactions.view",
    same: (d) => [psql(`select count(*) from v_cash_flow_projection where company_id = '${gama}'`), String(d.length)],
  },
  {
    path: "/api/inventory-valuation", perm: "inventory.valuation.view",
    same: (d) => [psql(`select count(*)||'|'||coalesce(sum(quantity),0)::numeric(18,2) from inventory_valuation where company_id = '${gama}'`), `${d.length}|${d.reduce((s, r) => s + Number(r.quantity), 0).toFixed(2)}`],
  },
  ...["product", "customer", "order"].map((k) => ({
    path: `/api/controlling/margin-by-${k}?periodStart=${start}&periodEnd=${end}`, perm: "controlling.view",
    same: (d, email) => [asUser(email, `select coalesce(sum(revenue),0)::numeric(18,2) from public.fn_margin_by_${k}('${gama}', '${start}', '${end}')`), d.reduce((s, r) => s + Number(r.revenue ?? 0), 0).toFixed(2)],
  })),
  ...[["executive", "reports.view", "fn_report_executive"], ["finance", "financial_reports.view", "fn_report_finance"], ["inventory", "inventory_reports.view", "fn_report_inventory"]].map(([api, p, fn]) => ({
    path: `/api/reports/${api}?periodStart=${start}&periodEnd=${end}`, perm: p,
    same: (d, email) => {
      const expected = JSON.parse(asUser(email, `select row_to_json(t) from public.${fn}('${gama}', '${start}', '${end}') t`));
      return [Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, num(v)])), Object.fromEntries(Object.keys(expected).map((k) => [k, num(d[k])]))];
    },
  })),
];

const browser = await chromium.launch();
try {
  const anonCtx = await browser.newContext();
  for (const r of routes) {
    const res = await anonCtx.request.get(`${APP}${r.path}`);
    check(`sem sessão ${r.path.split("?")[0]} → 401`, res.status() === 401, res.status());
  }
  await anonCtx.close();
  for (const who of ["gamaAdmin", "gamaVendedor", "gamaLeitura"]) {
    const email = state.users[who].email;
    const ctx = await browser.newContext({ locale: "pt-BR" });
    const page = await ctx.newPage();
    await page.goto(`${APP}/login`);
    await page.getByLabel(/^E-mail/).fill(email);
    await page.getByLabel(/^Senha/).fill(state.users[who].password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
    for (const r of routes) {
      const res = await page.evaluate(async (u) => { const x = await fetch(u); return { status: x.status, body: await x.json().catch(() => null) }; }, r.path);
      const expected = perm(email, r.perm) ? 200 : 403;
      check(`${who} ${r.path.split("?")[0]} → ${expected}`, res.status === expected, `${res.status} ${JSON.stringify(res.body).slice(0, 200)}`);
      if (res.status === 200) {
        const data = res.body?.data;
        const nums = []; JSON.stringify(data, (_k, v) => { if (typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))) nums.push(Number(v)); return v; });
        const leak = JSON.stringify(data).includes(delta) || nums.includes(2222);
        check(`${who} ${r.path.split("?")[0]}: sem dado da outra empresa`, !leak, JSON.stringify(data).slice(0, 200));
        const [db, api] = r.same(data, email);
        check(`${who} ${r.path.split("?")[0]}: API = banco (${JSON.stringify(db)})`, JSON.stringify(db) === JSON.stringify(api), `${JSON.stringify(api)} × ${JSON.stringify(db)}`);
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ when: new Date().toISOString(), db: PGDB, results }, null, 2));
process.exit(failed ? 1 : 0);
