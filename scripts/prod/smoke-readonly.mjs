// Smoke SOMENTE LEITURA da produção, sem credencial: nada é criado, alterado
// ou apagado. Só GET/HEAD e um POST de login vindo de OUTRA origem, que o app
// recusa antes de falar com qualquer provedor.
//
//   PROD_URL=https://educaerp.vercel.app node scripts/prod/smoke-readonly.mjs
//
// Arquitetura verificada: landing pública em "/", entrada em /login, ERP
// autenticado em /app, endereços antigos do ERP com 308 para /app/…, APIs 401
// sem sessão. WAIT_FOR_LANDING=1 espera (até 15 min) o deploy com a landing
// entrar no ar antes de verificar — útil logo depois de um push na main.
// EXPECT_AUTH (supabase|neon, padrão supabase) e ALLOW_HOMOLOG_SEAL=1 servem
// para rodar o mesmo smoke contra a pilha local de homologação.
const APP = (process.env.PROD_URL ?? "https://educaerp.vercel.app").replace(/\/+$/, "");
const EXPECT_AUTH = (process.env.EXPECT_AUTH ?? "supabase").toLowerCase();
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 180)}` : ""}`);
};
const hit = (path, init = {}) => fetch(`${APP}${path}`, { redirect: "manual", signal: AbortSignal.timeout(30000), ...init });
const region = (r) => (r.headers.get("x-vercel-id") ?? "—").split("::").slice(0, -1).join(" → ") || "—";
const SIGNUP = /criar conta|cadastre-se|teste gr[aá]tis|come[cç]ar agora|solicitar acesso/i;
const HOMOLOG_SEAL = /Homologação · dados fictícios|HOMOLOGAÇÃO<\/title>/;

if (process.env.WAIT_FOR_LANDING === "1") {
  const until = Date.now() + 15 * 60_000;
  for (;;) {
    const r = await hit("/").catch(() => null);
    if (r?.status === 200) break;
    if (Date.now() > until) break;
    console.log(`aguardando o deploy com a landing em "/" (agora: ${r?.status ?? "sem resposta"})`);
    await new Promise((res) => setTimeout(res, 20_000));
  }
}

// 1. Landing pública em "/"
const home = await hit("/");
const landing = home.status === 200 ? await home.text() : "";
check("GET / responde 200 (landing, sem redirecionar)", home.status === 200, `status ${home.status}; location ${home.headers.get("location") ?? "—"}; borda ${region(home)}`);
check("/ é a landing do ATLAS.ERP", /<title>ATLAS\.ERP · /.test(landing));
const enter = [...landing.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*Entrar(?:(?!<\/a>)[\s\S])*<\/a>/g)].map((m) => m[1]);
check(`'Entrar no ATLAS.ERP' → /login (${enter.length} links)`, enter.length >= 3 && enter.every((h) => h === "/login"), enter.join(", "));
check("landing sem CTA de cadastro", landing !== "" && !SIGNUP.test(landing));

