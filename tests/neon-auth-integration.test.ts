// Integração do Neon Auth ao EDUCA (Plano A, Etapa 2): chave de provedor,
// cliente HTTP do Neon Auth, fluxos de conta, provisionamento de convite e
// invariantes de código. Sem rede: fetch simulado com as respostas REAIS
// observadas no Neon (docs/NEON_AUTH_MIGRATION.md §10).
import { test, describe, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { parseAuthProvider } from "@/lib/auth/provider";
import {
  getSession,
  NeonAuthError,
  requestPasswordReset,
  resetPassword,
  sessionCookieFrom,
  signInWithPassword,
  neonAuthIssuer,
  neonAuthJwksUrl,
  type NeonSession,
  type NeonUser,
} from "@/lib/auth/neon/client";
import { isTrustedAccountRequest, provisionIdentity, resetPasswordFlow, resolveNeonSession, signInFlow, type ProvisionDeps } from "@/lib/auth/neon/flows";
import { buildNeonPasswordLinkUrl, firstAccessNextFrom } from "@/lib/auth/neon/links";
import { bridgeIdentity, IdentityBridgeError, mintDatabaseToken, verifyProviderToken } from "@/lib/auth/neon-bridge";

const BASE = "https://ep-x.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth";
const ORIGIN = neonAuthIssuer(BASE);
const CFG = { baseUrl: BASE, origin: "https://educa.exemplo.com.br" };
const AUTH_USER = "3f0c2a1e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";
const NEON_ID = "8dfaa82e-0164-4996-bee8-162651833e58";

// ------------------------------------------------------------ fetch simulado
type Seen = { url: string; method: string; headers: Record<string, string>; body: unknown };
let seen: Seen[] = [];
const realFetch = globalThis.fetch;
function mockFetch(respond: (s: Seen) => { status: number; body?: unknown; headers?: Record<string, string>; setCookie?: string[] }) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const s: Seen = { url: String(input), method: init?.method ?? "GET", headers, body: init?.body ? JSON.parse(String(init.body)) : null };
    seen.push(s);
    const r = respond(s);
    const h = new Headers(r.headers ?? {});
    for (const c of r.setCookie ?? []) h.append("set-cookie", c);
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status, headers: h });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  seen = [];
});

const realUser = { id: NEON_ID, email: "A1@educa-teste.example.com", emailVerified: true, name: "A1", role: "user", banned: false };
const SESSION_SET = "__Secure-neon-auth.session_token=abc.def; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=None; Partitioned";

describe("AUTH_PROVIDER", () => {
  test("padrão e valores aceitos", () => {
    assert.equal(parseAuthProvider(undefined), "supabase");
    assert.equal(parseAuthProvider(""), "supabase");
    assert.equal(parseAuthProvider(" Neon "), "neon");
    assert.equal(parseAuthProvider("supabase"), "supabase");
  });
  test("valor desconhecido falha fechado (nunca escolhe um provedor por engano)", () => {
    assert.throws(() => parseAuthProvider("neonn"), /AUTH_PROVIDER inválido/);
  });
});

