// Painéis Fiscal, Estoque e Produção pelo app (sessão real): a API responde
// 200 com EXATAMENTE os números da função do banco executada como o mesmo
// usuário, e a tela não mostra "Não foi possível carregar". Também confere a
// tela de Produtos (U-01: a lista principal carrega mesmo com lista auxiliar
// recusada, e o aviso aparece). Pré-requisito: e2e-crm-setup.mjs.
//   CRM_STATE=/fora/do/git.json PGDB=crm_app SHOTS=pasta OUT=arquivo.json node poc/neon-full/e2e/e2e-paineis.mjs
import fs from "node:fs";
import path from "node:path";
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
/** Resultado da função do banco como o usuário (RLS e permissão iguais às do app). */
function asUser(email, sql) {
  const sub = psql(`select auth_user_id from users where email='${email}'`);
  const claims = JSON.stringify({ sub, role: "authenticated" });
  const out = execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT_POC ?? "55440", "-U", "postgres", "-d", PGDB, "-At", "-c", `begin; set local role authenticated; select set_config('request.jwt.claims', '${claims}', true) is not null, set_config('request.jwt.claim.sub', '${sub}', true) is not null; ${sql}; rollback;`]).toString();
  return out.trim().split("\n").filter((l) => l.startsWith("{\"")).pop();
}

const start = "2026-10-01";
const end = "2026-10-31";
const browser = await chromium.launch();
try {
  for (const who of ["gamaAdmin", "gamaVendedor"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
    const page = await ctx.newPage();
    const apiErrors = [];
    page.on("response", (r) => r.url().includes("/api/") && r.status() >= 500 && apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`));
    await page.goto(`${APP}/login`);
    await page.getByLabel(/^E-mail/).fill(state.users[who].email);
    await page.getByLabel(/^Senha/).fill(state.users[who].password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20000 });
    const companyId = state.companies.gama.id;
    for (const [api, fn, route] of [["fiscal", "fn_report_fiscal", "fiscal"], ["inventory", "fn_report_inventory", "estoque"], ["production", "fn_report_production", "producao"]]) {
      const r = await page.evaluate(async (u) => {
        const res = await fetch(u);
        return { status: res.status, body: await res.json().catch(() => null) };
      }, `/api/reports/${api}?periodStart=${start}&periodEnd=${end}`);
      if (who === "gamaAdmin") {
        const expected = JSON.parse(asUser(state.users[who].email, `select row_to_json(t) from public.${fn}('${companyId}', '${start}', '${end}') t`));
        const got = r.body?.data ?? {};
        const same = Object.keys(expected).length === 8 && Object.entries(expected).every(([k, v]) => Number(got[k]) === Number(v));
        check("painéis", `${api}: API 200 com os mesmos 8 números da função do banco`, r.status === 200 && same, `${r.status} ${JSON.stringify(got)} × ${JSON.stringify(expected)}`);
        await page.goto(`${APP}/app/gestao/dashboard/${route}`);
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1200);
        const text = await page.locator("main").innerText().catch(() => "");
        check("painéis", `tela ${route}: carrega sem "Não foi possível carregar"`, !/Não foi possível carregar/i.test(text), text.slice(0, 200));
        if (process.env.SHOTS) {
          fs.mkdirSync(process.env.SHOTS, { recursive: true });
          await page.screenshot({ path: path.join(process.env.SHOTS, `painel-${route}.png`) });
        }
      } else {
        check("painéis", `${api}: Vendedor sem permissão → 403 (não 500)`, r.status === 403, `${r.status}`);
      }
    }
    if (who === "gamaAdmin") {
      await page.goto(`${APP}/app/cadastros/produtos`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(1200);
      const text = await page.locator("main").innerText().catch(() => "");
      check("produtos (U-01)", "lista de produtos carrega (Pão francês) mesmo com listas auxiliares recusadas", /Pão francês/.test(text), text.slice(0, 300));
      check("produtos (U-01)", "aviso das informações complementares não carregadas (falha não escondida)", /complementares não foram carregadas/i.test(text), text.slice(0, 300));
      if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, "produtos-admin.png") });
    }
    check("telas", `${who}: nenhuma chamada com erro 500`, apiErrors.length === 0, apiErrors.join(", "));
    await ctx.close();
  }
  const out = process.env.OUT;
  if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), pass: results.filter((x) => x.ok).length, fail: results.filter((x) => !x.ok).length, results }, null, 2));
  console.log(`\npaineis: ${results.filter((x) => x.ok).length} PASS, ${results.filter((x) => !x.ok).length} FAIL`);
} finally {
  await browser.close();
}
