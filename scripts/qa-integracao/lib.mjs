// Harness de QA: utilitários do roteiro real ATLAS ↔ ORION (navegador, HTTP, bancos).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "/opt/node-tools/node_modules/playwright");

export const ATLAS = process.env.QA_ATLAS_URL ?? "http://localhost:3000";
export const ORION = process.env.QA_ORION_URL ?? "http://localhost:3100";
export const SHOTS = process.env.QA_SHOTS ?? "./qa-shots";
export const PASSWORD = "Senha-QA-2026!";

export const atlasDb = new pg.Pool({ connectionString: process.env.QA_ATLAS_DB, max: 2 });
export const orionDb = new pg.Pool({ connectionString: process.env.QA_ORION_DB, max: 2 });
export const aq = async (sql, p = []) => (await atlasDb.query(sql, p)).rows;
export const oq = async (sql, p = []) => (await orionDb.query(sql, p)).rows;
export const a1 = async (sql, p = []) => (await aq(sql, p))[0];
export const o1 = async (sql, p = []) => (await oq(sql, p))[0];

let browser;
export async function openBrowser() {
  browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM ?? undefined });
  return browser;
}
export async function closeAll() {
  await browser?.close();
  await atlasDb.end();
  await orionDb.end();
}

/** Contexto de navegador de uma pessoa, logado no ATLAS pela tela de login real. */
export async function atlasUser(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1, locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto(`${ATLAS}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 }), page.getByRole("button", { name: /^entrar$/i }).click()]);
  const api = async (method, p, body) => {
    const r = await ctx.request.fetch(`${ATLAS}${p}`, { method, data: body, headers: body ? { "content-type": "application/json", origin: ATLAS } : { origin: ATLAS } });
    let json = null;
    try { json = await r.json(); } catch { json = null; }
    return { status: r.status(), json };
  };
  return { ctx, page, api, email };
}

export async function shot(page, name) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** Disparo do cron real de cada lado (Authorization: Bearer CRON_SECRET). */
export async function atlasCron() {
  const r = await fetch(`${ATLAS}/api/integrations/orion/v1/outbox/process`, { method: "POST", headers: { authorization: `Bearer ${process.env.QA_CRON_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
export async function orionCron() {
  const r = await fetch(`${ORION}/api/integracao/processar`, { method: "POST", headers: { authorization: `Bearer ${process.env.QA_CRON_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
/** Bombeia as duas outboxes até esvaziarem (cada rodada é HTTP real entre os sistemas). */
export async function pump(rounds = 6) {
  const log = [];
  for (let i = 0; i < rounds; i++) {
    const a = await atlasCron();
    const o = await orionCron();
    log.push({ atlas: a.body, orion: o.body });
    const pa = await a1(`select count(*)::int n from integration_outbox where status = 'pending' and next_attempt_at <= now()`);
    const po = await o1(`select count(*)::int n from wms.integration_events where status = 'pending' and next_attempt_at <= now()`).catch(() => ({ n: 0 }));
    if (pa.n === 0 && po.n === 0) break;
  }
  return log;
}

/** Ação de operador no ORION (mesmos serviços das telas), executada no repositório do ORION. */
export function orionOp(action, args = {}) {
  const out = execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/qa-operador.ts", action, JSON.stringify(args)], {
    cwd: process.env.ORION_DIR,
    env: { ...process.env, DATABASE_URL: process.env.QA_ORION_DB, NODE_ENV: "development" },
    encoding: "utf8",
  });
  const last = out.trim().split("\n").pop();
  return JSON.parse(last);
}

export function check(results, step, ok, detail) {
  results.push({ step, ok: !!ok, detail });
  console.log(`${ok ? "OK  " : "FALHA"} ${step}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  return !!ok;
}
