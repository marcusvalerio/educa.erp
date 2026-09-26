import "server-only";

import { createHash } from "node:crypto";
import { createRemoteJWKSet } from "jose";
import { createAdminClient } from "@/lib/supabase/admin";
import { bridgeIdentity, mintDatabaseToken, verifyProviderToken, type BridgeResult } from "@/lib/auth/neon-bridge";
import { resolveNeonSession, type NeonResolution } from "./flows";
import {
  getSession,
  neonAuthIssuer,
  neonAuthJwksUrl,
  NeonAuthError,
  signInWithPassword,
  type ClientHints,
  type NeonAuthConfig,
} from "./client";

export type { NeonIdentity, NeonResolution } from "./flows";

// Neon Auth no servidor do EDUCA (AUTH_PROVIDER=neon).
//
//   navegador ─cookie HttpOnly do EDUCA─▶ servidor ─cookie de sessão─▶ Neon Auth
//        /get-session (sessão viva? revogada = null) + JWT EdDSA
//   ─▶ ponte: assinatura (JWKS), iss/aud, exp/iat, emailVerified, banned,
//      sub do JWT = usuário da sessão, vínculo 0073 → auth_user_id
//   ─▶ token curto do banco (sub = auth_user_id) ─▶ PostgREST ─▶ RLS
//
// A sessão é conferida no Neon a cada resolução: logout, troca de senha,
// revogação e banimento derrubam o acesso (a validade de 15 min do JWT
// não abre janela). Cache curto por processo (IDENTITY_CACHE_MS) só para
// não repetir a consulta várias vezes na mesma navegação.

export const SESSION_COOKIE = "educa_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // igual à sessão do Neon Auth
const IDENTITY_CACHE_MS = 10_000;
const DB_TOKEN_TTL_SECONDS = 300;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} não definida (AUTH_PROVIDER=neon).`);
  return value;
}

/** Origem do app enviada ao Neon Auth (precisa estar entre as origens confiáveis dele). */
export function appOrigin(requestOrigin?: string | null): string {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // cai na origem da requisição
    }
  }
  if (requestOrigin) return new URL(requestOrigin).origin;
  throw new Error("APP_URL não definida (AUTH_PROVIDER=neon).");
}

export function neonConfig(requestOrigin?: string | null): NeonAuthConfig {
  const baseUrl = required("NEON_AUTH_BASE_URL").replace(/\/+$/, "");
  if (!/^https:\/\//.test(baseUrl) && process.env.NODE_ENV === "production" && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(baseUrl)) {
    throw new Error("NEON_AUTH_BASE_URL precisa ser https.");
  }
  return { baseUrl, origin: appOrigin(requestOrigin) };
}

// ------------------------------------------------------------ ponte

let jwks: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;
function remoteJwks(baseUrl: string) {
  const url = neonAuthJwksUrl(baseUrl);
  if (!jwks || jwks.url !== url) jwks = { url, set: createRemoteJWKSet(new URL(url), { cacheMaxAge: 10 * 60_000, cooldownDuration: 30_000 }) };
  return jwks.set;
}

function databaseSecret(): Uint8Array {
  // Segredo com que o PostgREST do projeto Supabase valida JWT HS256 (o
  // mesmo que assina os tokens do Supabase Auth). Só servidor.
  return new TextEncoder().encode(required("SUPABASE_JWT_SECRET"));
}

async function resolveLink(externalUserId: string): Promise<string | null> {
  // Único uso de service_role na ponte: ler o vínculo pela função restrita
  // da 0073 (a tabela não é legível por anon/authenticated).
  const { data, error } = await createAdminClient().rpc("fn_resolve_identity_link", { p_provider: "neon", p_external_user_id: externalUserId });
  if (error) throw new Error("Falha ao consultar o vínculo de identidade.");
  return typeof data === "string" ? data : null;
}

export function bridgeFor(config: NeonAuthConfig) {
  const issuer = neonAuthIssuer(config.baseUrl);
  return (token: string): Promise<BridgeResult> =>
    bridgeIdentity(token, {
      verify: (t) => verifyProviderToken(t, { jwks: remoteJwks(config.baseUrl), issuer, audience: issuer }),
      resolveLink,
      mint: (authUserId) => mintDatabaseToken({ authUserId, secret: databaseSecret(), ttlSeconds: DB_TOKEN_TTL_SECONDS }),
    });
}

// ------------------------------------------------------------ sessão → identidade
// (regra pura em ./flows.ts: resolveNeonSession)

const cache = new Map<string, { at: number; value: NeonResolution }>();
const cacheKey = (cookie: string) => createHash("sha256").update(cookie).digest("base64url");

export function forgetNeonSession(cookie: string | null | undefined) {
  if (cookie) cache.delete(cacheKey(cookie));
}

/** Resolução com cache curto (só resultados "ok"; recusas e ausência não são guardadas). */
export async function resolveNeonSessionCached(cookie: string | null | undefined, hints?: ClientHints, requestOrigin?: string | null): Promise<NeonResolution> {
  if (!cookie) return { status: "none" };
  const key = cacheKey(cookie);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < IDENTITY_CACHE_MS) return hit.value;
  const config = neonConfig(requestOrigin);
  let value: NeonResolution;
  try {
    value = await resolveNeonSession(cookie, { getSession: (c) => getSession(config, c, hints), bridge: bridgeFor(config) });
  } catch (error) {
    // Serviço fora do ar: sem identidade (falha fechada), sem vazar detalhe.
    if (error instanceof NeonAuthError) return { status: "none" };
    throw error;
  }
  if (value.status === "ok") {
    if (cache.size > 1000) cache.clear();
    cache.set(key, { at: Date.now(), value });
  } else {
    cache.delete(key);
  }
  return value;
}

// ------------------------------------------------------------ conta de serviço (admin do Neon Auth)
// Usada pelo servidor para: criar a identidade de quem foi convidado,
// confirmar o e-mail depois do primeiro acesso e revogar sessões depois
// de uma troca de senha. Credenciais só no servidor.

let serviceCookie: string | null = null;

export async function withServiceSession<T>(config: NeonAuthConfig, run: (adminCookie: string) => Promise<T>): Promise<T> {
  const login = async () => {
    const { cookie } = await signInWithPassword(config, required("NEON_AUTH_SERVICE_EMAIL"), required("NEON_AUTH_SERVICE_PASSWORD"));
    serviceCookie = cookie;
    return cookie;
  };
  const cookie = serviceCookie ?? (await login());
  try {
    return await run(cookie);
  } catch (error) {
    if (error instanceof NeonAuthError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      // Sessão de serviço expirada/revogada: um novo login, uma nova tentativa.
      return run(await login());
    }
    throw error;
  }
}
