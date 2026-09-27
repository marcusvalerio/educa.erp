// E2E de HOMOLOGAÇÃO — contra o app PUBLICADO (Vercel Preview → Next.js →
// Neon Auth → Neon PostgreSQL, branch "homolog" do educa-erp-prod). Diferente do
// e2e-postgres.mjs, não acessa o banco nem o provedor por dentro: só HTTP e
// navegador, como um usuário. Contas de teste pré-criadas pelo fluxo de convite
// (README desta pasta); senhas SÓ em variáveis de ambiente/secrets do CI.
//
//   APP=https://<preview>.vercel.app NEON_AUTH_BASE_URL=https://…/authdb/auth \
//   E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… E2E_ADMIN_A_EMAIL=… E2E_ADMIN_A_PASSWORD=… \
//   E2E_READER_A_EMAIL=… E2E_READER_A_PASSWORD=… E2E_ADMIN_B_EMAIL=… E2E_ADMIN_B_PASSWORD=… \
//   node poc/neon-full/homolog/e2e-homolog.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const need = (n) => {
  if (!process.env[n]) throw new Error(`Defina ${n}.`);
  return process.env[n];
};
const APP = need("APP").replace(/\/+$/, "");
const NEON = need("NEON_AUTH_BASE_URL").replace(/\/+$/, "");
const U = {
  owner: [need("E2E_OWNER_EMAIL"), need("E2E_OWNER_PASSWORD")],
  adminA: [need("E2E_ADMIN_A_EMAIL"), need("E2E_ADMIN_A_PASSWORD")],
  readerA: [need("E2E_READER_A_EMAIL"), need("E2E_READER_A_PASSWORD")],
  adminB: [need("E2E_ADMIN_B_EMAIL"), need("E2E_ADMIN_B_PASSWORD")],
};