describe("cliente HTTP do Neon Auth (contrato real)", () => {
  test("endereços reais: JWKS em /.well-known/jwks.json, iss = origem", () => {
    assert.equal(neonAuthJwksUrl(BASE + "/"), BASE + "/.well-known/jwks.json");
    assert.equal(ORIGIN, "https://ep-x.neonauth.c-13.us-east-1.aws.neon.tech");
  });
  test("login: guarda só o cookie de sessão; envia Origin do app e IP/UA do navegador", async () => {
    mockFetch(() => ({ status: 200, body: { redirect: false, token: "t", user: realUser }, setCookie: [SESSION_SET] }));
    const r = await signInWithPassword(CFG, "a1@educa-teste.example.com", "x", { forwardedFor: "203.0.113.9", userAgent: "UA" });
    assert.equal(r.cookie, "__Secure-neon-auth.session_token=abc.def");
    assert.equal(r.user.email, "a1@educa-teste.example.com");
    assert.equal(seen[0].url, BASE + "/sign-in/email");
    assert.equal(seen[0].headers.origin, CFG.origin);
    assert.equal(seen[0].headers["x-forwarded-for"], "203.0.113.9");
  });
  test("senha errada / inexistente → INVALID_CREDENTIALS; limite → RATE_LIMITED com espera", async () => {
    mockFetch(() => ({ status: 401, body: { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" } }));
    await assert.rejects(signInWithPassword(CFG, "a@b.co", "x"), (e: unknown) => e instanceof NeonAuthError && e.code === "INVALID_CREDENTIALS");
    mockFetch(() => ({ status: 429, body: { message: "Too many requests." }, headers: { "x-retry-after": "10" } }));
    await assert.rejects(signInWithPassword(CFG, "a@b.co", "x"), (e: unknown) => e instanceof NeonAuthError && e.code === "RATE_LIMITED" && e.retryAfterSeconds === 10);
    mockFetch(() => ({ status: 403, body: { code: "BANNED_USER" } }));
    await assert.rejects(signInWithPassword(CFG, "a@b.co", "x"), (e: unknown) => e instanceof NeonAuthError && e.code === "BANNED");
  });
  test("sessão: JWT do cabeçalho set-auth-jwt; sessão revogada → null; cookie apagado ≠ renovado", async () => {
    mockFetch(() => ({ status: 200, body: { session: { id: "s1", expiresAt: "2026-10-02" }, user: realUser }, headers: { "set-auth-jwt": "h.p.s" } }));
    const s = (await getSession(CFG, "c=1")) as NeonSession;
    assert.equal(s.jwt, "h.p.s");
    assert.equal(s.renewedCookie, null);
    assert.equal(seen[0].headers.cookie, "c=1");
    mockFetch(() => ({ status: 200, body: null }));
    assert.equal(await getSession(CFG, "c=1"), null);
    assert.equal(sessionCookieFrom(["__Secure-neon-auth.session_token=; Max-Age=0; Path=/"]), "");
    assert.equal(sessionCookieFrom(["__Secure-neon-auth.session_data=x; Path=/"]), null);
  });
  test("recuperação não revela nada (200 e 429 iguais); link inválido → INVALID_TOKEN", async () => {
    mockFetch(() => ({ status: 429, body: {} }));
    await requestPasswordReset(CFG, "a@b.co", "https://educa.exemplo.com.br/redefinir-senha");
    mockFetch(() => ({ status: 400, body: { code: "INVALID_TOKEN" } }));
    await assert.rejects(resetPassword(CFG, "t", "Senha1234"), (e: unknown) => e instanceof NeonAuthError && e.code === "INVALID_TOKEN");
  });
  test("serviço fora do ar → UNAVAILABLE (sem detalhe)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await assert.rejects(getSession(CFG, "c=1"), (e: unknown) => e instanceof NeonAuthError && e.code === "UNAVAILABLE");
  });
});

// ------------------------------------------------------------ ponte com token no formato REAL
let key: CryptoKey;
let jwks: JWTVerifyGetKey;
const KID = "7df458d1-4e74-4c7f-a18a-8b77781ea804";
before(async () => {
  const pair = await generateKeyPair("EdDSA", { extractable: true });
  key = pair.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: KID, alg: "EdDSA" }] });
});
async function realShapedToken(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: "A1", email: "a1@educa-teste.example.com", emailVerified: true, role: "authenticated", banned: false, id: NEON_ID, ...over })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setSubject(String(over.sub ?? NEON_ID))
    .setIssuer(ORIGIN)
    .setAudience(ORIGIN)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(key);
}
const DB_SECRET = new TextEncoder().encode("s".repeat(40));
const bridgeDeps = (links: Record<string, string>) => ({
  verify: (t: string) => verifyProviderToken(t, { jwks, issuer: ORIGIN, audience: ORIGIN }),
  resolveLink: async (id: string) => links[id] ?? null,
  mint: (id: string) => mintDatabaseToken({ authUserId: id, secret: DB_SECRET }),
});

