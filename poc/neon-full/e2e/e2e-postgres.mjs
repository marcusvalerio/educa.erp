// E2E da POC SUPABASE → NEON (DATA_BACKEND=postgres): navegador real
// (Playwright) → app (next start) → servidor → Neon Auth (dublê local, mesmo
// motor e contrato do Neon real) → camada src/lib/database/pg → PostgreSQL
// com o esquema equivalente a produção (328 policies, 330 funções). SEM
// Supabase: nenhum PostgREST, nenhum GoTrue, nenhuma variável SUPABASE_*.
//
// Deriva do E2E do Plano A (poc/neon-auth/e2e-neon.mjs, 57 verificações) e
// acrescenta CRUD por módulo, isolamento por empresa no CRUD, injeção e
// segurança direta no banco (papel de login sem privilégios).
//
// Pré-requisitos: banco recém-criado (build-local.sh + 10_app_login_role.sql),
// Owner via bootstrap oficial com DATA_BACKEND=postgres, dublê, caixa de
// e-mail (mail-sink.mjs) e app no ar.
//   E2E_ENV=.env.local NEON_DOUBLE_DB=… PGDB=educa_poc node poc/neon-full/e2e/e2e-postgres.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { runModuleE2E } from "./e2e-modules.mjs";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const need = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const APP = process.env.APP ?? "http://localhost:3200";
const NEON = process.env.NEON_BASE ?? "http://localhost:3401/neondb/auth";
const MAIL = process.env.MAIL ?? "http://localhost:58025";
const appEnv = Object.fromEntries(fs.readFileSync(need("E2E_ENV"), "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const PGPORT = process.env.PGPORT_POC ?? "55440";
const PGDB = process.env.PGDB ?? "educa_poc";
const PG = ["-h", "127.0.0.1", "-p", PGPORT, "-U", "postgres", "-d", PGDB, "-Atc"];
const sql = (q) => execFileSync("psql", [...PG, q]).toString().trim();
/** Mesmo banco, conectado como o papel de LOGIN da aplicação (educa_app). Devolve saída ou "ERRO: …". */
const appSql = (q) => {
  try {
    return execFileSync("psql", ["-h", "127.0.0.1", "-p", PGPORT, "-U", "educa_app", "-d", PGDB, "-v", "ON_ERROR_STOP=1", "-Atc", q], { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  } catch (e) {
    return "ERRO: " + String(e.stderr ?? e.message).trim();
  }
};
const neonSql = (q) => execFileSync("psql", [need("NEON_DOUBLE_DB").replace(/\?.*$/, ""), "-Atc", q]).toString().trim();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? " — " + String(detail).slice(0, 220) : ""}`);
};
// Senhas geradas a cada execução (usuários descartáveis do banco local): nada no Git.
const pw = () => `${crypto.randomBytes(12).toString("base64url")}#Aa1`;
const PASS = { owner: pw(), adminA: pw(), userA: pw(), adminB: pw(), operB: pw(), newA: pw(), loose: pw() };
const OWNER = "dona.plataforma@educa-poc.test";
const ADMIN_A = "admin.alfa@alfa-poc.test";
const USER_A = "leitura.alfa@alfa-poc.test";
const ADMIN_B = "admin.beta@beta-poc.test";
const OPER_B = "operador.beta@beta-poc.test";

async function mails(email) {
  const d = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json();
  return d.messages ?? [];
}
async function lastLink(email, before = 0) {
  for (let i = 0; i < 40; i++) {
    const m = await mails(email);
    if (m.length > before) {
      const full = await (await fetch(`${MAIL}/api/v1/message/${m[0].ID}`)).json();
      return { link: (full.HTML || full.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&"), count: m.length };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("sem e-mail para " + email);
}
async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  return { ctx, page };
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
async function login(page, email, password) {
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}
/** Primeiro acesso pelo link do e-mail: cria a senha e segue. */
async function firstAccess(page, email, password, before = 0) {
  const { link } = await lastLink(email, before);
  await page.goto(link);
  await page.getByRole("heading", { name: "Crie sua senha" }).waitFor({ timeout: 20000 });
  const clean = !(await page.evaluate(() => location.search.includes("token=")));
  await page.getByLabel(/^Nova senha/).fill(password);
  await page.getByLabel(/^Confirme a senha/).fill(password);
  await page.getByRole("button", { name: "Criar senha e continuar" }).click();
  return { link, clean };
}
async function acceptInvite(page) {
  await page.getByRole("heading", { name: "Aceitar convite" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  // Desde 28/09 o ERP autenticado fica em /app (antes: / e /admin).
  await page.waitForURL(/\/app(\/|$|\?)|\/admin(\/|$|\?)|\/$|localhost:3200\/(\?|$)/, { timeout: 20000 });
}
const sessionCookie = async (ctx) => (await ctx.cookies(APP)).find((c) => c.name === "educa_session");
async function neonAdmin() {
  const r = await fetch(`${NEON}/sign-in/email`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ email: appEnv.NEON_AUTH_SERVICE_EMAIL, password: appEnv.NEON_AUTH_SERVICE_PASSWORD }) });
  const cookie = r.headers.getSetCookie().find((c) => c.includes(".session_token=")).split(";")[0];
  return (path, body) => fetch(`${NEON}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: APP, cookie }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, body: await x.json().catch(() => null) }));
}

const browser = await chromium.launch();
try {
  // ================================================================ 1. Owner: primeiro acesso pelo link do Neon Auth
  const o = await newCtx(browser);
  {
    const { link, clean } = await firstAccess(o.page, OWNER, PASS.owner);
    check("owner: link do e-mail passa pelo Neon Auth e abre 'Crie sua senha'", new URL(link).origin === new URL(NEON).origin);
    check("owner: token do link sai da barra de endereço", clean);
    await o.page.waitForURL(/\/admincentral/, { timeout: 20000 });
    check("owner: depois de criar a senha vai para /app/admincentral", o.page.url().includes("/app/admincentral"), o.page.url());
    const ctx = await api(o.page, "/api/session/context");
    check("owner: contexto = plataforma OWNER, sem tenant", ctx.body?.data?.platform?.role === "OWNER" && ctx.body?.data?.tenant === null, JSON.stringify(ctx.body?.data?.platform));
    const ids = sql(`select l.auth_user_id = m.auth_user_id and l.auth_user_id = u.id from auth_identity_links l join platform_members m on m.email = l.email join auth.users u on u.email = l.email where l.email='${OWNER}'`);
    check("vínculo: Neon → auth_user_id = platform_members.auth_user_id = login sombra", ids === "t", ids);
    // Sem Supabase Auth: o login "sombra" é só uma linha em auth.users, sem coluna de senha.
    check("login sombra: auth.users não guarda senha (sem GoTrue)", sql(`select count(*) from information_schema.columns where table_schema='auth' and table_name='users' and column_name ilike '%pass%'`) === "0" && sql(`select count(*) from auth.users where email='${OWNER}'`) === "1");
    check("app sem nenhuma variável SUPABASE_* (DATA_BACKEND=postgres)", !Object.keys(appEnv).some((k) => k.includes("SUPABASE")) && appEnv.DATA_BACKEND === "postgres");
    check("Neon: e-mail confirmado pelo primeiro acesso (servidor)", neonSql(`select "emailVerified" from "user" where email='${OWNER}'`) === "t");
    const c = await sessionCookie(o.ctx);
    check("sessão: cookie do EDUCA HttpOnly + SameSite=Lax; nenhum cookie do Neon no navegador", c?.httpOnly && c.sameSite === "Lax" && !(await o.ctx.cookies()).some((x) => x.name.includes("neon-auth")), JSON.stringify(c));
    const me = await api(o.page, "/api/auth/session");
    check("sessão: /api/auth/session devolve só autenticado + e-mail", me.body?.data?.authenticated === true && me.body.data.email === OWNER && Object.keys(me.body.data).length === 2);
    const reuse = await newCtx(browser);
    await reuse.page.goto(link);
    await reuse.page.getByRole("heading", { name: "Link inválido ou expirado" }).waitFor({ timeout: 20000 });
    check("link de primeiro acesso não funciona duas vezes", true);
    await reuse.ctx.close();
  }

  // ================================================================ 2. logout, cookie reaproveitado, login
  {
    const before = (await sessionCookie(o.ctx)).value;
    await o.page.evaluate(() => fetch("/api/auth/logout", { method: "POST", redirect: "manual" }));
    check("logout: API sem sessão (401)", (await api(o.page, "/api/session/context")).status === 401);
    check("logout: cookie local apagado", !(await sessionCookie(o.ctx)));
    const thief = await newCtx(browser);
    await thief.ctx.addCookies([{ name: "educa_session", value: before, url: APP }]);
    await thief.page.goto(`${APP}/login`);
    check("logout: cookie antigo reaproveitado não vale (sessão revogada no Neon)", (await api(thief.page, "/api/session/context")).status === 401);
    await thief.ctx.addCookies([{ name: "educa_session", value: "neon-auth.session_token=forjado.assinatura", url: APP }]);
    check("cookie forjado → 401", (await api(thief.page, "/api/session/context")).status === 401);
    await thief.ctx.close();
    await o.page.goto(`${APP}/app/admincentral`);
    await o.page.waitForURL(/\/login\?next=%2Fapp%2Fadmincentral/, { timeout: 15000 });
    check("proxy: sem sessão → /login?next=", true);
    await login(o.page, OWNER, "senha-errada-123");
    await o.page.getByText("E-mail ou senha inválidos").waitFor();
    await login(o.page, "ninguem@educa-poc.test", "senha-errada-123");
    await o.page.getByText("E-mail ou senha inválidos").waitFor();
    check("login: senha errada e e-mail inexistente → mesma mensagem", true);
    await login(o.page, OWNER, PASS.owner);
    await o.page.waitForURL(/\/admincentral/, { timeout: 20000 });
    check("login: Owner volta para /admincentral", true);
  }

  // ================================================================ 3. Empresa Alfa + admin A1 (convite com Neon)
  let companyA, companyB;
  const a1 = await newCtx(browser);
  {
    const r = await api(o.page, "/api/platform/companies", { method: "POST", body: JSON.stringify({ name: "Alfa Neon", branchCode: "MTZ", branchName: "Matriz Alfa" }) });
    companyA = r.body?.data?.company_id;
    check("empresa Alfa criada pelo Owner", r.status === 201 && !!companyA, JSON.stringify(r.body));
    const inv = await api(o.page, `/api/platform/companies/${companyA}/admin-invitation`, { method: "POST", body: JSON.stringify({ name: "Ana Alfa", email: ADMIN_A }) });
    check("convite admin A1: criado e e-mail de primeiro acesso do Neon enviado", inv.status === 201 && inv.body.data.emailSent === true, JSON.stringify(inv.body));
    const token = inv.body.data.inviteUrl.split("/convite/")[1];
    const { link } = await firstAccess(a1.page, ADMIN_A, PASS.adminA);
    check("A1: link de primeiro acesso volta para o convite depois da senha", decodeURIComponent(decodeURIComponent(link)).includes(`/convite/${token}`), link);
    await acceptInvite(a1.page);
    const ctx = await api(a1.page, "/api/session/context");
    check("A1: contexto = Alfa, papel admin, sem plataforma", ctx.body?.data?.tenant?.company?.id === companyA && ctx.body.data.tenant.roles.some((x) => x.code === "admin") && ctx.body.data.platform === null, JSON.stringify(ctx.body?.data?.tenant?.company));
    check("A1: users.auth_user_id = vínculo do Neon (UUID do EDUCA)", sql(`select u.auth_user_id = l.auth_user_id from users u join auth_identity_links l on l.email=u.email where u.email='${ADMIN_A}'`) === "t");
  }

  // ================================================================ 4. A1 convida A2 (leitura)
  const a2 = await newCtx(browser);
  let userA2;
  {
    const c = await api(a1.page, "/api/users", { method: "POST", body: JSON.stringify({ nome: "Leitura Alfa", email: USER_A, login: "leitura.alfa", perfil: "leitura" }) });
    userA2 = c.body?.data?.id;
    await api(a1.page, `/api/admin/users/${userA2}/roles`, { method: "POST", body: JSON.stringify({ roleId: sql(`select id from roles where company_id='${companyA}' and code='leitura'`) }) });
    const inv = await api(a1.page, `/api/admin/users/${userA2}/invitation`, { method: "POST", body: "{}" });
    check("convite A2 (leitura): e-mail do Neon enviado", inv.status === 201 && inv.body.data.emailSent === true, JSON.stringify(inv.body));
    await firstAccess(a2.page, USER_A, PASS.userA);
    await acceptInvite(a2.page);
    const ctx = await api(a2.page, "/api/session/context");
    check("A2: contexto Alfa com papel leitura", ctx.body?.data?.tenant?.company?.id === companyA && ctx.body.data.tenant.roles.every((x) => x.code === "leitura"), JSON.stringify(ctx.body?.data?.tenant?.roles));
  }

  // ================================================================ 5. Empresa Beta + B1 (admin) + B2 (operador)
  const b1 = await newCtx(browser);
  const b2 = await newCtx(browser);
  let userB2;
  {
    const r = await api(o.page, "/api/platform/companies", { method: "POST", body: JSON.stringify({ name: "Beta Neon", branchCode: "B01", branchName: "Beta Centro" }) });
    companyB = r.body?.data?.company_id;
    await api(o.page, `/api/platform/companies/${companyB}/admin-invitation`, { method: "POST", body: JSON.stringify({ name: "Bruno Beta", email: ADMIN_B }) });
    await firstAccess(b1.page, ADMIN_B, PASS.adminB);
    await acceptInvite(b1.page);
    const c = await api(b1.page, "/api/users", { method: "POST", body: JSON.stringify({ nome: "Operador Beta", email: OPER_B, login: "operador.beta", perfil: "operador" }) });
    userB2 = c.body?.data?.id;
    await api(b1.page, `/api/admin/users/${userB2}/roles`, { method: "POST", body: JSON.stringify({ roleId: sql(`select id from roles where company_id='${companyB}' and code='operador'`) }) });
    await api(b1.page, `/api/admin/users/${userB2}/invitation`, { method: "POST", body: "{}" });
    await firstAccess(b2.page, OPER_B, PASS.operB);
    await acceptInvite(b2.page);
    const ctx1 = await api(b1.page, "/api/session/context");
    const ctx2 = await api(b2.page, "/api/session/context");
    check("B1 admin e B2 operador na Beta", ctx1.body?.data?.tenant?.company?.id === companyB && ctx2.body?.data?.tenant?.roles?.some((x) => x.code === "operador"), JSON.stringify([ctx1.body?.data?.tenant?.company?.id, ctx2.body?.data?.tenant?.roles]));
    check("4 identidades Neon vinculadas a 4 UUIDs distintos do EDUCA", sql(`select count(distinct auth_user_id) from auth_identity_links where email in ('${ADMIN_A}','${USER_A}','${ADMIN_B}','${OPER_B}')`) === "4");
  }

  // ================================================================ 6. multi-tenancy e RBAC pelo app
  {
    const la = await api(a1.page, "/api/admin/users");
    const ids = (la.body?.data ?? []).map((u) => u.id);
    const companies = ids.length ? sql(`select string_agg(distinct company_id::text, ',') from users where id in (${ids.map((i) => `'${i}'`).join(",")})`) : "";
    check("A1 lista só usuários da Alfa", la.status === 200 && companies === companyA, companies);
    const lb = await api(b1.page, "/api/admin/users");
    check("B1 não vê A1/A2", !(lb.body?.data ?? []).some((u) => u.email === ADMIN_A || u.email === USER_A));
    const idor = await api(a1.page, `/api/users/${userB2}`, { method: "PATCH", body: JSON.stringify({ status: "Inativo" }) });
    check("IDOR: A1 não altera usuário da Beta pelo id", idor.status >= 400 && sql(`select status from users where id='${userB2}'`) === "active", `${idor.status}`);
    const invB = await api(a1.page, `/api/admin/users/${userB2}/invitation`, { method: "POST", body: "{}" });
    check("A1 não convida usuário da Beta", invB.status >= 400, `${invB.status}`);
    const c = await api(a2.page, "/api/users", { method: "POST", body: JSON.stringify({ nome: "Invasor", email: "x@alfa-poc.test", login: "x", perfil: "admin" }) });
    check("A2 (leitura) não cria usuário", c.status === 403, `${c.status}`);
    const esc = await api(b2.page, `/api/admin/users/${userB2}/roles`, { method: "POST", body: JSON.stringify({ roleId: sql(`select id from roles where company_id='${companyB}' and code='admin'`) }) });
    check("B2 (operador) não se promove a admin", esc.status >= 400 && sql(`select string_agg(r.code, ',') from user_roles ur join roles r on r.id=ur.role_id where ur.user_id='${userB2}'`) === "operador", `${esc.status}`);
    const plat = await api(a1.page, "/api/platform/companies");
    check("Company Admin não acessa a Administração Central", plat.status === 403, `${plat.status}`);
    const ownerAdmin = await api(o.page, "/api/admin/users");
    check("Owner não acessa dados de empresa (/api/admin/users 403)", ownerAdmin.status === 403, `${ownerAdmin.status}`);
    const forged = await api(a2.page, "/api/onboarding/invitations/accept", { method: "POST", body: JSON.stringify({ token: "0".repeat(64), auth_user_id: crypto.randomUUID() }) });
    check("identidade no corpo é recusada (auth_user_id)", forged.status >= 400);
    check("banco: nenhum vínculo/usuário cruzado entre empresas", sql(`select count(*) from users where company_id='${companyA}' and email in ('${ADMIN_B}','${OPER_B}')`) === "0" && sql(`select count(*) from users where company_id='${companyB}' and email in ('${ADMIN_A}','${USER_A}')`) === "0");
  }

  // ================================================================ 7. recuperação de senha (revoga sessões)
  {
    const other = await newCtx(browser);
    await login(other.page, USER_A, PASS.userA);
    await other.page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    check("A2: segunda sessão aberta antes da recuperação", (await api(other.page, "/api/session/context")).status === 200);
    const before = (await mails(USER_A)).length;
    const r = await newCtx(browser);
    await r.page.goto(`${APP}/recuperar-senha`);
    await r.page.getByLabel(/^E-mail/).fill(USER_A);
    await r.page.getByRole("button", { name: "Enviar link" }).click();
    await r.page.getByRole("heading", { name: "Verifique seu e-mail" }).waitFor();
    const none = await api(r.page, "/api/auth/password/recover", { method: "POST", body: JSON.stringify({ email: "ninguem@educa-poc.test" }) });
    check("recuperação: e-mail inexistente recebe a mesma resposta", none.status === 200 && none.body?.success === true);
    const { link } = await lastLink(USER_A, before);
    await r.page.goto(link);
    await r.page.getByRole("heading", { name: "Defina uma nova senha" }).waitFor({ timeout: 20000 });
    await r.page.getByLabel(/^Nova senha/).fill(PASS.newA);
    await r.page.getByLabel(/^Confirme a senha/).fill(PASS.newA);
    await r.page.getByRole("button", { name: "Salvar nova senha" }).click();
    await r.page.waitForURL(/\/login\?reset=ok/, { timeout: 20000 });
    check("recuperação: nova senha → volta ao login", true);
    await new Promise((res) => setTimeout(res, 11000)); // cache de identidade (10 s)
    check("recuperação: sessões anteriores revogadas (as duas)", (await api(other.page, "/api/session/context")).status === 401 && (await api(a2.page, "/api/session/context")).status === 401);
    await login(r.page, USER_A, PASS.userA);
    await r.page.getByText("E-mail ou senha inválidos").waitFor();
    await login(a2.page, USER_A, PASS.newA);
    await a2.page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    check("recuperação: senha antiga recusada, nova aceita", (await api(a2.page, "/api/session/context")).status === 200);
    await r.page.goto(link);
    await r.page.getByRole("heading", { name: "Link inválido ou expirado" }).waitFor({ timeout: 20000 });
    check("recuperação: link de uso único", true);
    await other.ctx.close();
    await r.ctx.close();
  }

  // ================================================================ 8. desativação no EDUCA, banimento e identidades sem acesso
  {
    const d = await api(a1.page, `/api/users/${userA2}`, { method: "PATCH", body: JSON.stringify({ status: "Inativo" }) });
    const ctx = await api(a2.page, "/api/session/context");
    const data = await api(a2.page, "/api/admin/users");
    check("desativado no EDUCA: contexto 'inactive' e sem dados", d.status === 200 && ctx.body?.data?.access === "inactive" && data.status === 403, `${d.status} ${ctx.body?.data?.access} ${data.status}`);
    await api(a1.page, `/api/users/${userA2}`, { method: "PATCH", body: JSON.stringify({ status: "Ativo" }) });

    const admin = await neonAdmin();
    const b2id = neonSql(`select id from "user" where email='${OPER_B}'`);
    const ban = await admin("/admin/ban-user", { userId: b2id, banReason: "e2e" });
    await new Promise((res) => setTimeout(res, 11000));
    check("banido no Neon: sessão cai (401)", ban.status === 200 && (await api(b2.page, "/api/session/context")).status === 401, `${ban.status}`);
    await login(b2.page, OPER_B, PASS.operB);
    await b2.page.getByText("E-mail ou senha inválidos").waitFor();
    check("banido no Neon: login recusado com mensagem genérica", true);
    await admin("/admin/unban-user", { userId: b2id });

    const loose = await admin("/admin/create-user", { email: "solto@educa-poc.test", password: PASS.loose, name: "Solto", role: "user", data: { emailVerified: true } });
    const x = await newCtx(browser);
    await login(x.page, "solto@educa-poc.test", PASS.loose);
    await x.page.getByText("ainda não foi liberado").waitFor({ timeout: 15000 });
    check("identidade Neon válida SEM vínculo no EDUCA: login recusado (403), sem cookie", loose.status === 200 && !(await sessionCookie(x.ctx)));
    neonSql(`update "user" set "emailVerified"=false where email='${ADMIN_B}'`);
    const y = await newCtx(browser);
    await login(y.page, ADMIN_B, PASS.adminB);
    await y.page.getByText("ainda não foi liberado").waitFor({ timeout: 15000 });
    check("e-mail não confirmado no Neon: login recusado mesmo com vínculo", !(await sessionCookie(y.ctx)));
    neonSql(`update "user" set "emailVerified"=true where email='${ADMIN_B}'`);
    await x.ctx.close();
    await y.ctx.close();
  }

  // ================================================================ 9. cadastro público, redirecionamento externo, rotas do Supabase
  {
    const s = await fetch(`${NEON}/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ email: "publico@x.test", password: pw(), name: "P" }) });
    check("cadastro público recusado no provedor", s.status >= 400);
    const appSignup = await fetch(`${APP}/api/auth/sign-up`, { method: "POST" });
    check("o app não tem rota de cadastro", appSignup.status === 404 || appSignup.status === 405);
    // Login CSRF: formulário de outro site (text/plain em forma de JSON) com credenciais VÁLIDAS.
    const csrfForm = await fetch(`${APP}/api/auth/sign-in`, { method: "POST", headers: { "content-type": "text/plain", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: `{"email":"${ADMIN_A}","password":"${PASS.adminA}"}` });
    check("login CSRF: formulário de outro site recusado (403, sem cookie)", csrfForm.status === 403 && !(csrfForm.headers.get("set-cookie") ?? "").includes("educa_session"), csrfForm.status);
    const csrfJson = await fetch(`${APP}/api/auth/sign-in`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: ADMIN_A, password: PASS.adminA }) });
    check("login CSRF: JSON de outra origem recusado (403, sem cookie)", csrfJson.status === 403 && !(csrfJson.headers.get("set-cookie") ?? "").includes("educa_session"), csrfJson.status);
    const evil = await fetch(`${NEON}/request-password-reset`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ email: ADMIN_A, redirectTo: "https://evil.example/roubo" }) });
    check("redirect externo no link de senha recusado pelo provedor", evil.status === 403);
    const z = await newCtx(browser);
    await z.page.goto(`${APP}/login?next=${encodeURIComponent("//evil.example/x")}`);
    await z.page.getByLabel(/^E-mail/).fill(ADMIN_A);
    await z.page.getByLabel(/^Senha/).fill(PASS.adminA);
    await z.page.getByRole("button", { name: "Entrar" }).click();
    await z.page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    check("login com next externo fica no app", new URL(z.page.url()).origin === APP, z.page.url());
    const cb = await fetch(`${APP}/auth/callback?code=abc&next=/`, { redirect: "manual" });
    check("callback do Supabase inerte com AUTH_PROVIDER=neon", cb.status === 303 && (cb.headers.get("location") ?? "").includes("/login?erro=link"));
    const anon = await fetch(`${APP}/api/session/context`);
    check("sem cookie: API 401", anon.status === 401);
    await z.ctx.close();
  }

  // ================================================================ 10. expiração da sessão no provedor
  {
    const c = await sessionCookie(b1.ctx);
    const token = decodeURIComponent(c.value).split("=")[1].split(".")[0];
    neonSql(`update session set "expiresAt" = now() - interval '1 minute' where token='${token}'`);
    await new Promise((res) => setTimeout(res, 11000));
    check("sessão expirada no Neon → 401 no app", (await api(b1.page, "/api/session/context")).status === 401);
    await b1.page.goto(`${APP}/app/admin`);
    await b1.page.waitForURL(/\/login/, { timeout: 15000 });
    check("sessão expirada → proxy leva ao login", true);
  }
  // ================================================================ 11. CRUD por módulo — PostgreSQL direto (sem PostgREST)
  // Admin A1 (Alfa) opera catálogo, estoque, compras, vendas e logística pelo app.
  const made = {};
  {
    const post = (url, body) => api(a1.page, url, { method: "POST", body: JSON.stringify(body) });
    const patch = (url, body) => api(a1.page, url, { method: "PATCH", body: JSON.stringify(body) });
    const del = (url) => api(a1.page, url, { method: "DELETE" });

    // Catálogo. Sem a 0091 (igual à produção, conferido só leitura): não
    // existem units.* no catálogo e a API pedia product_categories.* → 403.
    // Com a 0091: o Administrador cria categoria (categories.create, com
    // código) e unidade (units.create) → 201.
    const has0091 = sql("select count(*) from pg_constraint where conname = 'units_base_unit_id_same_company_fk'") === "1";
    const cat = await post("/api/product-categories", { codigo: "FER-POC", nome: "Ferramentas POC" });
    const un = await post("/api/units", { codigo: "UNP", nome: "Unidade POC" });
    if (has0091) {
      check("catálogo (0091): Administrador cria categoria com código (201)", cat.status === 201 && sql("select count(*) from product_categories where code='FER-POC'") === "1", `${cat.status} ${JSON.stringify(cat.body)}`);
      check("catálogo (0091): Administrador cria unidade (201)", un.status === 201, `${un.status} ${JSON.stringify(un.body)}`);
    } else {
      check("linha de base: categorias sem permissão no catálogo (403, igual a produção)", cat.status === 403 && /product_categories\.create/.test(JSON.stringify(cat.body)), `${cat.status}`);
      check("linha de base: unidades sem permissão no catálogo (403, igual a produção)", un.status === 403 && /units\.create/.test(JSON.stringify(un.body)), `${un.status}`);
    }
    const unitsA = sql(`select count(*) from units where company_id='${companyA}' and code='UN'`);
    check("catálogo: unidades padrão criadas junto com a empresa (UN existe na Alfa)", unitsA === "1", unitsA);
    const badUnit = await post("/api/products", { codigo: "P-POC-X", descricao: "Unidade inexistente", categoria: "X", unidade: "NAOEXISTE" });
    check("catálogo: produto com unidade inexistente recusado pela FK composta (4xx, nada gravado)", badUnit.status >= 400 && badUnit.status < 500 && sql(`select count(*) from products where code='P-POC-X'`) === "0", `${badUnit.status} ${JSON.stringify(badUnit.body)}`);
    const prod = await post("/api/products", { codigo: "P-POC-001", descricao: "Parafuso POC", categoria: "Ferramentas", unidade: "UN", precoVenda: 12.5, precoCusto: 7.25 });
    made.product = prod.body?.data?.id;
    check("CRUD catálogo: criar produto (201)", prod.status === 201 && !!made.product, JSON.stringify(prod.body));
    const prodGet = await api(a1.page, `/api/products/${made.product}`);
    check("CRUD catálogo: ler produto por id (numérico volta como número)", prodGet.status === 200 && prodGet.body?.data?.codigo === "P-POC-001" && prodGet.body?.data?.precoVenda === 12.5, JSON.stringify(prodGet.body?.data));
    const prodUpd = await patch(`/api/products/${made.product}`, { precoVenda: 13.9 });
    check("CRUD catálogo: editar produto", prodUpd.status === 200 && Number(sql(`select sale_price from products where id='${made.product}'`)) === 13.9, JSON.stringify(prodUpd.body));
    const list = await api(a1.page, "/api/products?search=Parafuso&sort=code&order=asc&page=1&pageSize=10");
    check("CRUD catálogo: listar com busca, ordenação, paginação e total", list.status === 200 && list.body?.data?.length === 1 && list.body?.meta?.total === 1, JSON.stringify(list.body?.meta));

    // Estoque: depósito + local + entrada de estoque (função do banco)
    const wh = await post("/api/warehouses", { codigo: "CD-POC", nome: "CD Alfa POC" });
    made.warehouse = wh.body?.data?.id;
    check("CRUD estoque: criar depósito", wh.status === 201 && !!made.warehouse, JSON.stringify(wh.body));
    const whUpd = await patch(`/api/warehouses/${made.warehouse}`, { nome: "CD Alfa POC Ed." });
    check("CRUD estoque: editar depósito", whUpd.status === 200 && whUpd.body?.data?.nome === "CD Alfa POC Ed.", JSON.stringify(whUpd.body));
    // Linha de base de PRODUÇÃO: warehouse_locations.warehouse_id é NOT NULL e
    // o mapper da API não o preenche — o POST falha lá também (conferido).
    const loc = await post("/api/warehouse-locations", { codigoLocal: "A-01", armazem: "CD-POC", tipo: "Prateleira" });
    check("linha de base: POST de local falha por warehouse_id NOT NULL (igual a produção; nada gravado)", loc.status >= 400 && sql(`select count(*) from warehouse_locations where company_id='${companyA}' and code='A-01'`) === "0", `${loc.status}`);
    // Local criado como dado de teste (SQL de dono), para seguir com o fluxo de estoque.
    made.location = sql(`with i as (insert into warehouse_locations (company_id, warehouse_id, warehouse, code, name) values ('${companyA}', '${made.warehouse}', 'CD-POC', 'A-01', 'Prateleira A-01') returning id) select id from i`);
    const locGet = await api(a1.page, `/api/warehouse-locations/${made.location}`);
    check("CRUD estoque: ler local pela API (RLS da Alfa)", locGet.status === 200 && locGet.body?.data?.codigoLocal === "A-01", `${locGet.status}`);
    const locUpd = await patch(`/api/warehouse-locations/${made.location}`, { descricao: "Prateleira A-01 Ed." });
    check("CRUD estoque: editar local pela API", locUpd.status === 200 && sql(`select name from warehouse_locations where id='${made.location}'`) === "Prateleira A-01 Ed.", `${locUpd.status} ${JSON.stringify(locUpd.body)}`);
    const rec = await post("/api/stock-movements/receive", { productId: made.product, locationId: made.location, quantity: 40, unitCost: 7.25, idempotencyKey: "poc-rec-1" });
    check("estoque: entrada via função do banco (rpc) atualiza saldo", rec.status < 300 && Number(sql(`select coalesce(sum(on_hand),0) from stock_balances where product_id='${made.product}'`)) === 40, `${rec.status} ${JSON.stringify(rec.body)}`);
    const rec2 = await post("/api/stock-movements/receive", { productId: made.product, locationId: made.location, quantity: 40, unitCost: 7.25, idempotencyKey: "poc-rec-1" });
    check("estoque: mesma chave de idempotência não duplica a entrada", rec2.status < 300 && Number(sql(`select coalesce(sum(on_hand),0) from stock_balances where product_id='${made.product}'`)) === 40, `${rec2.status}`);

    // Compras: fornecedor + solicitação + envio para aprovação
    const sup = await post("/api/suppliers", { tipo: "Pessoa Jurídica", razaoSocial: "Fornecedor POC Ltda", documento: "12.345.678/0001-90" });
    made.supplier = sup.body?.data?.id;
    check("CRUD compras: criar fornecedor", sup.status === 201 && !!made.supplier, JSON.stringify(sup.body));
    const pr = await post("/api/purchase-requests", { priority: "high", justification: "Reposição POC", items: [{ productId: made.product, description: "Parafuso POC", quantity: 100 }] });
    made.purchaseRequest = pr.body?.data?.id;
    check("compras: criar solicitação com itens (função transacional)", pr.status === 201 && !!made.purchaseRequest && sql(`select count(*) from purchase_request_items where request_id='${made.purchaseRequest}'`) === "1", JSON.stringify(pr.body));
    const prSub = await post(`/api/purchase-requests/${made.purchaseRequest}/submit`, {});
    check("compras: enviar solicitação para aprovação (workflow no banco)", prSub.status === 200 && sql(`select status from purchase_requests where id='${made.purchaseRequest}'`) !== "draft", `${prSub.status} ${JSON.stringify(prSub.body)}`);

    // Vendas: cliente + pedido de venda
    const cus = await post("/api/customers", { tipo: "Pessoa Jurídica", nome: "Cliente POC SA", documento: "98.765.432/0001-10" });
    made.customer = cus.body?.data?.id;
    check("CRUD vendas: criar cliente", cus.status === 201 && !!made.customer, JSON.stringify(cus.body));
    const so = await post("/api/sales-orders", { customerId: made.customer, items: [{ productId: made.product, description: "Parafuso POC", quantity: 3, unitPrice: 13.9 }] });
    made.salesOrder = so.body?.data?.id;
    check("vendas: criar pedido de venda com itens", so.status === 201 && !!made.salesOrder && sql(`select count(*) from sales_order_items where order_id='${made.salesOrder}'`) === "1", JSON.stringify(so.body));
    const soGet = await api(a1.page, `/api/sales-orders/${made.salesOrder}`);
    check("vendas: ler pedido (total calculado pelo banco — coluna gerada)", soGet.status === 200 && JSON.stringify(soGet.body).includes("41.7"), JSON.stringify(soGet.body?.data)?.slice(0, 300));

    // Logística: transportadora (criar, editar, excluir)
    const car = await post("/api/carriers", { razaoSocial: "Transportes POC", cnpj: "11.222.333/0001-44" });
    made.carrier = car.body?.data?.id;
    check("CRUD logística: criar transportadora", car.status === 201 && !!made.carrier, JSON.stringify(car.body));
    const carUpd = await patch(`/api/carriers/${made.carrier}`, { nomeFantasia: "TransPOC" });
    check("CRUD logística: editar transportadora", carUpd.status === 200 && carUpd.body?.data?.nomeFantasia === "TransPOC", JSON.stringify(carUpd.body));
    const car2 = await post("/api/carriers", { razaoSocial: "Transportes Descartável", cnpj: "55.666.777/0001-88" });
    const carDel = await del(`/api/carriers/${car2.body?.data?.id}`);
    check("CRUD logística: excluir transportadora", carDel.status === 200 && sql(`select count(*) from carriers where id='${car2.body?.data?.id}'`) === "0", `${carDel.status}`);

    // Auditoria gravada pelo banco/servidor
    check("auditoria: operações registradas em audit_logs da Alfa", Number(sql(`select count(*) from audit_logs where company_id='${companyA}'`)) >= 5);
  }

  // ================================================================ 12. isolamento por empresa e papéis no CRUD
  {
    // A sessão de B1 foi expirada na seção 10: novo login.
    await login(b1.page, ADMIN_B, PASS.adminB);
    await b1.page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    // B2 foi banido e desbanido na seção 9 (sessão revogada): novo login.
    await login(b2.page, OPER_B, PASS.operB);
    await b2.page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
    const bGet = await api(b1.page, `/api/products/${made.product}`);
    check("cross-tenant: B1 não lê produto da Alfa pelo id (404)", bGet.status === 404, `${bGet.status}`);
    const bList = await api(b1.page, "/api/products?search=Parafuso");
    check("cross-tenant: B1 não vê produtos da Alfa na lista", bList.status === 200 && (bList.body?.data ?? []).length === 0, JSON.stringify(bList.body?.meta));
    const bPatch = await api(b1.page, `/api/warehouses/${made.warehouse}`, { method: "PATCH", body: JSON.stringify({ nome: "Invadido" }) });
    check("cross-tenant: B1 não altera depósito da Alfa", bPatch.status === 404 && sql(`select name from warehouses where id='${made.warehouse}'`) === "CD Alfa POC Ed.", `${bPatch.status}`);
    const bDel = await api(b1.page, `/api/carriers/${made.carrier}`, { method: "DELETE" });
    check("cross-tenant: B1 não exclui transportadora da Alfa", bDel.status === 404 && sql(`select count(*) from carriers where id='${made.carrier}'`) === "1", `${bDel.status}`);
    const bSo = await api(b1.page, `/api/sales-orders/${made.salesOrder}`);
    check("cross-tenant: B1 não lê pedido de venda da Alfa", bSo.status >= 400, `${bSo.status}`);
    const bRec = await api(b1.page, "/api/stock-movements/receive", { method: "POST", body: JSON.stringify({ productId: made.product, locationId: made.location, quantity: 5 }) });
    check("cross-tenant: B1 não movimenta estoque da Alfa (função do banco recusa)", bRec.status >= 400 && Number(sql(`select coalesce(sum(on_hand),0) from stock_balances where product_id='${made.product}'`)) === 40, `${bRec.status}`);

    const rList = await api(a2.page, "/api/products");
    check("papel leitura: A2 lista produtos (200)", rList.status === 200 && (rList.body?.data ?? []).length === 1);
    const rPost = await api(a2.page, "/api/products", { method: "POST", body: JSON.stringify({ codigo: "X", descricao: "X", categoria: "X", unidade: "UN" }) });
    check("papel leitura: A2 não cria produto (403)", rPost.status === 403, `${rPost.status}`);
    const rDel = await api(a2.page, `/api/carriers/${made.carrier}`, { method: "DELETE" });
    check("papel leitura: A2 não exclui (403)", rDel.status === 403, `${rDel.status}`);
    const oCar = await api(b2.page, "/api/carriers", { method: "POST", body: JSON.stringify({ razaoSocial: "Transp Beta Op", cnpj: "22.333.444/0001-55" }) });
    check("papel operador: B2 cria na própria empresa", oCar.status === 201 && sql(`select company_id from carriers where id='${oCar.body?.data?.id}'`) === companyB, JSON.stringify(oCar.body));
    const oDel = await api(b2.page, `/api/carriers/${oCar.body?.data?.id}`, { method: "DELETE" });
    check("papel operador: B2 não exclui (403)", oDel.status === 403, `${oDel.status}`);
  }

  // ================================================================ 13. injeção e segurança direta no banco
  {
    const inj = await api(a1.page, `/api/products?search=${encodeURIComponent("' or 1=1 --")}`);
    check("injeção: busca com SQL vira texto (0 resultados, 200)", inj.status === 200 && (inj.body?.data ?? []).length === 0, `${inj.status}`);
    // Linha de base de PRODUÇÃO: table.ts remove % e _ e monta .or() com o termo;
    // vírgulas viram condições extras. No PostgREST, coluna inexistente → 400 →
    // translatePostgresError → 500 DATABASE_ERROR genérico. A POC deve dar o mesmo,
    // sem vazar SQL e sem devolver linha de outra empresa.
    const generic = (r) => r.body?.error?.code === "DATABASE_ERROR" && !/column|syntax|select|relation/i.test(JSON.stringify(r.body));
    const orInj = await api(a1.page, `/api/products?search=${encodeURIComponent(`zzz%,company_id.neq.${companyA}`)}`);
    check("injeção de filtro (.or): erro genérico igual a produção, sem vazar SQL nem dados", orInj.status === 500 && generic(orInj) && !(orInj.body?.data ?? []).length, `${orInj.status} ${JSON.stringify(orInj.body)}`);
    const orInj2 = await api(a1.page, `/api/products?search=${encodeURIComponent(`zzz,code.neq.x`)}`);
    const leaked = (orInj2.body?.data ?? []).filter((p) => sql(`select company_id from products where id='${p.id}'`) !== companyA).length;
    check("injeção de filtro válida (.or com coluna real): RLS mantém só a Alfa", orInj2.status === 200 && leaked === 0 && (orInj2.body?.data ?? []).length >= 1, `${orInj2.status} ${leaked}`);
    const sortInj = await api(a1.page, `/api/products?sort=${encodeURIComponent("codigo; drop table products")}`);
    check("injeção na ordenação: erro genérico (igual a produção); tabela intacta", sortInj.status === 500 && generic(sortInj) && sql(`select to_regclass('public.products') is not null`) === "t", `${sortInj.status} ${JSON.stringify(sortInj.body)}`);
    check("injeção na ordenação: nada no log de 'erro não tratado' (erro devolvido como {error}, como no supabase-js)", !fs.readFileSync(process.env.APP_LOG ?? "/dev/null", "utf8").includes("codigo; drop table"));
    check("banco: papel de login da app (educa_app) sem privilégio direto", appSql("select count(*) from public.products").startsWith("ERRO") && appSql("select count(*) from auth.users").startsWith("ERRO"));
    check("banco: educa_app não assume papel de dono/superusuário", appSql("set role neondb_owner").startsWith("ERRO") && appSql("set role postgres").startsWith("ERRO"));
    check("banco: 'authenticated' sem claims não vê nada (RLS)", appSql("begin; set local role authenticated; select count(*) from public.products; commit;").split("\n").includes("0"));
    const a1Auth = sql(`select auth_user_id from users where email='${ADMIN_A}'`);
    const claims = (sub) => `select set_config('request.jwt.claims', '{"sub":"${sub}","role":"authenticated"}', true)`;
    const seen = appSql(`begin; set local role authenticated; ${claims(a1Auth)}; select count(*) from public.products where company_id <> '${companyA}'; commit;`);
    check("banco: com as claims de A1, RLS esconde outras empresas mesmo sem filtro", seen.split("\n").includes("0"), seen);
    const ins = appSql(`begin; set local role authenticated; ${claims(a1Auth)}; insert into public.products (company_id, code, description) values ('${companyB}', 'X', 'X'); commit;`);
    check("banco: A1 não insere linha na Beta nem por SQL direto (RLS)", ins.startsWith("ERRO") && /row-level security|permission/i.test(ins), ins.slice(0, 160));
    const esc2 = appSql(`begin; set local role authenticated; ${claims(a1Auth)}; update public.user_roles set role_id = role_id where false; update public.users set auth_user_id = gen_random_uuid() where email='${ADMIN_A}'; commit;`);
    check("banco: auth_user_id não pode ser trocado nem pelo próprio usuário", esc2.startsWith("ERRO") && sql(`select auth_user_id from users where email='${ADMIN_A}'`) === a1Auth, esc2.slice(0, 160));
    const link = appSql(`begin; set local role authenticated; ${claims(a1Auth)}; select count(*) from public.auth_identity_links; commit;`);
    check("banco: vínculo de identidade (0073) invisível para authenticated", link.startsWith("ERRO"), link.slice(0, 120));
  }

  // ================================================================ 14. módulos: Financeiro, Fiscal, Produção, CRM, Qualidade, Projetos, Workflow, Importação
  await runModuleE2E({ APP, api, sql, check, a1, a2, b1, companyA, companyB, made, crypto });
} catch (error) {
  check("execução sem exceção", false, error?.stack ?? String(error));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
