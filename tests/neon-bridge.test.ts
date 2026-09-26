// Ponte de identidade Neon Auth → Postgres (Plano A). Chaves geradas no
// próprio teste: nenhum serviço externo, nenhum segredo real.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SignJWT, createLocalJWKSet, decodeJwt, decodeProtectedHeader, exportJWK, generateKeyPair, jwtVerify, type JWTVerifyGetKey } from "jose";
import {
  DB_TOKEN_MAX_TTL_SECONDS,
  IdentityBridgeError,
  bridgeIdentity,
  mintDatabaseToken,
  verifyProviderToken,
} from "@/lib/auth/neon-bridge";

const ISSUER = "https://auth.exemplo.test";
const AUDIENCE = "educa-erp";
const AUTH_USER = "3f0c2a1e-9b7d-4c1a-8e2f-0a1b2c3d4e5f";
const DB_SECRET = new TextEncoder().encode("s".repeat(40));

let providerKey: CryptoKey;
let jwks: JWTVerifyGetKey;
const KID = "chave-1";

before(async () => {
  const pair = await generateKeyPair("EdDSA", { extractable: true });
  providerKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "EdDSA" };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

async function providerToken(over: { sub?: string; email?: string; emailVerified?: boolean; iss?: string; aud?: string; exp?: number; iat?: number; key?: CryptoKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = new SignJWT({ email: over.email ?? "a1@empresa-a.test", emailVerified: over.emailVerified ?? true })
    .setProtectedHeader({ alg: "EdDSA", kid: KID })
    .setIssuer(over.iss ?? ISSUER)
    .setAudience(over.aud ?? AUDIENCE)
    .setIssuedAt(over.iat ?? now)
    .setExpirationTime(over.exp ?? now + 300);
  if (over.sub !== "") jwt.setSubject(over.sub ?? "neon-user-a1");
  return jwt.sign(over.key ?? providerKey);
}
const cfg = () => ({ jwks, issuer: ISSUER, audience: AUDIENCE });
async function rejects(p: Promise<unknown>, code: IdentityBridgeError["code"]) {
  await assert.rejects(p, (e: unknown) => e instanceof IdentityBridgeError && e.code === code);
}

describe("verificação do token do provedor (Neon Auth)", () => {
  test("token válido → identidade do provedor", async () => {
    const id = await verifyProviderToken(await providerToken(), cfg());
    assert.deepEqual(id, { externalUserId: "neon-user-a1", email: "a1@empresa-a.test", emailVerified: true, banned: false });
  });
  test("assinado por outra chave (mesmo kid) → recusado", async () => {
    const other = await generateKeyPair("EdDSA");
    await rejects(verifyProviderToken(await providerToken({ key: other.privateKey }), cfg()), "INVALID_TOKEN");
  });
  test("emissor ou audiência diferentes → recusado", async () => {
    await rejects(verifyProviderToken(await providerToken({ iss: "https://outro.test" }), cfg()), "INVALID_TOKEN");
    await rejects(verifyProviderToken(await providerToken({ aud: "outro-app" }), cfg()), "INVALID_TOKEN");
  });
  test("expirado → recusado", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    await rejects(verifyProviderToken(await providerToken({ iat: past, exp: past + 60 }), cfg()), "INVALID_TOKEN");
  });
  test("payload adulterado, alg=none e HS256 → recusados", async () => {
    const good = await providerToken();
    const [h, p, s] = good.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ ...decodeJwt(good), sub: "neon-user-b1" })).toString("base64url");
    await rejects(verifyProviderToken([h, forgedPayload, s].join("."), cfg()), "INVALID_TOKEN");
    const none = [Buffer.from('{"alg":"none"}').toString("base64url"), p, ""].join(".");
    await rejects(verifyProviderToken(none, cfg()), "INVALID_TOKEN");
    const hs = await new SignJWT({ email: "a1@empresa-a.test", emailVerified: true }).setProtectedHeader({ alg: "HS256", kid: KID })
      .setSubject("neon-user-a1").setIssuer(ISSUER).setAudience(AUDIENCE).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("k".repeat(40)));
    await rejects(verifyProviderToken(hs, cfg()), "INVALID_TOKEN");
  });
  test("sem sub ou sem e-mail → recusado; vazio → recusado", async () => {
    await rejects(verifyProviderToken(await providerToken({ sub: "" }), cfg()), "INVALID_TOKEN");
    await rejects(verifyProviderToken(await providerToken({ email: "" }), cfg()), "INVALID_TOKEN");
    await rejects(verifyProviderToken("", cfg()), "INVALID_TOKEN");
  });
});