describe("ponte com o token real do Neon (EdDSA, iss = aud = origem)", () => {
  test("aceita e devolve o sub verificado do Neon", async () => {
    const r = await bridgeIdentity(await realShapedToken(), bridgeDeps({ [NEON_ID]: AUTH_USER }));
    assert.equal(r.authUserId, AUTH_USER);
    assert.equal(r.externalUserId, NEON_ID);
  });
  test("conta banida no Neon → DISABLED; e-mail não confirmado → EMAIL_NOT_VERIFIED", async () => {
    await assert.rejects(bridgeIdentity(await realShapedToken({ banned: true }), bridgeDeps({ [NEON_ID]: AUTH_USER })), (e: unknown) => e instanceof IdentityBridgeError && e.code === "DISABLED");
    await assert.rejects(bridgeIdentity(await realShapedToken({ emailVerified: false }), bridgeDeps({ [NEON_ID]: AUTH_USER })), (e: unknown) => e instanceof IdentityBridgeError && e.code === "EMAIL_NOT_VERIFIED");
  });
  test("só EdDSA: ES256 válido, com o mesmo kid, é recusado", async () => {
    const ec = await generateKeyPair("ES256", { extractable: true });
    const ecJwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(ec.publicKey)), kid: KID, alg: "ES256" }] });
    const now = Math.floor(Date.now() / 1000);
    const t = await new SignJWT({ email: "a1@educa-teste.example.com", emailVerified: true }).setProtectedHeader({ alg: "ES256", kid: KID }).setSubject(NEON_ID).setIssuer(ORIGIN).setAudience(ORIGIN).setIssuedAt(now).setExpirationTime(now + 900).sign(ec.privateKey);
    await assert.rejects(verifyProviderToken(t, { jwks: ecJwks, issuer: ORIGIN, audience: ORIGIN }), (e: unknown) => e instanceof IdentityBridgeError && e.code === "INVALID_TOKEN");
  });
});

// ------------------------------------------------------------ sessão → identidade
const session = (over: Partial<NeonSession> = {}, user: Partial<NeonUser> = {}): NeonSession => ({
  user: { id: NEON_ID, email: "a1@educa-teste.example.com", emailVerified: true, name: "A1", banned: false, ...user },
  sessionId: "s1",
  expiresAt: "x",
  jwt: "jwt",
  renewedCookie: null,
  ...over,
});
const okBridge = async () => ({ authUserId: AUTH_USER, dbToken: "db", email: "a1@educa-teste.example.com", externalUserId: NEON_ID });

describe("resolução da sessão (servidor)", () => {
  test("sem cookie ou sessão revogada no Neon → sem identidade", async () => {
    assert.deepEqual(await resolveNeonSession(null, { getSession: async () => session(), bridge: okBridge }), { status: "none" });
    assert.deepEqual(await resolveNeonSession("c", { getSession: async () => null, bridge: okBridge }), { status: "none" });
  });
  test("sessão válida → auth_user_id do EDUCA + token do banco", async () => {
    const r = await resolveNeonSession("c", { getSession: async () => session(), bridge: okBridge });
    assert.equal(r.status, "ok");
    assert.equal(r.status === "ok" && r.identity.authUserId, AUTH_USER);
  });
  test("JWT de OUTRO usuário que não o da sessão → recusado", async () => {
    const r = await resolveNeonSession("c", { getSession: async () => session(), bridge: async () => ({ ...(await okBridge()), externalUserId: "outro" }) });
    assert.deepEqual(r, { status: "denied", reason: "SUBJECT_MISMATCH" });
  });
  test("banido, sem JWT, sem vínculo → recusado", async () => {
    assert.deepEqual(await resolveNeonSession("c", { getSession: async () => session({}, { banned: true }), bridge: okBridge }), { status: "denied", reason: "DISABLED" });
    assert.deepEqual(await resolveNeonSession("c", { getSession: async () => session({ jwt: null }), bridge: okBridge }), { status: "denied", reason: "NO_JWT" });
    const unlinked = async () => {
      throw new IdentityBridgeError("UNLINKED", "x");
    };
    assert.deepEqual(await resolveNeonSession("c", { getSession: async () => session(), bridge: unlinked }), { status: "denied", reason: "UNLINKED" });
  });
});