// 2. Arquivos da landing, sem sessão (não passam pelo proxy)
const files = ["/landing/styles.css", "/landing/main.js", "/landing/motion.js", "/landing/vendor/gsap.min.js", "/landing/fonts/instrument-sans-latin-wght-normal.woff2"];
const img = landing.match(/\/landing\/img\/[^"' ,]+\.webp/)?.[0];
if (img) files.push(img);
for (const f of files) {
  const r = await hit(f);
  check(`arquivo da landing ${f.split("/").slice(2).join("/")} → 200`, r.status === 200, `status ${r.status}; ${r.headers.get("content-type") ?? ""}`);
}
for (const name of ["Manual-do-Usuario", "Manual-de-Administracao"]) {
  const pdf = `/landing/manuais/ATLAS-ERP-${name}.pdf`;
  const r = await hit(pdf, { method: "HEAD" });
  check(`manual ${pdf.split("/").pop()} → 200 PDF`, r.status === 200 && /pdf/.test(r.headers.get("content-type") ?? ""), `status ${r.status}; ${r.headers.get("content-type") ?? ""}`);
  // Links já distribuídos com o nome anterior: 308 para o PDF novo.
  const old = await hit(`/landing/manuais/EDUCA-${name}.pdf`, { method: "HEAD" });
  check(`manual com o nome anterior (EDUCA-${name}.pdf) → 308`, old.status === 308 && old.headers.get("location")?.endsWith(pdf), `status ${old.status}; location ${old.headers.get("location") ?? "—"}`);
}

// 3. Tela de login
const login = await hit("/login");
const html = login.status === 200 ? await login.text() : "";
check("GET /login responde 200", login.status === 200, `status ${login.status}; borda ${region(login)}`);
check("/login é a tela do ATLAS.ERP (formulário de entrada)", /ATLAS/.test(html) && /type="password"|Senha/i.test(html));
if (process.env.ALLOW_HOMOLOG_SEAL !== "1") check("produção SEM o selo de homologação", !HOMOLOG_SEAL.test(html) && !HOMOLOG_SEAL.test(landing));
check("login sem CTA de cadastro", !SIGNUP.test(html));
const asset = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/)?.[0];
if (asset) {
  const a = await hit(asset);
  check(`recurso estático do build carrega (${asset.split("/").pop()})`, a.status === 200, `status ${a.status}`);
} else check("recurso estático do build referenciado no HTML", false, "nenhum /_next/static no HTML");

// 4. ERP em /app: sem sessão → /login?next=/app…
for (const path of ["/app", "/app/comercial/pedidos-venda", "/app/financeiro/contas-receber", "/app/logistica/estoque", "/app/admin", "/app/admincentral"]) {
  const r = await hit(path);
  const to = new URL(r.headers.get("location") ?? "/", APP);
  check(`${path} sem sessão → /login`, r.status >= 300 && r.status < 400 && to.pathname === "/login" && (to.searchParams.get("next") ?? "").startsWith("/app"), `status ${r.status}; location ${to.pathname}${to.search}`);
}

// 5. Endereços antigos → 308 para /app/… (favoritos e links continuam valendo)
for (const [from, want] of [["/comercial/pedidos-venda?view=aprovacao", "/app/comercial/pedidos-venda?view=aprovacao"], ["/financeiro", "/app/financeiro"], ["/admin", "/app/admin"], ["/admincentral/companies", "/app/admincentral/companies"]]) {
  const r = await hit(from);
  const to = new URL(r.headers.get("location") ?? "/", APP);
  check(`${from.split("?")[0]} → 308 ${want.split("?")[0]}`, r.status === 308 && to.pathname + to.search === want, `status ${r.status}; location ${to.pathname}${to.search}`);
}

// 6. APIs protegidas sem sessão → 401
for (const path of ["/api/session/context", "/api/sales-orders", "/api/customers", "/api/admin/users", "/api/platform/members"]) {
  const r = await hit(path);
  check(`${path} sem sessão → 401`, r.status === 401, `status ${r.status}; função ${region(r)}`);
}

// 7. Provedor de autenticação em uso (sem credencial: POST de outra origem)
const signIn = await hit("/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json", origin: "https://exemplo.invalid" }, body: JSON.stringify({ email: "x@example.com", password: "x" }) });
const mode = signIn.status === 404 ? "supabase" : signIn.status === 403 ? "neon" : `desconhecido (${signIn.status})`;
check(`autenticação no provedor esperado (AUTH_PROVIDER=${EXPECT_AUTH})`, mode === EXPECT_AUTH, `POST /api/auth/sign-in de outra origem → ${signIn.status} ⇒ ${mode}`);

const pass = results.filter(Boolean).length;
console.log(`\nprodução (${APP}): ${pass}/${results.length} verificações passaram`);
process.exit(pass === results.length ? 0 : 1);
