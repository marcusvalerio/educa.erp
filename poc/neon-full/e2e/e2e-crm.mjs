// E2E do CRM pela API HTTP do app compilado (sessões reais do navegador,
// RLS e funções do banco). Pré-requisito: e2e-crm-setup.mjs no mesmo
// ambiente. Pode rodar várias vezes (cada execução cria registros novos).
//   CRM_STATE=/fora/do/git.json PGDB=crm_app OUT=arquivo.json node poc/neon-full/e2e/e2e-crm.mjs
//
// Cada verificação diz o ESPERADO pelas regras atuais do ATLAS. Quando o
// sistema diverge, sai FAIL com o que veio (não se ajusta a expectativa).
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const state = JSON.parse(fs.readFileSync(process.env.CRM_STATE, "utf8"));
const APP = state.app;
const PGDB = process.env.PGDB ?? "crm_app";
const sql = (q) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-Atc", q]).toString().trim();
const tag = Date.now().toString(36).slice(-5);
let n = 0;
const uniq = () => `${tag}${++n}`;
const cnpj = () => `${String(Date.now()).slice(-8)}${String(++n).padStart(4, "0")}${String(n % 97).padStart(2, "0")}`;

const results = [];
const check = (area, name, ok, detail = "") => {
  results.push({ area, name, ok: !!ok, detail: ok ? "" : String(detail).slice(0, 400) });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${name}${ok ? "" : " — " + String(detail).slice(0, 260)}`);
};

async function session(browser, who) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(state.users[who].email);
  await page.getByLabel(/^Senha/).fill(state.users[who].password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
  const call = (method, url, body) =>
    page.evaluate(
      async ([m, u, b]) => {
        const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) });
        let json = null;
        try {
          json = await r.json();
        } catch {}
        return { status: r.status, body: json, msg: json?.error?.message ?? json?.error ?? "" };
      },
      [method, url, body]
    );
  return { ctx, page, get: (u) => call("GET", u), post: (u, b = {}) => call("POST", u, b), patch: (u, b) => call("PATCH", u, b) };
}
const show = (r) => `${r.status} ${typeof r.msg === "string" ? r.msg : JSON.stringify(r.body).slice(0, 200)}`;
const plain = (m) => typeof m === "string" && m.length > 0 && !/[a-z]+_[a-z_]+|\b(column|relation|violates|constraint|null value|syntax)\b/i.test(m);

const browser = await chromium.launch();
try {
  const G = state.fixtures.gama;
  const D = state.fixtures.delta;
  const admin = await session(browser, "gamaAdmin");
  const seller = await session(browser, "gamaVendedor");
  const reader = await session(browser, "gamaLeitura");
  const other = await session(browser, "deltaAdmin");
  const deltaUser = sql(`select id from users where email='${state.users.deltaAdmin.email}'`);
  const gamaSeller = sql(`select id from users where email='${state.users.gamaVendedor.email}'`);

  // ===================================================================== 4.1 leads
  const newLead = (s, extra = {}) => s.post("/api/leads", { name: `Lead ${uniq()}`, companyName: "Mercado Lua Ltda.", email: "contato@example.com", qualification: "WARM", ...extra });
  {
    const r = await newLead(seller, { document: cnpj(), responsibleUserId: gamaSeller, originId: G.origin });
    check("leads", "Vendedor cria lead (201, status NEW)", r.status === 201 && r.body?.data?.status === "NEW", show(r));
    const id = r.body?.data?.id;
    const e = await seller.patch(`/api/leads/${id}`, { status: "CONTACTED", notes: "Primeiro contato" });
    check("leads", "editar lead aberto (200)", e.status === 200 && e.body?.data?.status === "CONTACTED", show(e));
    const c1 = await seller.post(`/api/leads/${id}/convert-to-customer`);
    check("leads", "converter em cliente NOVO (200, cliente com nome da empresa)", c1.status === 200 && c1.body?.data?.name === "Mercado Lua Ltda.", show(c1));
    const c2 = await seller.post(`/api/leads/${id}/convert-to-customer`);
    check("leads", "converter de novo devolve o MESMO cliente (sem duplicar)", c2.status === 200 && c2.body?.data?.id === c1.body?.data?.id, show(c2));
    check("leads", "representante do cliente fica vazio (responsável é usuário, não representante)", sql(`select coalesce(default_sales_representative_id::text,'') from customers where id='${c1.body?.data?.id}'`) === "", "");
    const ed = await seller.patch(`/api/leads/${id}`, { name: "Outro nome" });
    check("leads", "editar lead CONVERTIDO → 409 com mensagem", ed.status === 409 && plain(ed.msg), show(ed));
    const re = await seller.patch(`/api/leads/${id}`, { status: "NEW" });
    check("leads", "reabrir lead convertido (status NEW) → 409", re.status === 409, show(re));
    const sc = await seller.patch(`/api/leads/${id}`, { status: "CONVERTED" });
    check("leads", "gravar CONVERTED por edição → 422 (só a conversão converte)", sc.status === 422, show(sc));
    check("leads", "lead continua CONVERTED no banco depois das tentativas", sql(`select status||'|'||name from leads where id='${id}'`).startsWith("CONVERTED|Lead"), sql(`select status||'|'||name from leads where id='${id}'`));
    const a = sql(`select string_agg(entity||':'||action, ',' order by created_at) from audit_logs where entity_id in ('${id}','${c1.body?.data?.id}')`);
    check("leads", "auditoria: cliente CREATE e lead UPDATE", a.includes("customers:CREATE") && a.includes("leads:UPDATE"), a);
  }
  {
    const r = await newLead(seller, { document: "" });
    const c = await seller.post(`/api/leads/${r.body?.data?.id}/convert-to-customer`);
    check("leads", "lead SEM documento → 422 com mensagem clara (antes: 500)", c.status === 422 && /CPF\/CNPJ/.test(c.msg), show(c));
  }
  {
    const doc = "11222333000181"; // mesmo CNPJ do cliente já cadastrado, sem máscara
    const r = await newLead(seller, { document: doc });
    const c = await seller.post(`/api/leads/${r.body?.data?.id}/convert-to-customer`);
    check("leads", "documento sem máscara reaproveita o cliente cadastrado com máscara", c.status === 200 && c.body?.data?.id === G.customer, show(c));
  }
  {
    const r = await newLead(seller);
    const o1 = await seller.post(`/api/leads/${r.body?.data?.id}/convert-to-opportunity`, { pipelineId: G.pipeline, stageId: G.stages[0], estimatedValue: 2500 });
    check("leads", "converter em oportunidade (201, OPEN)", o1.status === 201 && o1.body?.data?.status === "OPEN", show(o1));
    const o2 = await seller.post(`/api/leads/${r.body?.data?.id}/convert-to-opportunity`, { pipelineId: G.pipeline, stageId: G.stages[0] });
    check("leads", "converter de novo em oportunidade → 409 (já tem oportunidade aberta)", o2.status === 409 && /já tem a oportunidade/.test(o2.msg), show(o2));
    const bad = await seller.post(`/api/leads/${r.body?.data?.id}/convert-to-opportunity`, { pipelineId: D.pipeline, stageId: D.stages[0] });
    check("leads", "converter usando pipeline de OUTRA empresa → recusado (4xx)", bad.status >= 400 && bad.status < 500, show(bad));
  }
  {
    const r = await reader.post("/api/leads", { name: "Não pode" });
    check("leads", "Somente leitura não cria lead (403)", r.status === 403, show(r));
    const l = await newLead(seller, { document: cnpj() });
    const c = await reader.post(`/api/leads/${l.body?.data?.id}/convert-to-customer`);
    check("leads", "Somente leitura não converte (403)", c.status === 403, show(c));
    const p = await reader.patch(`/api/leads/${l.body?.data?.id}`, { notes: "x" });
    check("leads", "Somente leitura não edita (403)", p.status === 403, show(p));
  }
  {
    const l = await newLead(seller, { document: cnpj() });
    const id = l.body?.data?.id;
    const g = await other.get(`/api/leads/${id}`);
    check("isolamento", "Delta não lê lead da Gama (404)", g.status === 404, show(g));
    const p = await other.patch(`/api/leads/${id}`, { notes: "invasão" });
    check("isolamento", "Delta não edita lead da Gama (404)", p.status === 404, show(p));
    const c = await other.post(`/api/leads/${id}/convert-to-customer`);
    check("isolamento", "Delta não converte lead da Gama em cliente (404, sem revelar que existe)", c.status === 404, show(c));
    const o = await other.post(`/api/leads/${id}/convert-to-opportunity`, { pipelineId: D.pipeline, stageId: D.stages[0] });
    check("isolamento", "Delta não converte lead da Gama em oportunidade (404)", o.status === 404, show(o));
    const list = await other.get("/api/leads");
    check("isolamento", "lista de leads da Delta não traz leads da Gama", list.status === 200 && !(list.body?.data ?? []).some((x) => x.id === id), show(list));
    check("isolamento", "lead da Gama intacto", sql(`select status||'|'||coalesce(notes,'') from leads where id='${id}'`) === "NEW|", sql(`select status||'|'||coalesce(notes,'') from leads where id='${id}'`));
  }
  {
    const r1 = await newLead(seller, { responsibleUserId: deltaUser });
    check("isolamento", "lead com responsável de OUTRA empresa → 422", r1.status === 422, show(r1));
    const r2 = await newLead(seller, { originId: D.origin });
    check("isolamento", "lead com origem de OUTRA empresa → 422", r2.status === 422, show(r2));
    const ok = await newLead(seller);
    const r3 = await seller.patch(`/api/leads/${ok.body?.data?.id}`, { responsibleUserId: deltaUser });
    check("isolamento", "editar lead para responsável de OUTRA empresa → 422", r3.status === 422, show(r3));
  }
  {
    // corrida real: duas requisições ao mesmo tempo
    const l = await newLead(seller, { document: cnpj() });
    const id = l.body?.data?.id;
    const [a, b] = await Promise.all([seller.post(`/api/leads/${id}/convert-to-customer`), admin.post(`/api/leads/${id}/convert-to-customer`)]);
    check("concorrência", "2 conversões simultâneas em cliente: as duas 200 com o MESMO cliente", a.status === 200 && b.status === 200 && a.body?.data?.id === b.body?.data?.id, `${show(a)} | ${show(b)}`);
    const l2 = await newLead(seller);
    const body = { pipelineId: G.pipeline, stageId: G.stages[0] };
    const [x, y] = await Promise.all([seller.post(`/api/leads/${l2.body?.data?.id}/convert-to-opportunity`, body), admin.post(`/api/leads/${l2.body?.data?.id}/convert-to-opportunity`, body)]);
    const statuses = [x.status, y.status].sort().join("/");
    check("concorrência", "2 conversões simultâneas em oportunidade: 201 + 409, 1 oportunidade", statuses === "201/409" && sql(`select count(*) from opportunities where lead_id='${l2.body?.data?.id}'`) === "1", `${show(x)} | ${show(y)}`);
  }

  // ===================================================================== 4.2 oportunidades
  const newOpp = (s, extra = {}) => s.post("/api/opportunities", { title: `Fornecimento ${uniq()}`, customerId: G.customer, pipelineId: G.pipeline, stageId: G.stages[0], estimatedValue: 1000, probability: 20, ...extra });
  {
    const o = await newOpp(seller);
    check("oportunidades", "Vendedor cria oportunidade (201, OPEN)", o.status === 201 && o.body?.data?.status === "OPEN", show(o));
    const id = o.body?.data?.id;
    const e = await seller.patch(`/api/opportunities/${id}`, { title: "Fornecimento mensal", estimatedValue: 3200 });
    check("oportunidades", "editar oportunidade aberta (200)", e.status === 200 && Number(e.body?.data?.estimated_value) === 3200, show(e));
    const m = await seller.post(`/api/opportunities/${id}/move-stage`, { stageId: G.stages[1] });
    check("oportunidades", "mover estágio (transição legítima, 200)", m.status === 200 && m.body?.data?.stage_id === G.stages[1], show(m));
    check("oportunidades", "histórico de estágios registrado (2 entradas)", sql(`select count(*) from opportunity_stage_history where opportunity_id='${id}'`) === "2");
    const m2 = await seller.post(`/api/opportunities/${id}/move-stage`, { stageId: D.stages[0] });
    check("oportunidades", "mover para estágio de OUTRA empresa → recusado (4xx)", m2.status >= 400 && m2.status < 500, show(m2));
    const cs = await seller.post(`/api/opportunities/${id}/close`, { outcome: "WON" });
    check("oportunidades", "Vendedor não fecha negócio (403; fechar é do Gerente/Admin)", cs.status === 403, show(cs));
    const c = await admin.post(`/api/opportunities/${id}/close`, { outcome: "WON" });
    check("oportunidades", "Admin fecha como GANHA (200, probabilidade 100)", c.status === 200 && c.body?.data?.status === "WON" && Number(c.body?.data?.probability) === 100, show(c));
    for (const [label, body] of [["título", { title: "Mudou depois de ganha" }], ["valor", { estimatedValue: 1 }], ["cliente", { customerId: G.customer }]]) {
      const p = await admin.patch(`/api/opportunities/${id}`, body);
      check("oportunidades", `editar ${label} de oportunidade GANHA → 409`, p.status === 409 && plain(p.msg), show(p));
    }
    const mv = await admin.post(`/api/opportunities/${id}/move-stage`, { stageId: G.stages[2] });
    check("oportunidades", "mover estágio de oportunidade ganha → 409", mv.status === 409, show(mv));
    const again = await admin.post(`/api/opportunities/${id}/close`, { outcome: "LOST", lostReason: "teste" });
    check("oportunidades", "fechar de novo → 409", again.status === 409, show(again));
    check("oportunidades", "banco: título e valor intactos depois das tentativas", sql(`select title||'|'||estimated_value::numeric(14,2) from opportunities where id='${id}'`) === "Fornecimento mensal|3200.00", sql(`select title||'|'||estimated_value from opportunities where id='${id}'`));
  }
  {
    const o = await newOpp(seller);
    const c = await admin.post(`/api/opportunities/${o.body?.data?.id}/close`, { outcome: "LOST", lostReason: "Preço acima do orçamento do cliente" });
    check("oportunidades", "fechar como PERDIDA com motivo (200)", c.status === 200 && c.body?.data?.status === "LOST", show(c));
    const p = await seller.patch(`/api/opportunities/${o.body?.data?.id}`, { notes: "reabrindo?" });
    check("oportunidades", "editar oportunidade PERDIDA → 409", p.status === 409, show(p));
  }
  {
    const o1 = await newOpp(seller, { customerId: D.customer });
    check("isolamento", "oportunidade com cliente de OUTRA empresa → 422", o1.status === 422, show(o1));
    const o2 = await newOpp(seller, { ownerUserId: deltaUser });
    check("isolamento", "oportunidade com dono de OUTRA empresa → 422", o2.status === 422, show(o2));
    const ok = await newOpp(seller);
    const p = await seller.patch(`/api/opportunities/${ok.body?.data?.id}`, { customerId: D.customer });
    check("isolamento", "editar oportunidade para cliente de OUTRA empresa → 422", p.status === 422, show(p));
    const g = await other.get(`/api/opportunities/${ok.body?.data?.id}`);
    check("isolamento", "Delta não lê oportunidade da Gama (404)", g.status === 404, show(g));
    const pt = await other.patch(`/api/opportunities/${ok.body?.data?.id}`, { title: "invasão" });
    check("isolamento", "Delta não edita oportunidade da Gama (404)", pt.status === 404, show(pt));
    const mv = await other.post(`/api/opportunities/${ok.body?.data?.id}/move-stage`, { stageId: D.stages[1] });
    check("isolamento", "Delta não move oportunidade da Gama (404)", mv.status === 404, show(mv));
  }

  // ===================================================================== 4.3 orçamento e pedido
  const items = (extra = {}) => [{ productId: G.product, description: "Pão francês (kg)", quantity: 12, unitPrice: 18.9, discount: 0, ...extra }];
  {
    const o = await newOpp(seller);
    const id = o.body?.data?.id;
    const q = await seller.post(`/api/opportunities/${id}/convert-to-quote`, { items: items(), notes: "Proposta inicial" });
    check("orçamento/pedido", "orçamento a partir da oportunidade (201, origem opportunity)", q.status === 201 && q.body?.data?.source_type === "opportunity" && q.body?.data?.source_id === id, show(q));
    const qi = sql(`select unit_price::numeric(14,2)||'|'||quantity::numeric(14,2)||'|'||product_id from sales_quote_items where quote_id='${q.body?.data?.id}'`);
    check("orçamento/pedido", "item gravado com preço, quantidade e produto (camelCase → snake_case)", qi === `18.90|12.00|${G.product}`, qi);
    const od = await seller.post(`/api/opportunities/${id}/convert-to-order`, { items: items({ quantity: 5 }) });
    check("orçamento/pedido", "pedido a partir da oportunidade (201, rascunho, origem opportunity)", od.status === 201 && od.body?.data?.status === "draft" && od.body?.data?.source_type === "opportunity", show(od));
    const oi = sql(`select unit_price::numeric(14,2)||'|'||coalesce(ordered_quantity, 0)::numeric(14,2) from sales_order_items where order_id='${od.body?.data?.id}'`);
    check("orçamento/pedido", "item do pedido gravado com preço e quantidade", oi === "18.90|5.00", oi);
    // regra comercial existente: pedido só a partir de orçamento APROVADO (rascunho → enviado → aprovado)
    const fq0 = await seller.post(`/api/opportunities/${id}/convert-to-order`, { salesQuoteId: q.body?.data?.id });
    check("orçamento/pedido", "pedido a partir de orçamento em RASCUNHO → 409 com mensagem (regra do comercial)", fq0.status === 409 && /aprovado/.test(fq0.msg) && plain(fq0.msg), show(fq0));
    await admin.post(`/api/sales-quotes/${q.body?.data?.id}/send`);
    const ap = await admin.post(`/api/sales-quotes/${q.body?.data?.id}/approve`);
    const fq = await seller.post(`/api/opportunities/${id}/convert-to-order`, { salesQuoteId: q.body?.data?.id });
    check("orçamento/pedido", "pedido a partir do orçamento APROVADO da oportunidade (201, mesmos itens)", ap.status === 200 && fq.status === 201 && sql(`select count(*) from sales_order_items where order_id='${fq.body?.data?.id}'`) === "1", `${show(ap)} | ${show(fq)}`);
    for (const [label, body, re] of [
      ["sem itens", { items: [] }, /item/i],
      ["quantidade zero", { items: items({ quantity: 0 }) }, /quantidade/i],
      ["preço negativo", { items: items({ unitPrice: -1 }) }, /./],
      ["quantidade em texto", { items: items({ quantity: "doze" }) }, /./],
    ]) {
      const r = await seller.post(`/api/opportunities/${id}/convert-to-quote`, body);
      check("orçamento/pedido", `orçamento com ${label} → 422`, r.status === 422 && re.test(r.msg) && plain(r.msg), show(r));
    }
    const ghost = await seller.post(`/api/opportunities/${id}/convert-to-quote`, { items: items({ productId: "00000000-0000-4000-8000-000000000000" }) });
    check("orçamento/pedido", "produto inexistente → 4xx com mensagem, sem orçamento parcial", ghost.status >= 400 && ghost.status < 500 && plain(ghost.msg), show(ghost));
    const dprod = await seller.post(`/api/opportunities/${id}/convert-to-quote`, { items: items({ productId: D.product }) });
    check("isolamento", "orçamento com produto de OUTRA empresa → 4xx", dprod.status >= 400 && dprod.status < 500, show(dprod));
    check("orçamento/pedido", "falhas não deixaram orçamento a mais (1 orçamento da oportunidade)", sql(`select count(*) from sales_quotes where source_type='opportunity' and source_id='${id}'`) === "1", sql(`select count(*) from sales_quotes where source_type='opportunity' and source_id='${id}'`));
    const x = await other.post(`/api/opportunities/${id}/convert-to-quote`, { items: [{ productId: D.product, quantity: 1, unitPrice: 1 }] });
    check("isolamento", "Delta não converte oportunidade da Gama (404)", x.status === 404, show(x));
    const r = await reader.post(`/api/opportunities/${id}/convert-to-quote`, { items: items() });
    check("orçamento/pedido", "Somente leitura não converte (403)", r.status === 403, show(r));
  }
  {
    const o = await newOpp(seller, { customerId: "" });
    const q = await seller.post(`/api/opportunities/${o.body?.data?.id}/convert-to-quote`, { items: items() });
    check("orçamento/pedido", "oportunidade SEM cliente → 422 com mensagem (antes: 500)", q.status === 422 && /cliente/i.test(q.msg), show(q));
  }

  const out = process.env.OUT;
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), pass: results.filter((r) => r.ok).length, fail: results.filter((r) => !r.ok).length, results }, null, 2));
  console.log(`\ncrm: ${results.filter((r) => r.ok).length} PASS, ${results.filter((r) => !r.ok).length} FAIL`);
} finally {
  await browser.close();
}