describe("rotas de conta: só o próprio app (login CSRF)", () => {
  const APP = "https://educa.example.com";
  const req = (contentType: string | null, origin: string | null, secFetchSite: string | null = null) => ({ contentType, origin, secFetchSite });

  test("aceita o fetch JSON do próprio app", () => {
    assert.equal(isTrustedAccountRequest(req("application/json", APP, "same-origin"), [APP]), true);
    assert.equal(isTrustedAccountRequest(req("application/json; charset=utf-8", APP), [APP]), true);
    assert.equal(isTrustedAccountRequest(req("application/json", null), [APP]), true);
  });

  test("recusa formulário de outro site com corpo em forma de JSON (text/plain)", () => {
    assert.equal(isTrustedAccountRequest(req("text/plain", "https://evil.example", "cross-site"), [APP]), false);
    assert.equal(isTrustedAccountRequest(req("application/x-www-form-urlencoded", APP), [APP]), false);
    assert.equal(isTrustedAccountRequest(req(null, APP), [APP]), false);
  });

  test("recusa JSON vindo de outra origem ou marcado como cross-site", () => {
    assert.equal(isTrustedAccountRequest(req("application/json", "https://evil.example"), [APP]), false);
    assert.equal(isTrustedAccountRequest(req("application/json", "null"), [APP]), false);
    assert.equal(isTrustedAccountRequest(req("application/json", null, "cross-site"), [APP]), false);
    assert.equal(isTrustedAccountRequest(req("application/json", null, "same-site"), [APP]), false);
  });
});

describe("login", () => {
  test("identidade que não chega ao EDUCA: sessão do Neon é encerrada, nada de cookie", async () => {
    const calls: string[] = [];
    const r = await signInFlow("a@b.co", "x", {
      signIn: async () => ({ cookie: "c", user: realUser as NeonUser }),
      resolve: async () => ({ status: "denied", reason: "UNLINKED" }),
      signOut: async (c) => void calls.push(`out:${c}`),
    });
    assert.deepEqual(r, { status: "not_allowed" });
    assert.deepEqual(calls, ["out:c"]);
  });
});

describe("nova senha pelo link (primeiro acesso / recuperação)", () => {
  function deps(verified: boolean, calls: string[], signInFails = false) {
    return {
      resetPassword: async () => void calls.push("reset"),
      signIn: async () => {
        calls.push("signin");
        if (signInFails) throw new Error("x");
        return { cookie: "novo", user: { id: NEON_ID, email: "a1@x.co", emailVerified: verified, name: null, banned: false } };
      },
      markEmailVerified: async (id: string) => void calls.push(`verify:${id}`),
      revokeOtherSessions: async (c: string) => void calls.push(`revoke-others:${c}`),
      signOut: async (c: string) => void calls.push(`out:${c}`),
    };
  }
  test("primeiro acesso: troca → entra → confirma e-mail → revoga as outras sessões → segue logado", async () => {
    const calls: string[] = [];
    const r = await resetPasswordFlow({ token: "t", password: "Senha1234", email: "a1@x.co", continueSession: true }, deps(false, calls));
    assert.deepEqual(r, { status: "ok", cookie: "novo" });
    assert.deepEqual(calls, ["reset", "signin", `verify:${NEON_ID}`, "revoke-others:novo"]);
  });
  test("recuperação: revoga as outras e encerra a própria (volta ao login); e-mail já confirmado não é tocado", async () => {
    const calls: string[] = [];
    const r = await resetPasswordFlow({ token: "t", password: "Senha1234", email: "a1@x.co", continueSession: false }, deps(true, calls));
    assert.deepEqual(r, { status: "ok", cookie: null });
    assert.deepEqual(calls, ["reset", "signin", "revoke-others:novo", "out:novo"]);
  });
  test("link inválido: nada além da tentativa de troca", async () => {
    const calls: string[] = [];
    const d = { ...deps(false, calls), resetPassword: async () => { calls.push("reset"); throw new NeonAuthError("INVALID_TOKEN", 400, "x"); } };
    await assert.rejects(resetPasswordFlow({ token: "t", password: "Senha1234", email: "a1@x.co", continueSession: true }, d), (e: unknown) => e instanceof NeonAuthError && e.code === "INVALID_TOKEN");
    assert.deepEqual(calls, ["reset"]);
  });
  test("e-mail da URL que não é o dono do token: senha trocada, mas nada é confirmado nem aberto", async () => {
    const calls: string[] = [];
    const r = await resetPasswordFlow({ token: "t", password: "Senha1234", email: "outra@x.co", continueSession: true }, deps(false, calls, true));
    assert.deepEqual(r, { status: "signin_failed" });
    assert.deepEqual(calls, ["reset", "signin"]);
  });
});

