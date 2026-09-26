// O CÓDIGO DO APP contra o Neon Auth REAL: este arquivo é empacotado (esbuild)
// com src/lib/auth/neon/{client,flows,links}.ts e implantado como Neon Function
// no projeto de teste `educa-neon-auth-test`. Roteiro fixo, disparado pelo
// gatilho agendado; resultados nos logs (segredos redigidos; só os JWTs de
// teste marcados como PROBE_SECRET, para a ponte local).
import {
  adminCreateUser,
  adminFindUserByEmail,
  getSession,
  NeonAuthError,
  requestPasswordReset,
  resetPassword,
  revokeOtherSessions,
  signInWithPassword,
  signOut,
  adminMarkEmailVerified,
  type NeonAuthConfig,
} from "../../../src/lib/auth/neon/client";
import { provisionIdentity, resetPasswordFlow } from "../../../src/lib/auth/neon/flows";
import { buildNeonPasswordLinkUrl } from "../../../src/lib/auth/neon/links";
import crypto from "node:crypto";

const done = new Set<string>();
const log = (kind: string, o: unknown) => console.log(`${kind} ${JSON.stringify(o).slice(0, 6000)}`);
const pw = (name: string) => `Tst-${crypto.createHmac("sha256", process.env.PROBE_SEED ?? "").update(name).digest().toString("base64url").slice(0, 24)}`;

async function sql(query: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> {
  const db = new URL(process.env.DATABASE_URL!);
  const r = await fetch(`https://${db.hostname}/sql`, { method: "POST", headers: { "neon-connection-string": process.env.DATABASE_URL!, "content-type": "application/json" }, body: JSON.stringify({ query, params }) });
  return ((await r.json()) as { rows?: Array<Record<string, unknown>> }).rows ?? [];
}

const pause = (ms = 5000) => new Promise((r) => setTimeout(r, ms)); // limite de login do Neon: 3 por 10 s por IP
const iat = (jwt: string | null | undefined) => (jwt ? (JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).iat as number) : null);

const claims = (jwt: string | null) => {
  if (!jwt) return null;
  const [h, p] = jwt.split(".");
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return { alg: JSON.parse(Buffer.from(h, "base64url").toString()).alg, sub: c.sub, emailVerified: c.emailVerified, banned: c.banned, ttl: c.exp - c.iat, iss: c.iss === c.aud };
};

async function step(id: string, fn: () => Promise<unknown>) {
  try {
    log("APP", { id, ok: true, result: await fn() });
  } catch (e) {
    log("APP", { id, ok: false, error: e instanceof NeonAuthError ? { code: e.code, status: e.status, retry: e.retryAfterSeconds } : String(e) });
  }
}

