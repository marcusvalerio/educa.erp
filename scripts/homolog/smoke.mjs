// Smoke de homologação: navegador real contra o app publicado, com os 3 usuários.
// Autenticação, logout, sessão, rotas protegidas, RBAC (menu, ações, telas sem
// acesso), navegação por todos os módulos e ausência de CTA de cadastro.
//
//   APP=https://<preview> HOMOLOG_OWNER_PASSWORD=… HOMOLOG_ADMIN_PASSWORD=… \
//   HOMOLOG_USER_PASSWORD=… [VERCEL_BYPASS_TOKEN=…] [SMOKE_OUT=relatorio.md] \
//   [PLAYWRIGHT_MODULE=…/playwright/index.mjs] node scripts/homolog/smoke.mjs
//
// Cada item recebe uma classificação: visualizado · funciona · somente API ·
// com bug. Saída sem segredos (e-mails de teste e códigos HTTP apenas).
import fs from "node:fs";
import { ACCOUNTS, APP, BYPASS, need } from "./lib.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const users = {
  owner: { ...ACCOUNTS.owner, password: need("HOMOLOG_OWNER_PASSWORD"), label: "Owner" },
  admin: { ...ACCOUNTS.admin, password: need("HOMOLOG_ADMIN_PASSWORD"), label: "Admin" },
  user: { ...ACCOUNTS.user, password: need("HOMOLOG_USER_PASSWORD"), label: "Usuário" },
};