describe("convite: identidade no Neon + login sombra + vínculo", () => {
  function provisionDeps(state: { neon: NeonUser | null; createFails?: boolean }, calls: string[]): ProvisionDeps {
    return {
      ensureShadowLogin: async (e) => (calls.push(`shadow:${e}`), AUTH_USER),
      findNeonUser: async (e) => (calls.push(`find:${e}`), state.neon),
      createNeonUser: async (e, n) => {
        calls.push(`create:${e}:${n}`);
        if (state.createFails) {
          state.neon = { id: NEON_ID, email: e, emailVerified: false, name: n, banned: false };
          throw new NeonAuthError("USER_EXISTS", 409, "x");
        }
        return { id: NEON_ID, email: e, emailVerified: false, name: n, banned: false };
      },
      link: async (id, e, a) => void calls.push(`link:${id}:${e}:${a}`),
      sendFirstAccess: async (e) => void calls.push(`first-access:${e}`),
    };
  }
  test("novo convidado: login sombra, identidade sem senha, vínculo, link de primeiro acesso", async () => {
    const calls: string[] = [];
    const r = await provisionIdentity({ email: " Novo@X.co ", name: "Novo" }, provisionDeps({ neon: null }, calls));
    assert.deepEqual(r, { delivered: true, authUserId: AUTH_USER });
    assert.deepEqual(calls, ["shadow:novo@x.co", "find:novo@x.co", "create:novo@x.co:Novo", `link:${NEON_ID}:novo@x.co:${AUTH_USER}`, "first-access:novo@x.co"]);
  });
  test("quem já criou a senha (e-mail confirmado): sem novo link, conta existente", async () => {
    const calls: string[] = [];
    const r = await provisionIdentity({ email: "a@x.co", name: "A" }, provisionDeps({ neon: { id: NEON_ID, email: "a@x.co", emailVerified: true, name: "A", banned: false } }, calls));
    assert.equal(r.delivered, false);
    assert.ok(!calls.some((c) => c.startsWith("first-access") || c.startsWith("create")));
  });
  test("convidado que ainda não criou a senha: reenvia o primeiro acesso", async () => {
    const calls: string[] = [];
    const r = await provisionIdentity({ email: "a@x.co", name: "A" }, provisionDeps({ neon: { id: NEON_ID, email: "a@x.co", emailVerified: false, name: "A", banned: false } }, calls));
    assert.equal(r.delivered, true);
    assert.ok(calls.includes("first-access:a@x.co"));
  });
  test("corrida entre dois convites: reaproveita a identidade criada pelo outro", async () => {
    const calls: string[] = [];
    const r = await provisionIdentity({ email: "a@x.co", name: "A" }, provisionDeps({ neon: null, createFails: true }, calls));
    assert.equal(r.delivered, true);
  });
});

