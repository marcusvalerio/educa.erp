#!/usr/bin/env node
// Harness de QA (NÃO é usado em produção): servidor local que fala o mesmo
// protocolo do Neon Auth (Managed Better Auth) consumido por
// src/lib/auth/neon/client.ts — /sign-in/email, /get-session (com o JWT
// EdDSA em set-auth-jwt), /sign-out e /.well-known/jwks.json. Permite rodar o
// ATLAS com AUTH_PROVIDER=neon + DATA_BACKEND=postgres sem rede externa.
// O código do ATLAS não muda: só NEON_AUTH_BASE_URL aponta para cá.
//
// Uso: node neon-auth-stub.mjs <porta> <usuarios.json>
//   usuarios.json = [{ "id": "neon-...", "email": "...", "password": "...", "name": "..." }]
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const port = Number(process.argv[2] ?? 4010);
const users = JSON.parse(readFileSync(process.argv[3], "utf8"));
const BASE = "/neondb/auth";
const ORIGIN = `http://127.0.0.1:${port}`;
const COOKIE = "__Secure-neon-auth.session_token";
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
const jwk = { ...(await exportJWK(publicKey)), kid: "stub-ed25519", alg: "EdDSA", use: "sig" };
const sessions = new Map(); // token -> { userId, expiresAt }

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};
const cookieOf = (req) => {
  const m = /(?:^|;\s*)([^=;]+\.session_token)=([^;]+)/.exec(req.headers.cookie ?? "");
  return m ? m[2] : null;
};
const userJson = (u) => ({ id: u.id, email: u.email, emailVerified: true, name: u.name, banned: false });

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    const url = new URL(req.url ?? "/", ORIGIN);
    const path = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
    const body = raw ? JSON.parse(raw) : {};
    if (path === "/.well-known/jwks.json") return json(res, 200, { keys: [jwk] });
    if (path === "/sign-in/email" && req.method === "POST") {
      const u = users.find((x) => x.email.toLowerCase() === String(body.email ?? "").toLowerCase() && x.password === body.password);
      if (!u) return json(res, 401, { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" });
      const token = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();
      sessions.set(token, { userId: u.id, expiresAt });
      return json(res, 200, { redirect: false, token, user: userJson(u) }, { "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (path === "/get-session") {
      const s = sessions.get(cookieOf(req) ?? "");
      const u = s && users.find((x) => x.id === s.userId);
      if (!u) return json(res, 401, null);
      const jwt = await new SignJWT({ email: u.email, emailVerified: true, name: u.name, banned: false })
        .setProtectedHeader({ alg: "EdDSA", kid: jwk.kid })
        .setSubject(u.id).setIssuer(ORIGIN).setAudience(ORIGIN).setIssuedAt().setExpirationTime("15m")
        .sign(privateKey);
      return json(res, 200, { user: userJson(u), session: { id: `s-${cookieOf(req).slice(0, 8)}`, expiresAt: s.expiresAt } }, { "set-auth-jwt": jwt });
    }
    if (path === "/sign-out") {
      sessions.delete(cookieOf(req) ?? "");
      return json(res, 200, { success: true });
    }
    if (path === "/revoke-other-sessions") return json(res, 200, { status: true });
    return json(res, 404, { code: "NOT_FOUND", message: path });
  });
}).listen(port, "127.0.0.1", () => console.log(`neon-auth-stub em ${ORIGIN}${BASE}`));