const rows = [];
const check = (area, item, ok, klass, detail = "") => {
  rows.push({ area, item, ok: !!ok, klass: ok ? klass : "com bug", detail: ok ? "" : String(detail).slice(0, 200) });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${item}${ok ? "" : ` — ${String(detail).slice(0, 200)}`}`);
};
const SIGNUP = /criar conta|cadastre-se|teste gr[aá]tis|come[cç]ar agora|solicitar acesso|sign ?up|registre-se/i;
const ERROR_UI = /algo deu errado|application error|unhandled runtime error|erro inesperado/i;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const newCtx = () => browser.newContext({ extraHTTPHeaders: BYPASS, viewport: { width: 1440, height: 900 } });

// ------------------------------------------------------------ sem sessão
{
  const ctx = await newCtx();
  const page = await ctx.newPage();
  const res = await page.goto(`${APP}/login`);
  check("Acesso", "tela de login pública (200)", res?.status() === 200, "funciona", res?.status());
  const text = await page.locator("body").innerText();
  check("Acesso", "login sem CTA de cadastro", !SIGNUP.test(text), "funciona", text.match(SIGNUP)?.[0]);
  check("Ambiente", "selo HOMOLOGAÇÃO visível no login", /homologa[cç][aã]o/i.test(text), "funciona", "selo ausente (APP_ENV não é homologacao?)");
  check("Ambiente", "título da aba indica homologação", /HOMOLOGA/i.test(await page.title()), "funciona", await page.title());
  for (const path of ["/", "/comercial/pedidos", "/financeiro/contas-receber", "/admin", "/admincentral"]) {
    await page.goto(`${APP}${path}`);
    check("Rotas protegidas", `${path} sem sessão → /login`, new URL(page.url()).pathname.startsWith("/login"), "funciona", page.url());
  }
  const api = await ctx.request.get(`${APP}/api/session/context`);
  check("Rotas protegidas", "API sem sessão → 401", api.status() === 401, "funciona", api.status());
  const signUp = await ctx.request.post(`${APP}/api/auth/sign-up`, { data: { email: "x@example.com", password: "Xx1!xxxxxxxx", name: "X" }, headers: { origin: APP } });
  check("Acesso", "cadastro público pelo app recusado", signUp.status() >= 400, "funciona", signUp.status());
  const bad = await ctx.request.post(`${APP}/api/auth/sign-in`, { data: { email: users.user.email, password: "senha-errada-123" }, headers: { origin: APP } });
  check("Acesso", "senha errada → recusada", bad.status() === 401 || bad.status() === 400, "funciona", bad.status());
  await ctx.close();
}

// ------------------------------------------------------------ por usuário
async function login(u) {
  const ctx = await newCtx();
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 160)));
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(u.email);
  await page.getByLabel(/^Senha/).fill(u.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page, consoleErrors };
}
const apiStatus = (page, url, init = {}) =>
  page.evaluate(async ([u, i]) => (await fetch(u, { ...i, headers: { "content-type": "application/json" } })).status, [url, init]);

async function menu(page) {
  const nav = page.locator('nav[aria-label="Navegação principal"]').first();
  for (let round = 0; round < 3; round++) {
    const closed = nav.locator('button[aria-expanded="false"]');
    const n = await closed.count();
    if (!n) break;
    for (let i = n - 1; i >= 0; i--) await closed.nth(i).click().catch(() => {});
  }
  return nav.locator("a[href]").evaluateAll((as) => [...new Set(as.map((a) => `${a.getAttribute("href")}|${a.textContent.trim()}`))]);
}

const menus = {};
const sessions = {};
for (const [key, u] of Object.entries(users)) {
  let s;
  try {
    s = await login(u);
    check("Autenticação", `${u.label}: login pela tela`, true, "funciona");
  } catch (error) {
    check("Autenticação", `${u.label}: login pela tela`, false, "", error.message);
    continue;
  }
  sessions[key] = s;
  const ctx = await s.page.evaluate(async () => (await (await fetch("/api/session/context")).json())?.data);
  const roles = (ctx?.tenant?.roles ?? []).map((r) => r.code);
  check("Sessão", `${u.label}: contexto carregado (${roles.join(",") || "sem papel"}${ctx?.platform?.role ? ` + plataforma ${ctx.platform.role}` : ""})`, !!ctx?.tenant, "funciona", JSON.stringify(ctx)?.slice(0, 160));
  const text = await s.page.locator("body").innerText();
  check("Ambiente", `${u.label}: selo HOMOLOGAÇÃO no ERP`, /homologa[cç][aã]o/i.test(text), "funciona");
  menus[key] = await menu(s.page);
  check("RBAC: menu", `${u.label}: ${menus[key].length} itens no menu`, menus[key].length > 0, "visualizado", "menu vazio");
}

// Menu por papel (o que cada um vê de fato).
const has = (key, re) => (menus[key] ?? []).some((m) => re.test(m));
if (menus.owner && menus.admin && menus.user) {
  check("RBAC: menu", "Usuário (Vendedor) vê Comercial e CRM", has("user", /comercial/i) && has("user", /crm/i), "funciona", menus.user.join(" · "));
  check("RBAC: menu", "Usuário (Vendedor) NÃO vê Financeiro, Fiscal, Suprimentos, Produção", !has("user", /\/financeiro|\/fiscal|\/suprimentos|\/producao/i), "funciona", menus.user.filter((m) => /financeiro|fiscal|suprimentos|producao/i.test(m)).join(" · "));
  check("RBAC: menu", "Usuário (Vendedor) NÃO vê Administração", !has("user", /^\/admin/i), "funciona", menus.user.filter((m) => /^\/admin/.test(m)).join(" · "));
  check("RBAC: menu", "Admin (Operador) vê Financeiro e Fiscal", has("admin", /\/financeiro/) && has("admin", /\/fiscal/), "funciona", menus.admin.join(" · "));
  check("RBAC: menu", "Usuário vê menos itens que o Admin", menus.user.length < menus.admin.length, "funciona", `${menus.user.length} vs ${menus.admin.length}`);
}

// Ações (API) por papel: esperado × obtido.
const matrix = [
  ["GET", "/api/platform/members", { owner: 200, admin: 403, user: 403 }, "Administração Central (membros da plataforma)"],
  ["POST", "/api/admin/roles", { admin: 403, user: 403 }, "criar papel (só o Owner gerencia papéis)", { code: "rbac_smoke_x", name: "Não deve ser criado" }],
  ["POST", "/api/users", { admin: 403, user: 403 }, "criar usuário (só o Owner)", { nome: "Não deve ser criado", email: "nao.criar@example.com", login: "nao.criar", perfil: "x" }],
  ["GET", "/api/sales-orders", { owner: 200, admin: 200, user: 200 }, "pedidos de venda"],
  ["GET", "/api/leads", { owner: 200, admin: 200, user: 200 }, "leads (CRM)"],
  ["GET", "/api/accounts-receivable", { owner: 200, admin: 200, user: 403 }, "contas a receber"],
  ["GET", "/api/accounts-payable", { owner: 200, admin: 200, user: 403 }, "contas a pagar"],
  ["GET", "/api/fiscal-documents", { owner: 200, admin: 200, user: 403 }, "documentos fiscais"],
  ["GET", "/api/purchase-requests", { owner: 200, admin: 200, user: 403 }, "solicitações de compra"],
  ["GET", "/api/stock-balances", { owner: 200, admin: 200, user: 200 }, "saldos de estoque (consulta)"],
  ["POST", "/api/stock-movements/receive", { owner: 422, admin: 422, user: 403 }, "entrada de estoque (corpo vazio)"],
];
for (const [method, url, expected, label, body] of matrix) {
  for (const key of Object.keys(users)) {
    if (!sessions[key] || expected[key] === undefined) continue;
    const got = await apiStatus(sessions[key].page, url, { method, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
    check("RBAC: ações", `${users[key].label}: ${label} → ${expected[key]}`, got === expected[key], "funciona", `obtido ${got}`);
  }
}
// Listas de governança: a API responde 200, mas a RLS só entrega o permitido.
const dataOf = (page, url) => page.evaluate(async (u) => (await (await fetch(u)).json())?.data ?? null, url);
if (sessions.owner && sessions.admin && sessions.user) {
  const [ro, ra, ru] = await Promise.all(["owner", "admin", "user"].map((k) => dataOf(sessions[k].page, "/api/admin/roles")));
  check("RBAC: dados", `papéis visíveis: Owner ${ro?.length}, Admin ${ra?.length}, Usuário ${ru?.length} (só o Owner lê papéis)`, ro?.length > 0 && !ra?.length && !ru?.length, "funciona", `${ro?.length}/${ra?.length}/${ru?.length}`);
  const [uo, ua, uu] = await Promise.all(["owner", "admin", "user"].map((k) => dataOf(sessions[k].page, "/api/admin/users")));
  check("RBAC: dados", `usuários visíveis: Owner ${uo?.length}, Admin ${ua?.length}, Usuário ${uu?.length} (Usuário só vê a si)`, uo?.length > 1 && ua?.length > 1 && uu?.length === 1 && String(uu[0].email).toLowerCase() === users.user.email, "funciona", `${uo?.length}/${ua?.length}/${uu?.length}`);
}

// Fluxo entre papéis: o Vendedor cria e envia um pedido, não consegue aprová-lo;
// o Admin aprova. Tudo pelas APIs que as telas usam, com as sessões reais.
const call = (page, url, init = {}) =>
  page.evaluate(async ([u, i]) => {
    const r = await fetch(u, { ...i, headers: { "content-type": "application/json" } });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [url, init]);
if (sessions.admin && sessions.user) {
  const up = sessions.user.page;
  const customers = (await call(up, "/api/customers")).body?.data ?? [];
  const products = (await call(up, "/api/products")).body?.data ?? [];
  const so = customers[0] && products[0]
    ? await call(up, "/api/sales-orders", { method: "POST", body: JSON.stringify({ customerId: customers[0].id, notes: "Smoke de homologação", items: [{ productId: products[0].id, description: products[0].descricao ?? "Item", quantity: 1, unitPrice: 10 }] }) })
    : { status: 0 };
  const soId = so.body?.data?.id;
  check("Fluxos", "Usuário (Vendedor) cria pedido de venda", so.status === 201 && !!soId, "funciona", `obtido ${so.status}`);
  if (soId) {
    const sub = await call(up, `/api/sales-orders/${soId}/submit`, { method: "POST", body: "{}" });
    check("Fluxos", "Usuário (Vendedor) envia o pedido para aprovação", sub.status === 200, "funciona", `obtido ${sub.status}`);
    const u = await call(up, `/api/sales-orders/${soId}/approve`, { method: "POST", body: "{}" });
    check("RBAC: ações", "Usuário (Vendedor) NÃO aprova o pedido (403)", u.status === 403, "funciona", `obtido ${u.status}`);
    const a = await call(sessions.admin.page, `/api/sales-orders/${soId}/approve`, { method: "POST", body: "{}" });
    check("Fluxos", "Admin aprova o pedido criado pelo Vendedor", a.status === 200, "funciona", `obtido ${a.status}`);
  }
}

// Tela sem acesso: Vendedor abrindo Financeiro e Administração.
if (sessions.user) {
  for (const path of ["/financeiro/contas-receber", "/admin", "/admincentral"]) {
    await sessions.user.page.goto(`${APP}${path}`);
    await sessions.user.page.waitForLoadState("networkidle").catch(() => {});
    const t = await sessions.user.page.locator("body").innerText();
    const blocked = /sem acesso|sem permiss|não tem permiss|acesso negado|não autorizado|acesso restrito/i.test(t) || !new URL(sessions.user.page.url()).pathname.startsWith(path);
    check("RBAC: telas sem acesso", `Usuário (Vendedor) em ${path} → bloqueado`, blocked, "funciona", sessions.user.page.url());
  }
}

// Navegação por todos os módulos (menu de cada papel).
for (const key of Object.keys(users)) {
  const s = sessions[key];
  if (!s) continue;
  const hrefs = [...new Set((menus[key] ?? []).map((m) => m.split("|")[0]).filter((h) => h.startsWith("/")))];
  let okCount = 0;
  const bad = [];
  for (const href of hrefs) {
    const before = s.consoleErrors.length;
    const res = await s.page.goto(`${APP}${href}`).catch((e) => ({ status: () => 0, e }));
    await s.page.waitForLoadState("networkidle").catch(() => {});
    const t = await s.page.locator("main").first().innerText().catch(() => "");
    const fine = res && res.status() < 400 && !ERROR_UI.test(t) && s.consoleErrors.length === before && !new URL(s.page.url()).pathname.startsWith("/login");
    if (fine) okCount++;
    else bad.push(`${href} (${res?.status?.() ?? "?"}${s.consoleErrors.length > before ? ", erro JS" : ""}${ERROR_UI.test(t) ? ", tela de erro" : ""})`);
  }
  check("Navegação", `${users[key].label}: ${okCount}/${hrefs.length} telas do menu abrem sem erro`, bad.length === 0, "visualizado", bad.join("; "));
}

// Logout pela interface e sessão encerrada: clique do mouse em Conta → Sair e,
// se a sessão continuar, pelo teclado (Enter no mesmo item).
const loggedOut = async (page) => {
  await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 8000 }).catch(() => {});
  return new URL(page.url()).pathname.startsWith("/login");
};
for (const key of Object.keys(users)) {
  const s = sessions[key];
  if (!s) continue;
  await s.page.goto(`${APP}/`);
  const openMenu = () => s.page.getByRole("button", { name: /^Conta:/ }).first().click({ timeout: 10000 });
  let byMouse = false;
  let byKeyboard = false;
  try {
    await openMenu();
    await s.page.getByRole("menuitem", { name: /Sair/ }).click({ timeout: 5000 });
    byMouse = await loggedOut(s.page);
    if (!byMouse) {
      await openMenu();
      await s.page.getByRole("menuitem", { name: /Sair/ }).focus();
      await s.page.keyboard.press("Enter");
      byKeyboard = await loggedOut(s.page);
    }
  } catch {
    // menu da conta não encontrado: fica registrado abaixo
  }
  check("Autenticação", `${users[key].label}: logout com o mouse (Conta → Sair)`, byMouse, "funciona", "o clique não envia o logout; a sessão continua ativa");
  if (!byMouse) check("Autenticação", `${users[key].label}: logout pelo teclado (Enter em Conta → Sair)`, byKeyboard, "funciona", "também não saiu");
  if (!byMouse && !byKeyboard) await apiStatus(s.page, "/api/auth/logout", { method: "POST", body: "{}" });
  const after = await apiStatus(s.page, "/api/session/context");
  check("Sessão", `${users[key].label}: após logout a API recusa (401)`, after === 401, "funciona", `obtido ${after}`);
  await s.ctx.close();
}
await browser.close();

const pass = rows.filter((r) => r.ok).length;
console.log(`smoke: ${pass}/${rows.length} verificações passaram`);
if (process.env.SMOKE_OUT) {
  const md = [
    `# Smoke de homologação — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    "",
    `App: ${APP} · Resultado: **${pass}/${rows.length}**`,
    "",
    "| Área | Verificação | Resultado | Classificação | Detalhe |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.area} | ${r.item.replace(/\|/g, "/")} | ${r.ok ? "passou" : "FALHOU"} | ${r.klass} | ${r.detail.replace(/\|/g, "/")} |`),
    "",
    "## Menus por papel",
    "",
    ...Object.entries(menus).map(([k, m]) => `- **${users[k].label}** (${m.length}): ${m.map((x) => x.split("|")[1] || x.split("|")[0]).join(", ")}`),
    "",
  ].join("\n");
  fs.writeFileSync(process.env.SMOKE_OUT, md);
}
process.exit(pass === rows.length ? 0 : 1);
