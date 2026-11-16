import { createHash, randomUUID } from "node:crypto";
import { importJWK, SignJWT, type JWK } from "jose";

// SSO ATLAS → ORION (§2): launch token ES256 de 60 s, uso único (jti),
// entregue por formulário auto-submetido. Chave privada só no ATLAS:
//   ATLAS_SSO_PRIVATE_JWK           JWK privado (EC P-256) com "kid"
//   ATLAS_SSO_PREVIOUS_PUBLIC_JWKS  {"keys":[…]} — públicas anteriores (rotação)
// Gerar um par: `node scripts/orion-sso-keygen.mjs atlas-sso-AAAA-MM`.

export const SSO_AUDIENCE = "orion-wms";
export const SSO_TTL_SECONDS = 60;

export type PublicJwk = { kty: "EC"; crv: "P-256"; kid: string; use: "sig"; alg: "ES256"; x: string; y: string };

export function parsePrivateJwk(raw: string | undefined): JWK & { kid: string } {
  if (!raw) throw new Error("Defina ATLAS_SSO_PRIVATE_JWK (JWK EC P-256 privado com kid).");
  let jwk: JWK;
  try {
    jwk = JSON.parse(raw) as JWK;
  } catch {
    throw new Error("ATLAS_SSO_PRIVATE_JWK não é um JSON válido.");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y || !jwk.kid) {
    throw new Error("ATLAS_SSO_PRIVATE_JWK deve ser EC P-256 com d, x, y e kid.");
  }
  return jwk as JWK & { kid: string };
}

export function toPublicJwk(jwk: JWK): PublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || !jwk.kid) throw new Error("Chave pública inválida no JWKS.");
  return { kty: "EC", crv: "P-256", kid: jwk.kid, use: "sig", alg: "ES256", x: jwk.x, y: jwk.y };
}

/** JWKS publicado: chave atual + anteriores (rotação, §2.8). */
export function buildJwks(env: { privateJwk?: string; previousJwks?: string } = {
  privateJwk: process.env.ATLAS_SSO_PRIVATE_JWK,
  previousJwks: process.env.ATLAS_SSO_PREVIOUS_PUBLIC_JWKS,
}): { keys: PublicJwk[] } {
  const keys: PublicJwk[] = [];
  if (env.privateJwk) keys.push(toPublicJwk(parsePrivateJwk(env.privateJwk)));
  if (env.previousJwks) {
    const parsed = JSON.parse(env.previousJwks) as { keys?: JWK[] };
    for (const k of parsed.keys ?? []) {
      const pub = toPublicJwk(k);
      if (!keys.some((x) => x.kid === pub.kid)) keys.push(pub);
    }
  }
  return { keys };
}

/** return_to relativo e seguro: começa com "/", sem "//", "\\" nem espaços/controle. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value) return "/";
  if (value.length > 512 || !/^\/(?!\/)[^\\\s]*$/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return "/";
  return value;
}

/** state do fluxo iniciado pelo ORION: base64url, 8 a 256 caracteres. */
export function validState(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[A-Za-z0-9_-]{8,256}$/.test(value) ? value : null;
}

export type AccessGrant = {
  atlas_user_id: string;
  atlas_company_id: string;
  orion_company_id: string;
  email: string;
  name: string;
  orion_role: "admin" | "supervisor" | "operator" | "auditor";
  access_version: number;
  warehouses: string[];
};

export function buildLaunchClaims(input: { issuer: string; grant: AccessGrant; returnTo: string; state?: string | null; now?: number; jti?: string }) {
  const iat = Math.floor((input.now ?? Date.now()) / 1000);
  const claims: Record<string, unknown> = {
    iss: input.issuer,
    aud: SSO_AUDIENCE,
    sub: input.grant.atlas_user_id,
    iat,
    nbf: iat,
    exp: iat + SSO_TTL_SECONDS,
    jti: input.jti ?? randomUUID(),
    atlas_company_id: input.grant.atlas_company_id,
    orion_company_id: input.grant.orion_company_id,
    email: input.grant.email,
    name: input.grant.name,
    orion_role: input.grant.orion_role,
    access_version: input.grant.access_version,
    return_to: safeReturnTo(input.returnTo),
  };
  if (input.grant.warehouses.length > 0) claims.warehouses = input.grant.warehouses;
  if (input.state) claims.state = input.state;
  return claims;
}

export async function signLaunchToken(claims: Record<string, unknown>, privateJwkRaw = process.env.ATLAS_SSO_PRIVATE_JWK): Promise<string> {
  const jwk = parsePrivateJwk(privateJwkRaw);
  const key = await importJWK(jwk, "ES256");
  return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: jwk.kid }).sign(key);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const SUBMIT_SCRIPT = "document.getElementById('f').submit();";

/** Página com formulário auto-submetido (o token nunca vai na URL). */
export function launchPage(orionUrl: string, token: string): { html: string; headers: Record<string, string> } {
  const action = `${orionUrl.replace(/\/+$/, "")}/api/sso/atlas`;
  const origin = new URL(action).origin;
  const scriptHash = createHash("sha256").update(SUBMIT_SCRIPT).digest("base64");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Abrindo o ORION…</title><meta name="referrer" content="no-referrer"></head>
<body><form id="f" method="post" action="${escapeHtml(action)}"><input type="hidden" name="token" value="${escapeHtml(token)}">
<noscript><button type="submit">Continuar para o ORION</button></noscript></form><p>Abrindo o ORION…</p>
<script>${SUBMIT_SCRIPT}</script></body></html>`;
  return {
    html,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${scriptHash}'; form-action ${origin}; base-uri 'none'; frame-ancestors 'none'`,
    },
  };
}

const REASONS: Record<string, string> = {
  module_disabled: "O módulo ORION não está habilitado para a sua empresa.",
  company_suspended: "A empresa está suspensa na plataforma.",
  user_inactive: "O seu cadastro está inativo.",
  access_revoked: "Seu acesso ao ORION não foi liberado pelo administrador da empresa.",
  not_configured: "O login único com o ORION não está configurado nesta instalação.",
};

export function errorPage(reason: string, status = 403): { html: string; status: number; headers: Record<string, string> } {
  const message = REASONS[reason] ?? "Não foi possível abrir o ORION.";
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" },
    html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>ORION indisponível</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1f2937">
<h1 style="font-size:1.25rem">Não foi possível abrir o ORION</h1><p>${escapeHtml(message)}</p><p><a href="/app">Voltar ao ATLAS</a></p></body></html>`,
  };
}
