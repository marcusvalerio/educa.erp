// Sonda de homologação SEM segredos e SEM escrita: roda num ambiente com internet
// (runner do GitHub Actions) e responde "o Preview existe? está protegido? em que
// modo de auth está? a função roda em qual região? o Neon Auth responde?".
// Só GET e um POST de login vindo de OUTRA origem, que o app recusa antes de
// falar com qualquer provedor (404 no modo Supabase, 403 no modo Neon). No Neon
// Auth de homologação, confere recuperação/origens/localhost/cadastro público com
// pedidos que não escrevem nada (e-mail inexistente, senha inválida).
//
//   PREVIEW_URL=https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app \
//   PROD_URL=https://educaerp.vercel.app \
//   HOMOLOG_AUTH_URL=https://…/authdb/auth PROD_AUTH_URL=https://…/neondb/auth \
//   node poc/neon-full/homolog/probe-preview.mjs
const targets = [
  { name: "preview", url: process.env.PREVIEW_URL, auth: process.env.HOMOLOG_AUTH_URL, checkAuthConfig: true },
  { name: "produção (só leitura)", url: process.env.PROD_URL, auth: process.env.PROD_AUTH_URL },
].filter((t) => t.url);

const clip = (s, n = 160) => String(s ?? "").replace(/\s+/g, " ").slice(0, n);
async function hit(url, init = {}) {
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20000), ...init });
    const text = await r.text().catch(() => "");
    return { status: r.status, headers: r.headers, text };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: String(e?.cause?.code ?? e?.message ?? e) };
  }
}

const lines = [];
const out = (s) => {
  lines.push(s);
  console.log(s);
};
for (const t of targets) {
  const base = t.url.replace(/\/+$/, "");
  out(`## ${t.name}: ${base}`);
  const login = await hit(`${base}/login`);
  const where = login.headers.get("location") ?? "";
  // Proteção da Vercel: 401 com página de login da Vercel, ou redirecionamento
  // para o SSO da Vercel (vercel.com/sso-api…, cookie _vercel_sso_nonce).
  const protectedByVercel =
    (login.status === 401 && /vercel|sso|authentication required/i.test(login.text)) ||
    ([301, 302, 303, 307, 308].includes(login.status) && /vercel\.com\/(sso|login)|_vercel_sso/i.test(where + (login.headers.get("set-cookie") ?? "")));
  out(`- GET /login → ${login.status}${login.status === 0 ? ` (${clip(login.text)})` : ""}${where ? `; redireciona para ${clip(where.split("?")[0], 80)}` : ""}; borda: ${(login.headers.get("x-vercel-id") ?? "—").split("::")[0]}`);
  out(`- Deployment Protection da Vercel: ${protectedByVercel ? "SIM (Vercel Authentication; o E2E precisa de VERCEL_BYPASS_TOKEN ou da proteção desligada para este Preview)" : login.status === 0 || login.status === 404 ? "indeterminado" : "não"}`);
  if (t.auth) {
    const auth = t.auth.replace(/\/+$/, "");
    const ok = await hit(`${auth}/ok`);
    out(`- Neon Auth ${t.auth} /ok → ${ok.status}`);
    if (t.checkAuthConfig) {
      // Configuração do Neon Auth de homologação, sem escrita: e-mail inexistente
      // (nenhum e-mail sai) e senha curta demais (nenhum usuário é criado).
      const post = (path, origin, body) =>
        hit(`${auth}${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
      const code = (r) => clip(r.text.match(/"code"\s*:\s*"([A-Z_]+)"/)?.[1] ?? "", 60);
      const nobody = "sonda.inexistente@example.com";
      const rec = await post("/request-password-reset", base, { email: nobody, redirectTo: `${base}/redefinir-senha?e=${nobody}` });
      out(`- recuperação (origem = Preview, redirect no Preview) → ${rec.status} ${code(rec)} ⇒ ${rec.status === 200 ? "OK (e-mail/senha ligado, origem confiável)" : "FALHA"}`);
      const evil = await post("/request-password-reset", base, { email: nobody, redirectTo: "https://sonda-de-outra-origem.invalid/x" });
      out(`- recuperação com redirect de outra origem → ${evil.status} ${code(evil)} ⇒ ${evil.status === 403 ? "recusado (OK)" : "ACEITO (revisar trusted origins)"}`);
      const local = await post("/request-password-reset", "http://localhost:3000", { email: nobody, redirectTo: "http://localhost:3000/redefinir-senha" });
      out(`- origem localhost → ${local.status} ${code(local)} ⇒ allow_localhost ${local.status === 403 ? "desligado (OK)" : local.status === 200 ? "LIGADO" : "indeterminado"}`);
      const up = await post("/sign-up/email", base, { email: "sonda.cadastro@example.com", password: "x", name: "Sonda" });
      const upCode = code(up);
      out(`- cadastro público (senha inválida, não cria conta) → ${up.status} ${upCode} ⇒ allow_sign_up ${/SIGN_?UP.*(DISABLED|NOT_ENABLED)/.test(upCode) ? "desligado (OK)" : /PASSWORD_TOO_SHORT/.test(upCode) ? "LIGADO" : "indeterminado"}`);
    }
  }
  if (protectedByVercel || login.status === 0) continue;
  const ctx = await hit(`${base}/api/session/context`);
  // x-vercel-id de uma rota dinâmica: "<borda>::<região da função>::<id>".
  const regions = (ctx.headers.get("x-vercel-id") ?? "").split("::").filter((x) => /^[a-z]{3}\d$/.test(x));
  out(`- GET /api/session/context sem cookie → ${ctx.status} ${clip(ctx.text, 90)}; borda/função: ${regions.join(" → ") || "—"}`);
  const signIn = await hit(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://sonda-de-outra-origem.invalid" },
    body: JSON.stringify({ email: "sonda@example.invalid", password: "x" }),
  });
  const mode = signIn.status === 404 ? "AUTH_PROVIDER=supabase" : signIn.status === 403 ? "AUTH_PROVIDER=neon" : `indeterminado (${signIn.status})`;
  out(`- POST /api/auth/sign-in de outra origem → ${signIn.status} ⇒ ${mode}`);

}
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}