describe("token do banco (PostgREST)", () => {
  test("sub = auth_user_id, role/aud authenticated, HS256, validade curta", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await mintDatabaseToken({ authUserId: AUTH_USER, secret: DB_SECRET, ttlSeconds: 300, now });
    const { payload } = await jwtVerify(token, DB_SECRET, { audience: "authenticated" });
    assert.equal(payload.sub, AUTH_USER);
    assert.equal(payload.role, "authenticated");
    assert.equal((payload.exp ?? 0) - (payload.iat ?? 0), 300);
    assert.equal(decodeProtectedHeader(token).alg, "HS256");
  });
  test("validade limitada a 30..600 s", async () => {
    const now = Math.floor(Date.now() / 1000);
    const long = decodeJwt(await mintDatabaseToken({ authUserId: AUTH_USER, secret: DB_SECRET, ttlSeconds: 86400, now }));
    const short = decodeJwt(await mintDatabaseToken({ authUserId: AUTH_USER, secret: DB_SECRET, ttlSeconds: 1, now }));
    assert.equal((long.exp ?? 0) - now, DB_TOKEN_MAX_TTL_SECONDS);
    assert.equal((short.exp ?? 0) - now, 30);
  });
  test("recusa auth_user_id que não é UUID e segredo curto", async () => {
    await rejects(mintDatabaseToken({ authUserId: "neon-user-a1", secret: DB_SECRET }), "INVALID_LINK");
    await assert.rejects(mintDatabaseToken({ authUserId: AUTH_USER, secret: new TextEncoder().encode("curto") }));
  });
});

describe("ponte completa", () => {
  const deps = (links: Record<string, string>, calls: string[] = []) => ({
    verify: (t: string) => verifyProviderToken(t, cfg()),
    resolveLink: async (externalUserId: string) => {
      calls.push(externalUserId);
      return links[externalUserId] ?? null;
    },
    mint: (authUserId: string) => mintDatabaseToken({ authUserId, secret: DB_SECRET }),
  });

  test("identidade verificada e vinculada → token do banco daquele login", async () => {
    const calls: string[] = [];
    const r = await bridgeIdentity(await providerToken(), deps({ "neon-user-a1": AUTH_USER }, calls));
    assert.equal(r.authUserId, AUTH_USER);
    assert.equal(decodeJwt(r.dbToken).sub, AUTH_USER);
    assert.deepEqual(calls, ["neon-user-a1"], "o vínculo é buscado só pelo sub VERIFICADO");
  });
  test("e-mail não confirmado → recusado antes de consultar o vínculo", async () => {
    const calls: string[] = [];
    await rejects(bridgeIdentity(await providerToken({ emailVerified: false }), deps({ "neon-user-a1": AUTH_USER }, calls)), "EMAIL_NOT_VERIFIED");
    assert.deepEqual(calls, []);
  });
  test("sem vínculo → UNLINKED; vínculo corrompido → INVALID_LINK", async () => {
    await rejects(bridgeIdentity(await providerToken(), deps({})), "UNLINKED");
    await rejects(bridgeIdentity(await providerToken(), deps({ "neon-user-a1": "nao-e-uuid" })), "INVALID_LINK");
  });
  test("token inválido nunca chega a emitir token do banco", async () => {
    let minted = false;
    const d = { ...deps({ "neon-user-a1": AUTH_USER }), mint: async () => { minted = true; return "x"; } };
    const other = await generateKeyPair("EdDSA");
    await rejects(bridgeIdentity(await providerToken({ key: other.privateKey }), d), "INVALID_TOKEN");
    assert.equal(minted, false);
  });
});

describe("invariantes do Plano A no código", () => {
  const root = path.join(process.cwd(), "src");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const full = path.join(dir, n);
      return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(n) ? [full] : [];
    });
  const all = files(root).map((f) => ({ file: path.relative(process.cwd(), f), text: readFileSync(f, "utf8") }));

  test("a ponte não é importada por módulo de navegador", () => {
    const offenders = all.filter(({ text }) => /^["']use client["']/m.test(text) && /neon-bridge/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("nenhum segredo de assinatura exposto como NEXT_PUBLIC_", () => {
    const offenders = all.filter(({ text }) => /NEXT_PUBLIC_[A-Z0-9_]*(JWT|SECRET|SIGNING)/.test(text)).map((f) => f.file);
    assert.deepEqual(offenders, []);
  });
  test("0073 não dá leitura/escrita do vínculo a anon/authenticated", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/0073_external_identity_links.sql"), "utf8");
    assert.match(sql, /enable row level security/);
    assert.match(sql, /revoke all on public\.auth_identity_links from public, anon, authenticated/);
    assert.doesNotMatch(sql, /grant [^;]* to (anon|authenticated)/i);
    assert.doesNotMatch(sql, /create policy/i);
  });
});
