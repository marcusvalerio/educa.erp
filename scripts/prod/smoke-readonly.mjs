// Smoke SOMENTE LEITURA da produção, sem credencial: nada é criado, alterado
// ou apagado. Só GET e um POST de login vindo de OUTRA origem, que o app
// recusa antes de falar com qualquer provedor.
//
//   PROD_URL=https://educaerp.vercel.app node scripts/prod/smoke-readonly.mjs
const APP = (process.env.PROD_URL ?? "https://educaerp.vercel.app").replace(/\/+$/, "");
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${String(detail).slice(0, 180)}` : ""}`);
};
const hit = (path, init = {}) => fetch(`${APP}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
const region = (r) => (r.headers.get("x-vercel-id") ?? "—").split("::").slice(0, -1).join(" → ") || "—";
const SIGNUP = /criar conta|cadastre-se|teste gr[aá]tis|come[cç]ar agora|solicitar acesso/i;

// 1. Tela de login
const login = await hit("/login");
const html = login.status === 200 ? await login.text() : "";
check("GET /login responde 200", login.status === 200, `status ${login.status}; borda ${region(login)}`);
check("/login é a tela do EDUCA (formulário de entrada)", /EDUCA/.test(html) && /type="password"|Senha/i.test(html));
check("produção SEM o selo de homologação", !/Homologação · dados fictícios/.test(html) && !/HOMOLOGAÇÃO<\/title>/.test(html));
check("login sem CTA de cadastro", !SIGNUP.test(html));

// 2. Recursos estáticos do build novo
const asset = html.match(/\/_next\/static\/[^"']+\.(?:js|css)/)?.[0];
if (asset) {
  const a = await hit(asset);
  check(`recurso estático do build carrega (${asset.split("/").pop()})`, a.status === 200, `status ${a.status}`);
} else check("recurso estático do build referenciado no HTML", false, "nenhum /_next/static no HTML");

// 3. Rotas protegidas sem sessão → /login
for (const path of ["/", "/comercial/pedidos", "/financeiro/contas-receber", "/logistica/estoque", "/admin", "/admincentral"]) {
  const r = await hit(path);
  const to = r.headers.get("location") ?? "";
  check(`${path} sem sessão → /login`, r.status >= 300 && r.status < 400 && /\/login/.test(to), `status ${r.status}; location ${to.split("?")[0]}`);
}

// 4. APIs protegidas sem sessão → 401
for (const path of ["/api/session/context", "/api/sales-orders", "/api/customers", "/api/admin/users", "/api/platform/members"]) {
  const r = await hit(path);
  check(`${path} sem sessão → 401`, r.status === 401, `status ${r.status}; função ${region(r)}`);
}

// 5. Provedor de autenticação em uso (sem credencial: POST de outra origem)
const signIn = await hit("/api/auth/sign-in", { method: "POST", headers: { "content-type": "application/json", origin: "https://exemplo.invalid" }, body: JSON.stringify({ email: "x@example.com", password: "x" }) });
const mode = signIn.status === 404 ? "supabase" : signIn.status === 403 ? "neon" : `desconhecido (${signIn.status})`;
check("autenticação continua no Supabase (AUTH_PROVIDER=supabase)", mode === "supabase", `POST /api/auth/sign-in de outra origem → ${signIn.status} ⇒ ${mode}`);

const pass = results.filter(Boolean).length;
console.log(`\nprodução (${APP}): ${pass}/${results.length} verificações passaram`);
process.exit(pass === results.length ? 0 : 1);