async function run(runId: string, onlyTokens: boolean) {
  const config: NeonAuthConfig = { baseUrl: process.env.NEON_AUTH_BASE_URL!.replace(/\/+$/, ""), origin: "http://localhost:3000" };
  const svcEmail = "svc-admin@educa-teste.example.com";
  let admin = "";
  await step("service-sign-in", async () => {
    admin = (await signInWithPassword(config, svcEmail, pw("pwSvc"))).cookie;
    return { cookieName: admin.split("=")[0] };
  });

  if (onlyTokens) return tokens(config);
  // Convite com o código do app: identidade nova, sem senha + link de primeiro acesso.
  const invitee = `d-${runId}@educa-teste.example.com`;
  let neonId = "";
  await step("provision-invitee", async () =>
    provisionIdentity(
      { email: invitee, name: "D convidado" },
      {
        ensureShadowLogin: async () => "00000000-0000-4000-8000-000000000000", // sombra é do Supabase (réplica); aqui só o lado Neon
        findNeonUser: (e) => adminFindUserByEmail(config, admin, e),
        createNeonUser: async (e, n) => {
          const u = await adminCreateUser(config, admin, { email: e, name: n });
          neonId = u.id;
          return u;
        },
        link: async () => undefined,
        sendFirstAccess: (e) => requestPasswordReset(config, e, buildNeonPasswordLinkUrl(config.origin, e, { firstAccess: true, next: "/convite/x" })),
      }
    )
  );
  await step("find-invitee-by-email", async () => {
    const u = await adminFindUserByEmail(config, admin, invitee.toUpperCase());
    return { found: u?.id === neonId, emailVerified: u?.emailVerified };
  });
  await step("find-inexistente", async () => ({ found: !!(await adminFindUserByEmail(config, admin, "ninguem-" + runId + "@educa-teste.example.com")) }));

  // Primeiro acesso com o fluxo do app (o token que o e-mail levaria vem do banco do projeto de teste).
  const rows = await sql(`select split_part(identifier,':',2) as t from neon_auth.verification where value=$1 and identifier like 'reset-password:%' order by "createdAt" desc limit 1`, [neonId]);
  const token = String(rows[0]?.t ?? "");
  let dCookie: string | null = null;
  await pause();
  await step("first-access-flow", async () => {
    const r = await resetPasswordFlow(
      { token, password: pw("pwD"), email: invitee, continueSession: true },
      {
        resetPassword: (t, p) => resetPassword(config, t, p),
        signIn: (e, p) => signInWithPassword(config, e, p),
        markEmailVerified: (id) => adminMarkEmailVerified(config, admin, id),
        revokeOtherSessions: (c) => revokeOtherSessions(config, c),
        signOut: (c) => signOut(config, c),
      }
    );
    dCookie = r.status === "ok" ? r.cookie : null;
    return { status: r.status, signedIn: !!dCookie };
  });
  await step("link-reuse", async () => resetPassword(config, token, pw("pwD2")));
  await step("invitee-session", async () => {
    const s = await getSession(config, dCookie!);
    return { valid: !!s, emailVerified: s?.user.emailVerified, jwt: claims(s?.jwt ?? null) };
  });

  // Recuperação com revogação: sessão antiga (x) → reset → x não vale mais.
  let xCookie = "";
  await pause();
  await step("second-session", async () => ((xCookie = (await signInWithPassword(config, invitee, pw("pwD"))).cookie), { ok: true }));
  await step("recovery-request", async () => requestPasswordReset(config, invitee, buildNeonPasswordLinkUrl(config.origin, invitee)));
  const rows2 = await sql(`select split_part(identifier,':',2) as t from neon_auth.verification where value=$1 and identifier like 'reset-password:%' order by "createdAt" desc limit 1`, [neonId]);
  await pause();
  await step("recovery-flow", async () => {
    const r = await resetPasswordFlow(
      { token: String(rows2[0]?.t ?? ""), password: pw("pwD3"), email: invitee, continueSession: false },
      {
        resetPassword: (t, p) => resetPassword(config, t, p),
        signIn: (e, p) => signInWithPassword(config, e, p),
        markEmailVerified: (id) => adminMarkEmailVerified(config, admin, id),
        revokeOtherSessions: (c) => revokeOtherSessions(config, c),
        signOut: (c) => signOut(config, c),
      }
    );
    return r;
  });
  await step("old-sessions-after-recovery", async () => ({ x: !!(await getSession(config, xCookie)), d: dCookie ? !!(await getSession(config, dCookie)) : null }));
  await pause();
  await step("old-password", async () => signInWithPassword(config, invitee, pw("pwD")).then(() => "ENTROU"));

  // Login, renovação e logout pelo código do app.
  const recovered = pw("pwD3");
  let lCookie = "";
  await pause();
  await step("login-ok", async () => {
    lCookie = (await signInWithPassword(config, invitee, recovered)).cookie;
    const s = await getSession(config, lCookie);
    return { valid: !!s, jwt: claims(s?.jwt ?? null) };
  });
  await step("renovacao-jwt", async () => {
    const a = await getSession(config, lCookie);
    await pause(2000);
    const b = await getSession(config, lCookie);
    return { sessionStillValid: !!a && !!b, newJwt: !!a?.jwt && !!b?.jwt && a.jwt !== b.jwt, iatAdvanced: (iat(b?.jwt) ?? 0) > (iat(a?.jwt) ?? 0), sameUser: a?.user.id === b?.user.id };
  });
  await step("logout", async () => {
    await signOut(config, lCookie);
    return { sessionAfterLogout: !!(await getSession(config, lCookie)) };
  });
  await pause();
  await step("login-senha-errada", () => signInWithPassword(config, invitee, "Errada-123456").then(() => "ENTROU"));
  await pause();
  await step("login-inexistente", () => signInWithPassword(config, `ninguem-${runId}@educa-teste.example.com`, "Errada-123456").then(() => "ENTROU"));

  // Banimento no Neon: sessão viva cai e o login passa a ser recusado.
  await pause();
  await step("banimento", async () => {
    const { cookie } = await signInWithPassword(config, invitee, recovered);
    const before = !!(await getSession(config, cookie));
    const r = await fetch(`${config.baseUrl}/admin/ban-user`, { method: "POST", headers: { "content-type": "application/json", origin: config.origin, cookie: admin }, body: JSON.stringify({ userId: neonId, banReason: "probe" }) });
    return { sessionBefore: before, banStatus: r.status, sessionAfter: !!(await getSession(config, cookie)) };
  });
  await pause();
  await step("login-banido", () => signInWithPassword(config, invitee, recovered).then(() => "ENTROU"));

  // Identidade com e-mail NÃO confirmado: senha definida direto no Neon (fora do
  // fluxo do app, que confirmaria o e-mail) → token real com emailVerified=false.
  const unverified = `e-${runId}@educa-teste.example.com`;
  let eId = "";
  await step("provision-nao-verificado", async () =>
    provisionIdentity(
      { email: unverified, name: "E nao verificado" },
      {
        ensureShadowLogin: async () => "00000000-0000-4000-8000-000000000000",
        findNeonUser: (e) => adminFindUserByEmail(config, admin, e),
        createNeonUser: async (e, n) => {
          const u = await adminCreateUser(config, admin, { email: e, name: n });
          eId = u.id;
          return u;
        },
        link: async () => undefined,
        sendFirstAccess: (e) => requestPasswordReset(config, e, buildNeonPasswordLinkUrl(config.origin, e, { firstAccess: true, next: "/convite/y" })),
      }
    )
  );
  const rows3 = await sql(`select split_part(identifier,':',2) as t from neon_auth.verification where value=$1 and identifier like 'reset-password:%' order by "createdAt" desc limit 1`, [eId]);
  await step("reset-direto-sem-confirmar", () => resetPassword(config, String(rows3[0]?.t ?? ""), pw("pwE")));
  await pause();
  await step("token-nao-verificado", async () => {
    const { cookie } = await signInWithPassword(config, unverified, pw("pwE"));
    const s = await getSession(config, cookie);
    if (s?.jwt) log("APP_SECRET", { key: "NAO_VERIFICADO", jwt: s.jwt });
    return { valid: !!s, jwt: claims(s?.jwt ?? null) };
  });
  log("APP_END", { runId });
}

