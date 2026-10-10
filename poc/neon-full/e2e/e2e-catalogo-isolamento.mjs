// Isolamento multiempresa do catálogo PELO APP (sessão real, rotas /api):
// Gama (Administrador, Vendedor, Somente leitura) × Delta (Administrador).
// Confere: a empresa vem da sessão (parâmetro/corpo com outra empresa não
// muda nada), id de outra empresa → 404, id relacionado de outra empresa →
// 422 sem gravar, leitura ≠ escrita (403), e a tela de Produtos.
// Pré-requisito: e2e-crm-setup.mjs (empresas, usuários e fixtures).
//   CRM_STATE=/fora/do/git.json PGDB=crm_app OUT=arquivo.json node poc/neon-full/e2e/e2e-catalogo-isolamento.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const state = JSON.parse(fs.readFileSync(process.env.CRM_STATE, "utf8"));
const APP = state.app;
const PGDB = process.env.PGDB ?? "crm_app";
const psql = (q) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-Atc", q]).toString().trim();
const results = [];
const check = (area, name, ok, detail = "") => {
  results.push({ area, name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${ok ? "" : " — " + String(detail).slice(0, 260)}`);
};
const gama = state.companies.gama.id;
const delta = state.companies.delta.id;
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const deltaUnit = psql(`select id from units where company_id='${delta}' and code='UN'`);
const deltaCategory = psql(`select id from product_categories where company_id='${delta}' order by created_at limit 1`) || null;
const gamaUnit = psql(`select id from units where company_id='${gama}' and code='UN'`);
const gamaKg = psql(`select id from units where company_id='${gama}' and code='KG'`);
const listOf = (body) => (Array.isArray(body?.data) ? body.data : Array.isArray(body?.data?.items) ? body.data.items : Array.isArray(body?.items) ? body.items : []);

const browser = await chromium.launch();
async function session(who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(state.users[who].email);
  await page.getByLabel(/^Senha/).fill(state.users[who].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
  const call = (method, path, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        const res = await fetch(p, { method: m, headers: b ? { "content-type": "application/json" } : undefined, body: b ? JSON.stringify(b) : undefined });
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        return { status: res.status, body: json, text: text.slice(0, 600) };
      },
      [method, path, body]
    );
  return { ctx, page, call };
}
const noLeak = (r) => !new RegExp(`${delta}|${deltaUnit}|constraint|violates|Key \\(`, "i").test(r.text);

try {
  const admin = await session("gamaAdmin");
  const vend = await session("gamaVendedor");
  const leit = await session("gamaLeitura");
  const dAdmin = await session("deltaAdmin");

  // ---------------------------------------------------------- leitura
  for (const [who, s] of [["Administrador", admin], ["Vendedor", vend], ["Somente leitura", leit]]) {
    const r = await s.call("GET", "/api/units?pageSize=200");
    const ids = listOf(r.body).map((u) => u.id);
    const companies = ids.length ? psql(`select string_agg(distinct company_id::text, ',') from units where id in (${ids.map((i) => `'${i}'`).join(",")})`) : "";
    check("leitura", `Gama ${who}: GET /api/units → 200 só com unidades da Gama (${ids.length})`, r.status === 200 && ids.length > 0 && companies === gama, `${r.status} ${companies} ${r.text}`);
  }
  {
    const r = await dAdmin.call("GET", "/api/units?pageSize=200");
    const ids = listOf(r.body).map((u) => u.id);
    check("leitura", "Delta Administrador: GET /api/units → só unidades da Delta", r.status === 200 && ids.includes(deltaUnit) && !ids.includes(gamaUnit), `${r.status} ${ids.length}`);
  }
  for (const [who, s] of [["Administrador", admin], ["Somente leitura", leit]]) {
    for (const path of ["/api/product-categories", "/api/product-brands", "/api/unit-conversions", "/api/products"]) {
      const r = await s.call("GET", path);
      check("leitura", `Gama ${who}: GET ${path} → 200`, r.status === 200, `${r.status} ${r.text}`);
    }
  }

  // ------------------------------------------- tenant vindo do cliente
  {
    const r = await admin.call("GET", `/api/units?companyId=${delta}&company_id=${delta}&pageSize=200`);
    const ids = listOf(r.body).map((u) => u.id);
    check("tenant", "companyId da Delta na URL é ignorado (continua só Gama)", r.status === 200 && !ids.includes(deltaUnit) && ids.includes(gamaUnit), `${r.status} ${ids.length}`);
    const c = await admin.call("POST", "/api/units", { codigo: `T${tag}`, nome: "Unidade com empresa no corpo", company_id: delta, companyId: delta });
    const where = c.body?.data?.id ? psql(`select company_id from units where id='${c.body.data.id}'`) : "";
    check("tenant", "company_id da Delta no corpo do POST é ignorado: unidade criada na Gama", c.status === 201 && where === gama, `${c.status} ${where} ${c.text}`);
  }

  // ------------------------------------------- id de outra empresa
  for (const [method, body] of [["GET"], ["PATCH", { nome: "Invadida" }], ["DELETE"]]) {
    const r = await admin.call(method, `/api/units/${deltaUnit}`, body);
    check("id direto", `${method} /api/units/<unidade da Delta> → 404 sem dados`, r.status === 404 && noLeak(r), `${r.status} ${r.text}`);
  }
  check("id direto", "unidade da Delta intacta", psql(`select name from units where id='${deltaUnit}'`) !== "Invadida");

  // ------------------------------------------- referências cruzadas
  {
    const before = psql(`select count(*) from unit_conversions where company_id='${gama}'`);
    const r = await admin.call("POST", "/api/unit-conversions", { unidadeOrigemId: gamaKg, unidadeDestinoId: deltaUnit, fator: 2 });
    const after = psql(`select count(*) from unit_conversions where company_id='${gama}'`);
    check("referência", "conversão Gama → unidade da Delta: 422 genérico, nada gravado", r.status === 422 && before === after && noLeak(r), `${r.status} ${before}->${after} ${r.text}`);
    psql(`delete from unit_conversions where company_id='${gama}' and from_unit_id='${gamaKg}' and to_unit_id='${gamaUnit}'`);
    const ok = await admin.call("POST", "/api/unit-conversions", { unidadeOrigemId: gamaKg, unidadeDestinoId: gamaUnit, fator: 1000 });
    check("referência", "conversão entre unidades da própria Gama: 201", ok.status === 201, `${ok.status} ${ok.text}`);
  }
  {
    const base = { codigo: `PX${tag}`, descricao: "Produto com unidade de outra empresa", categoria: "Geral", unidade: "UN", unidadeId: deltaUnit };
    const r = await admin.call("POST", "/api/products", base);
    check("referência", "produto da Gama com unidade da Delta: 422, nada gravado", r.status === 422 && psql(`select count(*) from products where code='PX${tag}'`) === "0" && noLeak(r), `${r.status} ${r.text}`);
    if (deltaCategory) {
      const c = await admin.call("POST", "/api/products", { ...base, codigo: `PY${tag}`, unidadeId: gamaUnit, categoriaId: deltaCategory });
      check("referência", "produto da Gama com categoria da Delta: 422", c.status === 422 && noLeak(c), `${c.status} ${c.text}`);
    }
    const okp = await admin.call("POST", "/api/products", { ...base, codigo: `PG${tag}`, descricao: "Produto Gama ok", unidadeId: gamaUnit });
    check("produtos", "criar produto com unidade da própria empresa: 201", okp.status === 201, `${okp.status} ${okp.text}`);
    if (okp.body?.data?.id) {
      const e = await admin.call("PATCH", `/api/products/${okp.body.data.id}`, { descricao: "Produto Gama editado" });
      check("produtos", "editar produto: 200", e.status === 200, `${e.status} ${e.text}`);
      const kept = psql(`select coalesce(unit_id::text, 'NULL') from products where id='${okp.body.data.id}'`);
      check("produtos", "edição parcial (só a descrição) mantém a unidade do produto", kept === gamaUnit, `unit_id=${kept}`);
      const x = await admin.call("PATCH", `/api/products/${okp.body.data.id}`, { unidadeId: deltaUnit });
      check("referência", "editar produto trocando para unidade da Delta: 422 e unidade mantida", x.status === 422 && psql(`select unit_id from products where id='${okp.body.data.id}'`) === gamaUnit, `${x.status} ${x.text}`);
    }
  }

  // ------------------------------------------- leitura não vira escrita
  for (const [who, s] of [["Somente leitura", leit], ["Vendedor", vend]]) {
    const c = await s.call("POST", "/api/units", { codigo: `L${tag}${who.length}`, nome: "Tentativa" });
    check("escrita", `Gama ${who}: POST /api/units → 403`, c.status === 403, `${c.status} ${c.text}`);
    const u = await s.call("PATCH", `/api/units/${gamaUnit}`, { nome: "Alterada" });
    check("escrita", `Gama ${who}: PATCH /api/units → 403`, u.status === 403, `${u.status} ${u.text}`);
    const d = await s.call("DELETE", `/api/units/${gamaKg}`);
    check("escrita", `Gama ${who}: DELETE /api/units → 403`, d.status === 403, `${d.status} ${d.text}`);
    const p = await s.call("POST", "/api/product-categories", { codigo: `C${tag}${who.length}`, nome: "Tentativa" });
    check("escrita", `Gama ${who}: POST /api/product-categories → 403`, p.status === 403, `${p.status} ${p.text}`);
  }

  // ------------------------------------------- exportação × permissão da entidade
  {
    // Vendedor ganha import_export.export só durante o teste (não tem users.read).
    const role = psql(`select id from roles where company_id='${gama}' and code='vendedor' and is_system`);
    psql(`insert into role_permissions (role_id, permission_id) select '${role}', id from permissions where code = 'import_export.export' on conflict do nothing`);
    try {
      const users = await vend.call("GET", "/api/exports?entityType=users&format=csv");
      check("exportação", "Vendedor com import_export.export e sem users.read: exportar usuários → 403", users.status === 403 && !/@/.test(users.text.replace(/users\.read/, "")), `${users.status} ${users.text.slice(0, 120)}`);
      const customers = await vend.call("GET", "/api/exports?entityType=customers&format=csv");
      check("exportação", "Vendedor exporta clientes (tem customers.read) → 200 só da Gama", customers.status === 200 && !customers.text.includes("Delta"), `${customers.status}`);
    } finally {
      psql(`delete from role_permissions where role_id='${role}' and permission_id=(select id from permissions where code='import_export.export')`);
    }
  }

  // ------------------------------------------- tela de Produtos
  for (const [who, s] of [["Administrador", admin], ["Somente leitura", leit]]) {
    const errors = [];
    s.page.on("response", (r) => r.url().includes("/api/") && r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
    await s.page.goto(`${APP}/app/cadastros/produtos`);
    await s.page.waitForLoadState("networkidle").catch(() => {});
    await s.page.waitForTimeout(1200);
    const text = await s.page.locator("main").innerText().catch(() => "");
    check("tela", `Produtos (${who}): lista carrega sem aviso de informações não carregadas e sem chamadas recusadas`, /Pão francês/.test(text) && !/complementares não foram carregadas/i.test(text) && errors.length === 0, `${errors.join(", ")} ${text.slice(0, 200)}`);
    if (process.env.SHOTS) await s.page.screenshot({ path: `${process.env.SHOTS}/produtos-${who === "Administrador" ? "admin" : "leitura"}-0091.png` });
  }
  for (const s of [admin, vend, leit, dAdmin]) await s.ctx.close();
} finally {
  await browser.close();
}
const out = process.env.OUT;
if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), pass: results.filter((x) => x.ok).length, fail: results.filter((x) => !x.ok).length, results }, null, 2));
console.log(`\ncatalogo-isolamento: ${results.filter((x) => x.ok).length} PASS, ${results.filter((x) => !x.ok).length} FAIL`);
