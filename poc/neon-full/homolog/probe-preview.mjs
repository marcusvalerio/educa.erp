// Sonda de homologação SEM segredos e SEM escrita: roda num ambiente com internet
// (runner do GitHub Actions) e responde "o Preview existe? está protegido? em que
// modo de auth está? a função roda em qual região? o Neon Auth responde?".
// Só GET e um POST de login vindo de OUTRA origem, que o app recusa antes de
// falar com qualquer provedor (404 no modo Supabase, 403 no modo Neon).
//
//   PREVIEW_URL=https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app \
//   PROD_URL=https://educaerp.vercel.app \
//   HOMOLOG_AUTH_URL=https://…/authdb/auth PROD_AUTH_URL=https://…/neondb/auth \
//   node poc/neon-full/homolog/probe-preview.mjs
const targets = [
  { name: "preview", url: process.env.PREVIEW_URL, auth: process.env.HOMOLOG_AUTH_URL },
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
  const vid = login.headers.get("x-vercel-id") ?? "";
  const protectedByVercel = login.status === 401 && /vercel|sso|authentication required/i.test(login.text + (login.headers.get("set-cookie") ?? ""));
  out(`- GET /login → ${login.status}${login.status === 0 ? ` (${clip(login.text)})` : ""}; x-vercel-id: ${vid || "—"}; região da função: ${vid.split("::")[1] ?? "—"}`);
  out(`- Deployment Protection da Vercel: ${protectedByVercel ? "SIM (precisa de VERCEL_BYPASS_TOKEN)" : login.status === 0 || login.status === 404 ? "indeterminado" : "não"}`);
  if (protectedByVercel || login.status === 0) continue;
  const ctx = await hit(`${base}/api/session/context`);
  out(`- GET /api/session/context sem cookie → ${ctx.status} ${clip(ctx.text, 90)}`);
  const signIn = await hit(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://sonda-de-outra-origem.invalid" },
    body: JSON.stringify({ email: "sonda@example.invalid", password: "x" }),
  });
  const mode = signIn.status === 404 ? "AUTH_PROVIDER=supabase" : signIn.status === 403 ? "AUTH_PROVIDER=neon" : `indeterminado (${signIn.status})`;
  out(`- POST /api/auth/sign-in de outra origem → ${signIn.status} ⇒ ${mode}`);
  if (t.auth) {
    const ok = await hit(`${t.auth.replace(/\/+$/, "")}/ok`);
    out(`- Neon Auth ${t.auth} /ok → ${ok.status}`);
  }
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const fs = await import("node:fs");
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}