describe("links de senha do Neon", () => {
  test("montados no servidor, para /redefinir-senha do próprio app", () => {
    const u = new URL(buildNeonPasswordLinkUrl("https://educa.exemplo.com.br/x", " A@B.co ", { firstAccess: true, next: "/convite/abc" }));
    assert.equal(u.origin + u.pathname, "https://educa.exemplo.com.br/redefinir-senha");
    assert.equal(u.searchParams.get("e"), "a@b.co");
    assert.equal(u.searchParams.get("primeiro-acesso"), "1");
    assert.equal(u.searchParams.get("next"), "/convite/abc");
  });
  test("destino depois do primeiro acesso é sempre interno", () => {
    assert.equal(firstAccessNextFrom("https://educa.exemplo.com.br/convite/abc"), "/convite/abc");
    assert.equal(firstAccessNextFrom("https://educa.exemplo.com.br/redefinir-senha?primeiro-acesso=1&next=%2Fadmincentral"), "/admincentral");
    assert.equal(firstAccessNextFrom("https://educa.exemplo.com.br/redefinir-senha?next=https%3A%2F%2Fevil.example"), "/");
    assert.equal(new URL(buildNeonPasswordLinkUrl("https://a.co", "a@b.co", { next: "//evil.example" })).searchParams.get("next"), "/");
  });
});

// ------------------------------------------------------------ invariantes
describe("invariantes da integração no código", () => {
  const root = path.join(process.cwd(), "src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = path.join(dir, n);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(n) ? [full] : [];
    });
  const all = files(root).map((f) => ({ file: path.relative(process.cwd(), f).split(path.sep).join("/"), text: readFileSync(f, "utf8") }));

  test("navegador não importa servidor do Neon, ponte, provisionamento nem sessão", () => {
    const offenders = all
      .filter(({ text }) => /^["']use client["']/m.test(text) && /from\s+["'][^"']*auth\/(neon\/(server|client|request|handlers|flows)|neon-bridge|provisioning|session)["']/.test(text))
      .map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("a escolha do provedor fica na camada de autenticação (sem if espalhado)", () => {
    const allowed = /^src\/(lib\/auth\/|proxy\.ts$|lib\/supabase\/server\.ts$|app\/auth\/callback\/route\.ts$)/;
    const code = (t: string) => t.replace(/\/\/.*$/gm, "");
    const offenders = all.filter(({ file, text }) => /authProvider\(|isNeonAuth\(|env\.(NEXT_PUBLIC_)?AUTH_PROVIDER/.test(code(text)) && !allowed.test(file)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("segredos do Neon e do banco só em módulos de servidor", () => {
    const offenders = all
      .filter(({ text }) => /NEON_AUTH_SERVICE_PASSWORD|SUPABASE_JWT_SECRET/.test(text))
      .filter(({ text }) => !/^import "server-only";/m.test(text))
      .map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("o cookie de sessão do Neon é HttpOnly e nunca lido por código de navegador", () => {
    const session = readFileSync(path.join(root, "lib/auth/session.ts"), "utf8");
    assert.match(session, /httpOnly: true/);
    const offenders = all.filter(({ text }) => /^["']use client["']/m.test(text) && /educa_session|SESSION_COOKIE/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("identidade nunca vem do corpo: as rotas Neon não aceitam auth_user_id nem ids do Neon", () => {
    const text = readFileSync(path.join(root, "lib/auth/neon/handlers.ts"), "utf8");
    assert.doesNotMatch(text, /auth_?user_?id|neonUserId|userId\s*:\s*input/i);
  });
  test("vínculo e login sombra só no servidor e só pelas funções da 0073 / API admin", () => {
    const offenders = all.filter(({ text }) => /\.rpc\(\s*["']fn_(link_identity|resolve_identity_link)["']/.test(text) && !/^import "server-only";/m.test(text)).map((f) => f.file);
    const browser = all.filter(({ text }) => /^["']use client["']/m.test(text) && /auth_identity_links|fn_link_identity|auth\.admin\./.test(text)).map((f) => f.file);
    assert.deepEqual(browser, []);
    assert.deepEqual(offenders, []);
  });
});