// Preview com "Deployment Protection": cabeçalho de bypass da Vercel (opcional).
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ? { "x-vercel-protection-bypass": process.env.VERCEL_BYPASS_TOKEN, "x-vercel-set-bypass-cookie": "true" } : {};
const newContext = (b) => b.newContext({ extraHTTPHeaders: BYPASS });
const http = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), ...(url.startsWith(APP) ? BYPASS : {}) } });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? " — " + String(detail).slice(0, 220) : ""}`);
};
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
async function session(browser, [email, password]) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(`${APP}/login`);
  await page.getByLabel(/^E-mail/).fill(email);
  await page.getByLabel(/^Senha/).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page };
}
const cookie = async (ctx) => (await ctx.cookies(APP)).find((c) => c.name === "educa_session");

const browser = await chromium.launch();
try {
  // ---------------------------------------------------------------- sem sessão
  check("sem cookie: API 401", (await http(`${APP}/api/session/context`)).status === 401);
  const anon = await (await newContext(browser)).newPage();
  await anon.goto(`${APP}/admin`);
  await anon.waitForURL(/\/login/, { timeout: 20000 });
  check("sem sessão: /admin → /login", true);
  await anon.getByLabel(/^E-mail/).fill(U.adminA[0]);
  await anon.getByLabel(/^Senha/).fill("senha-errada-homolog-1");
  await anon.getByRole("button", { name: "Entrar" }).click();
  await anon.getByText("E-mail ou senha inválidos").waitFor({ timeout: 20000 });
  check("senha errada → mensagem genérica", true);

  // ---------------------------------------------------------------- sessões reais
  const o = await session(browser, U.owner);
  const a = await session(browser, U.adminA);
  const r = await session(browser, U.readerA);
  const b = await session(browser, U.adminB);
  const c = await cookie(a.ctx);
  check("cookie do EDUCA HttpOnly + Secure + SameSite=Lax; nenhum cookie do Neon no navegador", c?.httpOnly && c.secure && c.sameSite === "Lax" && !(await a.ctx.cookies()).some((x) => x.name.includes("neon-auth")), JSON.stringify(c));
  const ctxO = await api(o.page, "/api/session/context");
  const ctxA = await api(a.page, "/api/session/context");
  const ctxR = await api(r.page, "/api/session/context");
  const ctxB = await api(b.page, "/api/session/context");
  const companyA = ctxA.body?.data?.tenant?.company?.id;
  check("Owner: plataforma OWNER, sem tenant", ctxO.body?.data?.platform?.role === "OWNER" && ctxO.body?.data?.tenant === null);
  check("admin A: empresa A, papel admin", !!companyA && ctxA.body.data.tenant.roles.some((x) => x.code === "admin"));
  check("leitura A: mesma empresa, só leitura", ctxR.body?.data?.tenant?.company?.id === companyA && ctxR.body.data.tenant.roles.every((x) => x.code === "leitura"));
  check("admin B: outra empresa", !!ctxB.body?.data?.tenant?.company?.id && ctxB.body.data.tenant.company.id !== companyA);

  // ---------------------------------------------------------------- RBAC e multi-tenancy
  check("Company Admin não acessa a Administração Central (403)", (await api(a.page, "/api/platform/companies")).status === 403);
  check("Owner não acessa dados de empresa (403)", (await api(o.page, "/api/admin/users")).status === 403);
  const cnpj = `${Date.now()}`.slice(-8);
  const car = await api(a.page, "/api/carriers", { method: "POST", body: JSON.stringify({ razaoSocial: `Transp Homolog ${cnpj}`, cnpj: `11.${cnpj.slice(0, 3)}.${cnpj.slice(3, 6)}/0001-${cnpj.slice(6, 8)}` }) });
  const carId = car.body?.data?.id;
  check("CRUD: admin A cria (201)", car.status === 201 && !!carId, JSON.stringify(car.body));
  check("CRUD: admin A edita", (await api(a.page, `/api/carriers/${carId}`, { method: "PATCH", body: JSON.stringify({ nomeFantasia: "Homolog" }) })).status === 200);
  check("cross-tenant: admin B não lê (404)", (await api(b.page, `/api/carriers/${carId}`)).status === 404);
  check("cross-tenant: admin B não altera (404)", (await api(b.page, `/api/carriers/${carId}`, { method: "PATCH", body: JSON.stringify({ nomeFantasia: "Invadido" }) })).status === 404);
  check("RBAC: leitura não cria (403)", (await api(r.page, "/api/carriers", { method: "POST", body: JSON.stringify({ razaoSocial: "X", cnpj: "00.000.000/0001-00" }) })).status === 403);
  check("RBAC: leitura não exclui (403)", (await api(r.page, `/api/carriers/${carId}`, { method: "DELETE" })).status === 403);
  const inj = await api(a.page, `/api/products?search=${encodeURIComponent("' or 1=1 --")}`);
  check("injeção na busca vira texto (200, 0 linhas)", inj.status === 200 && (inj.body?.data ?? []).length === 0);
  check("CRUD: admin A exclui", (await api(a.page, `/api/carriers/${carId}`, { method: "DELETE" })).status === 200);

  // ---------------------------------------------------------------- módulos (leitura pelo app → banco homolog)
  for (const url of ["/api/accounts-payable", "/api/fiscal-documents", "/api/production-orders", "/api/leads", "/api/quality-inspections", "/api/projects", "/api/workflows", "/api/imports", "/api/products", "/api/customers"]) {
    const x = await api(a.page, url);
    check(`módulo ${url}: 200 para admin A`, x.status === 200, `${x.status}`);
  }

  // ---------------------------------------------------------------- CSRF, redirecionamento, cadastro público
  const csrf = await http(`${APP}/api/auth/sign-in`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ email: U.adminA[0], password: U.adminA[1] }) });
  check("login CSRF de outra origem → 403, sem cookie", csrf.status === 403 && !(csrf.headers.get("set-cookie") ?? "").includes("educa_session"), csrf.status);
  const signup = await fetch(`${NEON}/sign-up/email`, { method: "POST", headers: { "content-type": "application/json", origin: APP }, body: JSON.stringify({ email: `publico+${Date.now()}@homolog.test`, password: "Senha-Publica-123#", name: "P" }) });
  check("cadastro público recusado no Neon Auth (allow_sign_up=false)", signup.status >= 400, signup.status);
  const z = await (await newContext(browser)).newPage();
  await z.goto(`${APP}/login?next=${encodeURIComponent("//evil.example/x")}`);
  await z.getByLabel(/^E-mail/).fill(U.readerA[0]);
  await z.getByLabel(/^Senha/).fill(U.readerA[1]);
  await z.getByRole("button", { name: "Entrar" }).click();
  await z.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  check("login com next externo fica no app", new URL(z.url()).origin === APP, z.url());

  // ---------------------------------------------------------------- logout e reuso do cookie
  const before = (await cookie(r.ctx)).value;
  await r.page.evaluate(() => fetch("/api/auth/logout", { method: "POST", redirect: "manual" }));
  check("logout: 401 em seguida", (await api(r.page, "/api/session/context")).status === 401);
  const thief = await newContext(browser);
  await thief.addCookies([{ name: "educa_session", value: before, url: APP }]);
  const tp = await thief.newPage();
  await tp.goto(`${APP}/login`);
  check("logout: cookie antigo reaproveitado não vale (sessão revogada no Neon Auth)", (await api(tp, "/api/session/context")).status === 401);
} catch (error) {
  check("execução sem exceção", false, error?.stack ?? String(error));
} finally {
  await browser.close();
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
