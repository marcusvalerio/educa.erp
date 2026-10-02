// Base do teste multiempresa (7 empresas). Nenhum segredo é gravado em
// evidência: senhas vêm do ambiente, campos de senha e links com token são
// mascarados nas capturas; resultados só guardam status/mensagem.
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import("/home/user/educa-app/node_modules/playwright/index.mjs");

export const APP = (process.env.APP ?? "http://localhost:3200").replace(/\/+$/, "");
export const OUT = process.env.OUT ?? "/home/user/educa-app/docs/homologacao/evidencias/teste-48-usuarios";
export const PASS = process.env.R48_PASSWORD; // contas criadas nesta rodada
export const OWNER_PASS = process.env.HOMOLOG_PASSWORD; // contas @atlaserp.test já existentes
if (!PASS || !OWNER_PASS) throw new Error("Defina R48_PASSWORD e HOMOLOG_PASSWORD.");
export const OWNER = "owner@atlaserp.test";
const MAIL = process.env.MAIL_SINK ?? "http://localhost:58025";

export const DIRS = {
  empresas: "01-empresas", usuarios: "02-usuarios", rbac: "03-rbac", isolamento: "04-isolamento",
  comercial: "05-comercial", estoque: "06-estoque", financeiro: "07-financeiro", fiscal: "08-fiscal",
  logistica: "09-logistica", auditoria: "10-auditoria", usabilidade: "11-usabilidade", concorrencia: "12-concorrencia",
  dia: "13-dia-simultaneo", erros: "14-erros", dados: "15-dados", correcoes: "16-correcoes", compras: "17-compras",
};
for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// ------------------------------------------------------------ estado entre fases
const STATE_FILE = path.join(OUT, "state.json");
export const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : { companies: {} };
export const save = () => fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ------------------------------------------------------------ registros
const LOG_FILE = path.join(OUT, "resultados.jsonl");
export function record(entry) {
  const row = { at: new Date().toISOString(), ...entry };
  fs.appendFileSync(LOG_FILE, JSON.stringify(row) + "\n");
  const tag = row.kind === "issue" ? "PROBLEMA" : row.result;
  console.log(`${String(tag).padEnd(8)} [${row.area ?? "-"}] ${row.company ? row.company + " · " : ""}${row.name}${row.result !== "PASS" && row.actual ? " — " + String(row.actual).slice(0, 220) : ""}`);
  return row.result === "PASS";
}
/** result: PASS | FAIL | BLOCKED */
export const check = (area, name, ok, { company = null, user = null, target = null, expected = null, actual = "", evidence = null, blocked = false } = {}) =>
  record({ kind: "check", area, name, result: blocked ? "BLOCKED" : ok ? "PASS" : "FAIL", company, user, target, expected, actual: String(actual ?? ""), evidence });
export const issue = (i) => record({ kind: "issue", ...i });

// ------------------------------------------------------------ capturas
export async function shot(page, dir, name, { full = false, mask = [], locator = null } = {}) {
  const rel = path.join(DIRS[dir] ?? dir, `${name}.png`);
  fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
  await page.waitForTimeout(300);
  const masks = [page.locator('input[type="password"]'), page.locator('input[aria-label="Link do convite"]'), ...mask];
  if (locator) await locator.screenshot({ path: path.join(OUT, rel), mask: masks, maskColor: "#9aa0a6" });
  else await page.screenshot({ path: path.join(OUT, rel), fullPage: full, mask: masks, maskColor: "#9aa0a6" });
  return rel;
}

// ------------------------------------------------------------ navegador
let browser;
export async function launch() {
  browser ??= await chromium.launch();
  return browser;
}
export async function newUser(opts = {}) {
  const b = await launch();
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", ...opts });
  const page = await c.newPage();
  page.setDefaultTimeout(20000);
  return { c, page };
}
export async function close() {
  await browser?.close();
  browser = null;
}
export const pathOf = (page) => new URL(page.url()).pathname;
export const api = (page, url, init = {}) =>
  page.evaluate(async ([u, i]) => {
    const r = await fetch(u, { ...i, headers: { "content-type": "application/json", ...(i.headers || {}) } });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { status: r.status, body };
  }, [url, init]);