// Tokens reais obtidos PELO CÓDIGO DO APP para os 4 usuários (ponte local).
async function tokens(config: NeonAuthConfig) {
  for (const [key, email, name] of [["A1", "a1", "pwA1"], ["A2", "a2", "pwA2"], ["B1", "b1", "pwB1"], ["B2", "b2", "pwB2"]]) {
    await step(`token-${key}`, async () => {
      const { cookie } = await signInWithPassword(config, `${email}@educa-teste.example.com`, pw(name));
      const s = await getSession(config, cookie);
      if (s?.jwt) log("APP_SECRET", { key, jwt: s.jwt });
      return { valid: !!s, jwt: claims(s?.jwt ?? null) };
    });
    await new Promise((r) => setTimeout(r, 6000));
  }
  log("APP_END", { tokensOnly: true });
}

const handler = {
  async fetch(request: Request) {
    if (request.method !== "POST" || !request.headers.get("x-neon-trigger-invocation-id")) return new Response("not found", { status: 404 });
    const plan = JSON.parse(process.env.PROBE_PLAN || "{}") as { runId?: string; notAfter?: string; onlyTokens?: boolean };
    if (!plan.runId || done.has(plan.runId) || (plan.notAfter && Date.now() > Date.parse(plan.notAfter))) return Response.json({ skipped: true });
    done.add(plan.runId);
    await run(plan.runId, plan.onlyTokens === true);
    return Response.json({ ok: true });
  },
};
export default handler;
