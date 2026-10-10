// Preparação do E2E do CRM (DATA_BACKEND=postgres, dublê do Neon Auth) num
// ambiente RECÉM-CRIADO (build-local.sh com as migrations do CRM +
// 10_app_login_role.sql + bootstrap do Owner). Tudo pelo fluxo oficial:
// Owner → empresas → convite do administrador → usuários convidados →
// primeiro acesso pelo link do e-mail.
//
// Empresas fictícias: "Gama CRM" (admin, vendedor, leitura) e "Delta CRM"
// (admin) — a segunda serve para os testes de isolamento.
//
// As senhas são geradas a cada execução e gravadas SÓ no arquivo CRM_STATE,
// que deve ficar FORA do repositório (ex.: /home/user/local-secrets/…).
//   CRM_STATE=/caminho/fora/do/git.json APP=http://localhost:3300 \
//   NEON_BASE=http://localhost:3402/neondb/auth PGDB=crm_app OWNER_EMAIL=… \
//   node poc/neon-full/e2e/e2e-crm-setup.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const need = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const STATE = need("CRM_STATE");
const repo = path.resolve(new URL("../../..", import.meta.url).pathname);
if (path.resolve(STATE).startsWith(repo + path.sep)) throw new Error("CRM_STATE não pode ficar dentro do repositório (tem senhas).");
const APP = process.env.APP ?? "http://localhost:3300";
const MAIL = process.env.MAIL ?? "http://localhost:58025";
const PGDB = need("PGDB");
const OWNER = need("OWNER_EMAIL");
const sql = (q) => execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-Atc", q]).toString().trim();
const pw = () => `${crypto.randomBytes(12).toString("base64url")}#Aa1`;

async function mails(email) {
  const d = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
  return d.messages ?? [];
}
async function lastLink(email) {
  for (let i = 0; i < 40; i++) {
    const m = await mails(email);
    if (m.length) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m[0].ID}`)).json();
      return (full.HTML || full.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("sem e-mail para " + email);
}
async function api(page, url, init = {}) {
  return page.evaluate(
    async ([u, i]) => {
      const r = await fetch(u, { ...i, headers: { "content-type": "application/json", ...(i.headers || {}) } });
      let body = null;
      try {
        body = await r.json();
      } catch {}
      return { status: r.status, body };
    },
    [url, init]
  );
}
async function firstAccess(browser, email, password, invite = true) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(await lastLink(email));
  await page.getByRole("heading", { name: "Crie sua senha" }).waitFor({ timeout: 20000 });
  await page.getByLabel(/^Nova senha/).fill(password);
  await page.getByLabel(/^Confirme a senha/).fill(password);
  await page.getByRole("button", { name: "Criar senha e continuar" }).click();
  if (invite) {
    await page.getByRole("heading", { name: "Aceitar convite" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  }
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
  return { ctx, page };
}
const ok = (label, r, status = [200, 201]) => {
  if (!status.includes(r.status)) throw new Error(`${label}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  console.log(`ok  ${label}`);
  return r.body?.data;
};

const state = { app: APP, users: {}, companies: {}, fixtures: {} };
const browser = await chromium.launch();
try {
  state.users.owner = { email: OWNER, password: pw() };
  const o = await firstAccess(browser, OWNER, state.users.owner.password, false);

  for (const [key, name, adminName, others] of [
    ["gama", "Gama CRM", "Gabriela Gama", [["vendedor", "Victor Vendas", "vendedor"], ["leitura", "Lia Leitura", "leitura"]]],
    ["delta", "Delta CRM", "Davi Delta", []],
  ]) {
    const c = ok(`empresa ${name}`, await api(o.page, "/api/platform/companies", { method: "POST", body: JSON.stringify({ name, branchCode: "MTZ", branchName: `Matriz ${name}` }) }));
    const companyId = c.company_id;
    state.companies[key] = { id: companyId, name };
    const adminEmail = `admin@${key}-crm.test`;
    ok(`convite admin ${name}`, await api(o.page, `/api/platform/companies/${companyId}/admin-invitation`, { method: "POST", body: JSON.stringify({ name: adminName, email: adminEmail }) }));
    state.users[`${key}Admin`] = { email: adminEmail, password: pw(), company: key, role: "admin" };
    const admin = await firstAccess(browser, adminEmail, state.users[`${key}Admin`].password);
    for (const [role, personName, perfil] of others) {
      const email = `${role}@${key}-crm.test`;
      const u = ok(`usuário ${personName}`, await api(admin.page, "/api/users", { method: "POST", body: JSON.stringify({ nome: personName, email, login: `${role}.${key}`, perfil }) }));
      ok(`papel ${role}`, await api(admin.page, `/api/admin/users/${u.id}/roles`, { method: "POST", body: JSON.stringify({ roleId: sql(`select id from roles where company_id='${companyId}' and code='${role}'`) }) }));
      ok(`convite ${personName}`, await api(admin.page, `/api/admin/users/${u.id}/invitation`, { method: "POST", body: "{}" }));
      state.users[`${key}${role[0].toUpperCase()}${role.slice(1)}`] = { email, password: pw(), company: key, role };
      const s = await firstAccess(browser, email, state.users[`${key}${role[0].toUpperCase()}${role.slice(1)}`].password);
      await s.ctx.close();
    }
    // Cadastros mínimos pelo próprio app: funil com 3 estágios, origem, cliente e produto.
    const pipe = ok(`pipeline ${name}`, await api(admin.page, "/api/pipelines", { method: "POST", body: JSON.stringify({ code: "VENDAS", name: "Vendas" }) }));
    const stages = [];
    for (const [i, [code, sname, prob]] of [["QUAL", "Qualificação", 20], ["PROP", "Proposta", 50], ["NEGO", "Negociação", 80]].entries()) {
      stages.push(ok(`estágio ${sname}`, await api(admin.page, "/api/pipeline-stages", { method: "POST", body: JSON.stringify({ pipelineId: pipe.id, code, name: sname, sequence: i + 1, probabilityDefault: prob }) })).id);
    }
    const origin = ok(`origem ${name}`, await api(admin.page, "/api/lead-origins", { method: "POST", body: JSON.stringify({ code: "SITE", name: "Site" }) }));
    const customer = ok(`cliente ${name}`, await api(admin.page, "/api/customers", { method: "POST", body: JSON.stringify({ tipo: "Pessoa Jurídica", nome: `Padaria Sol (${name})`, documento: key === "gama" ? "11.222.333/0001-81" : "22.333.444/0001-55" }) }));
    const product = ok(`produto ${name}`, await api(admin.page, "/api/products", { method: "POST", body: JSON.stringify({ codigo: "PAO-01", descricao: "Pão francês (kg)", categoria: "Padaria", unidade: "KG", precoVenda: 18.9 }) }));
    state.fixtures[key] = { pipeline: pipe.id, stages, origin: origin.id, customer: customer.id, product: product.id };
    await admin.ctx.close();
  }
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`estado gravado em ${STATE} (fora do Git)`);
} finally {
  await browser.close();
}