export const post = (page, url, body = {}, method = "POST") => api(page, url, { method, body: JSON.stringify(body) });
export const idOf = (r) => r.body?.data?.id ?? (typeof r.body?.data === "string" ? r.body.data : null);
export const errMsg = (r) => r.body?.error?.message ?? (typeof r.body?.error === "string" ? r.body.error : "") ?? "";
export const list = async (page, url) => {
  const r = await api(page, url);
  return Array.isArray(r.body?.data) ? r.body.data : [];
};

export async function login(page, email, pass = PASS) {
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  if (!pathOf(page).startsWith("/login")) return;
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill(pass);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle");
}
export async function session(email, pass = PASS, opts = {}) {
  const u = await newUser(opts);
  await login(u.page, email, pass);
  return u;
}
export async function logout(page) {
  await api(page, "/api/auth/logout", { method: "POST", body: "{}" });
}
export async function goto(page, route) {
  await page.goto(`${APP}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}
export const bodyText = async (page) => (await page.locator("body").innerText().catch(() => "")) || "";
export const isRestricted = async (page) => /acesso restrito|sem acesso a este|não tem permiss|sem permiss/i.test(await bodyText(page));

// ------------------------------------------------------------ e-mail de convite (caixa local)
async function mails(email) {
  return ((await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json()).messages ?? []);
}
export const mailCount = async (email) => (await mails(email)).length;
export async function waitLink(email, before = 0) {
  for (let i = 0; i < 60; i++) {
    const m = await mails(email);
    if (m.length > before) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m[0].ID}`)).json();
      return { link: (full.HTML || full.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&"), subject: full.Subject };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("sem e-mail para " + email);
}
/** Primeiro acesso pelo link do e-mail: cria a senha e aceita o convite. */
export async function firstAccess(email, { dir = null, prefix = null } = {}) {
  const u = await newUser();
  const { link } = await waitLink(email, 0);
  await u.page.goto(link);
  await u.page.getByRole("heading", { name: "Crie sua senha" }).waitFor();
  if (dir) await shot(u.page, dir, `${prefix}-a-crie-sua-senha`);
  await u.page.getByLabel(/^Nova senha/).fill(PASS);
  await u.page.getByLabel(/^Confirme a senha/).fill(PASS);
  await u.page.getByRole("button", { name: "Criar senha e continuar" }).click();
  await u.page.getByRole("heading", { name: "Aceitar convite" }).waitFor();
  if (dir) await shot(u.page, dir, `${prefix}-b-aceitar-convite`);
  await u.page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await u.page.waitForURL((x) => x.pathname.startsWith("/app"), { timeout: 30000 });
  await u.page.waitForLoadState("networkidle");
  await u.page.waitForTimeout(600);
  if (dir) await shot(u.page, dir, `${prefix}-c-entrou-no-app`);
  return u;
}

// ------------------------------------------------------------ cartão de evidência (tabela renderizada)
export async function evidenceCard(page, dir, name, title, rows) {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#1c2330;background:#fff}h1{font-size:16px;margin:0 0 4px}p{color:#5b6472;margin:0 0 14px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9dde3;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f5f8}td.ok{color:#136c2e;font-weight:600}td.bad{color:#b42318;font-weight:600}</style>
<h1>${esc(title)}</h1><p>Ambiente: réplica local da homologação (rodada 48 usuários · 7 empresas) · ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
<table><tr>${rows[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td class="${/^(PASS|403|404|negado)/i.test(String(c)) ? "ok" : /^(FAIL|500|vazou)/i.test(String(c)) ? "bad" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
  const b = await launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 400 } });
  await p.setContent(html);
  const rel = path.join(DIRS[dir] ?? dir, `${name}.png`);
  await p.screenshot({ path: path.join(OUT, rel), fullPage: true });
  await p.close();
  return rel;
}

export const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
