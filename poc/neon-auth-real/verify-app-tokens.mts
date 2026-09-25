// Tokens reais obtidos PELO CÓDIGO DO APP (neon/client.ts no Neon real) → ponte ATUAL (com a verificação endurecida).
import fs from "node:fs";
import { createLocalJWKSet, decodeJwt } from "jose";
import { bridgeIdentity, mintDatabaseToken, verifyProviderToken } from "../../src/lib/auth/neon-bridge.ts";
const T = JSON.parse(fs.readFileSync(process.env.NEON_REAL_TOKENS!, "utf8"));
const O = process.env.NEON_REAL_ORIGIN!;
const cfg = { jwks: createLocalJWKSet(JSON.parse(fs.readFileSync(process.env.NEON_REAL_JWKS!, "utf8"))), issuer: O, audience: O };
const links: Record<string, string> = {};
for (const k of Object.keys(T)) links[decodeJwt(T[k]).sub as string] = crypto.randomUUID();
for (const k of Object.keys(T)) {
  const c = decodeJwt(T[k]);
  const r = await bridgeIdentity(T[k], { verify: (t) => verifyProviderToken(t, cfg), resolveLink: async (id) => links[id] ?? null, mint: (id) => mintDatabaseToken({ authUserId: id, secret: new TextEncoder().encode("s".repeat(40)) }) }).catch((e) => e);
  console.log(`${r.authUserId && r.externalUserId === c.sub ? "PASS" : "FAIL"}  ${k}: token real (via código do app) verificado no JWKS real e ponte → auth_user_id; exp ${new Date((c.exp as number) * 1000).toISOString()}`);
}
