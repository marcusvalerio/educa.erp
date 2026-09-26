// R1 — o PostgREST de um projeto Supabase aceita o token curto que a ponte
// do Neon Auth emite? Verificação SOMENTE LEITURA, para rodar numa máquina
// confiável por quem já tem o segredo (nada é gravado, nada é impresso).
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_ANON_KEY=<chave publicável/anon> \
//   SUPABASE_JWT_SECRET=<segredo JWT legado do projeto> \
//   node --import tsx scripts/verify-bridge-token.mjs
//
// O que faz (GET em rpc/current_app_user_id, função STABLE: só lê):
//   1. token da ponte (mintDatabaseToken) com `sub` aleatório → 200 e `null`
//      (assinatura aceita; `auth.uid()` não corresponde a ninguém);
//   2. mesmo formato assinado com OUTRO segredo → 401;
//   3. token da ponte já expirado → 401.
// Saída: PASS/FAIL por item; código de saída 1 se algo falhar.
import crypto from "node:crypto";
import { mintDatabaseToken } from "../src/lib/auth/neon-bridge.ts";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Defina ${name}.`);
  return value;
}

const url = new URL(required("SUPABASE_URL"));
if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("SUPABASE_URL precisa ser https.");
const anonKey = required("SUPABASE_ANON_KEY");
const secret = new TextEncoder().encode(required("SUPABASE_JWT_SECRET"));
const endpoint = new URL("/rest/v1/rpc/current_app_user_id", url);

async function call(token) {
  const res = await fetch(endpoint, { headers: { apikey: anonKey, authorization: `Bearer ${token}` } });
  return { status: res.status, body: await res.text() };
}

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : ` — ${detail}`}`);
}

const sub = crypto.randomUUID();
const valid = await call(await mintDatabaseToken({ authUserId: sub, secret }));
check("token da ponte aceito pelo PostgREST (200, sem usuário vinculado)", valid.status === 200 && valid.body.trim() === "null", `HTTP ${valid.status}`);

const other = new TextEncoder().encode(crypto.randomBytes(48).toString("base64url"));
const forged = await call(await mintDatabaseToken({ authUserId: sub, secret: other }));
check("token assinado com outro segredo recusado (401)", forged.status === 401, `HTTP ${forged.status}`);

const expired = await call(await mintDatabaseToken({ authUserId: sub, secret, ttlSeconds: 30, now: Math.floor(Date.now() / 1000) - 600 }));
check("token da ponte expirado recusado (401)", expired.status === 401, `HTTP ${expired.status}`);

console.log(failed ? `${failed} verificação(ões) falharam` : "3/3 verificações passaram");
process.exit(failed ? 1 : 0);
