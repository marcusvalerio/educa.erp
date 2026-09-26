// E2E do EDUCA com AUTH_PROVIDER=neon: navegador real (Playwright) → app
// (next start) → servidor → Neon Auth (dublê local, mesmo motor e contrato
// do Neon real) → ponte → PostgREST → Postgres da réplica com as policies
// de produção. E-mails reais no Mailpit. Nada mockado dentro do app.
//
// Pré-requisitos: réplica recém-resetada SEM bootstrap do Supabase (neon-reset.sh),
// Owner criado por `node --import tsx scripts/bootstrap-platform-owner.mjs` com
// AUTH_PROVIDER=neon, dublê (neon-double.mjs) e app em modo neon no ar.
//   E2E_ENV=…/app-neon.env NEON_DOUBLE_DB=… REPLICA_PGPASS=… node poc/neon-auth/e2e-neon.mjs
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "/opt/node22/lib/node_modules/playwright/index.mjs");
const need = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const APP = process.env.APP ?? "http://localhost:3200";
const NEON = process.env.NEON_BASE ?? "http://localhost:3401/neondb/auth";
const MAIL = process.env.MAIL ?? "http://localhost:58025";
const appEnv = Object.fromEntries(fs.readFileSync(need("E2E_ENV"), "utf8").split("\n").filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const PG = ["-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-Atc"];
const sql = (q) => execFileSync("psql", [...PG, q], { env: { ...process.env, PGPASSWORD: need("REPLICA_PGPASS") } }).toString().trim();
const neonSql = (q) => execFileSync("psql", [need("NEON_DOUBLE_DB").replace(/\?.*$/, ""), "-Atc", q]).toString().trim();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? " — " + String(detail).slice(0, 220) : ""}`);
};
const PASS = { owner: "Dona#2026neon", adminA: "AdminAlfa#2026n", userA: "LeituraAlfa#2026", adminB: "AdminBeta#2026n", operB: "OperBeta#2026n", newA: "Recuperada#2026" };
const OWNER = "dona.plataforma@educa-replica.test";
const ADMIN_A = "admin.alfa@alfa-replica.test";
const USER_A = "leitura.alfa@alfa-replica.test";
const ADMIN_B = "admin.beta@beta-replica.test";
const OPER_B = "operador.beta@beta-replica.test";

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
  await page.waitForURL(/\/admin(\/|$|\?)|\/$|localhost:3200\/(\?|$)/, { timeout: 20000 });
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
    check("owner: depois de criar a senha vai para /admincentral", o.page.url().includes("/admincentral"), o.page.url());
    const ctx = await api(o.page, "/api/session/context");
    check("owner: contexto = plataforma OWNER, sem tenant", ctx.body?.data?.platform?.role === "OWNER" && ctx.body?.data?.tenant === null, JSON.stringify(ctx.body?.data?.platform));
    const ids = sql(`select l.auth_user_id = m.auth_user_id and l.auth_user_id = u.id from auth_identity_links l join platform_members m on m.email = l.email join auth.users u on u.email = l.email where l.email='${OWNER}'`);
    check("vínculo: Neon → auth_user_id = platform_members.auth_user_id = login sombra", ids === "t", ids);
    // O GoTrue grava um hash aleatório mesmo sem senha; o que importa: a senha do Neon NÃO abre o login sombra.
    const sb = await fetch(`${appEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: appEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ email: OWNER, password: PASS.owner }) });
    check("login sombra: a senha do Neon não autentica no Supabase Auth", sb.status === 400, `${sb.status}`);
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
    await o.page.goto(`${APP}/admincentral`);
    await o.page.waitForURL(/\/login\?next=%2Fadmincentral/, { timeout: 15000 });
    check("proxy: sem sessão → /login?next=", true);
    await login(o.page, OWNER, "senha-errada-123");
    await o.page.getByText("E-mail ou senha inválidos").waitFor();
    await login(o.page, "ninguem@educa-replica.test", "senha-errada-123");
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
    const c = await api(a2.page, "/api/users", { method: "POST", body: JSON.stringify({ nome: "Invasor", email: "x@alfa-replica.test", login: "x", perfil: "admin" }) });
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
    const none = await api(r.page, "/api/auth/password/recover", { method: "POST", body: JSON.stringify({ email: "ninguem@educa-replica.test" }) });
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

    const loose = await admin("/admin/create-user", { email: "solto@educa-replica.test", password: "Solto#2026ok", name: "Solto", role: "user", data: { emailVerified: true } });
    const x = await newCtx(browser);
    await login(x.page, "solto@educa-replica.test", "Solto#2026ok");
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
    const s = await fetch(`${NEON}/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ email: "publico@x.test", password: "Publico#2026", name: "P" }) });
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
    await b1.page.goto(`${APP}/admin`);
    await b1.page.waitForURL(/\/login/, { timeout: 15000 });
    check("sessão expirada → proxy leva ao login", true);
  }
} catch (error) {
  check("execução sem exceção", false, error?.stack ?? String(error));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
