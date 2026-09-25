import { SignJWT, jwtVerify, type JWTVerifyGetKey } from "jose";

// Ponte de identidade Neon Auth → Postgres do Supabase (Plano A).
//
// O banco do EDUCA reconhece o usuário por auth.uid(), que o PostgREST
// preenche a partir do `sub` de um JWT que ele mesmo valida. Toda a RLS
// (328 policies) e o RBAC (has_permission, current_app_user_id…) partem
// daí. Esta ponte preserva esse contrato sem tocar em nenhuma policy:
//
//   1. o token do Neon Auth é VERIFICADO no servidor (assinatura pelo
//      JWKS do provedor, emissor, audiência, validade, algoritmo);
//   2. o `sub` verificado é traduzido para o auth_user_id do EDUCA por um
//      vínculo mantido no banco (auth_identity_links, 0073) — nunca por
//      valor vindo do navegador;
//   3. o servidor emite um token CURTO para o PostgREST com
//      sub = auth_user_id e role = authenticated; a RLS segue igual.
//
// Módulo puro (sem Next, sem rede própria): as dependências entram por
// parâmetro para que os testes cubram cada recusa. Só deve ser importado
// por código de servidor — o segredo de assinatura nunca vai ao navegador.

export const DB_TOKEN_MAX_TTL_SECONDS = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Algoritmos assimétricos aceitos para o token do provedor. HS* e "none"
// ficam de fora: um segredo compartilhado permitiria forjar identidade.
const PROVIDER_ALGORITHMS = ["EdDSA", "ES256", "RS256", "PS256"];

export type ProviderIdentity = {
  externalUserId: string;
  email: string;
  emailVerified: boolean;
};

export class IdentityBridgeError extends Error {
  constructor(
    readonly code: "INVALID_TOKEN" | "UNLINKED" | "EMAIL_NOT_VERIFIED" | "INVALID_LINK",
    message: string
  ) {
    super(message);
    this.name = "IdentityBridgeError";
  }
}

export type ProviderTokenConfig = { jwks: JWTVerifyGetKey; issuer: string; audience: string };

/** Verifica o token do Neon Auth e devolve a identidade do provedor. */
export async function verifyProviderToken(token: string, config: ProviderTokenConfig): Promise<ProviderIdentity> {
  if (!token || typeof token !== "string") throw new IdentityBridgeError("INVALID_TOKEN", "Token ausente.");
  let payload;
  try {
    ({ payload } = await jwtVerify(token, config.jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: PROVIDER_ALGORITHMS,
      requiredClaims: ["sub", "exp", "iat"],
    }));
  } catch {
    throw new IdentityBridgeError("INVALID_TOKEN", "Token de identidade inválido ou expirado.");
  }
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!sub || !email) throw new IdentityBridgeError("INVALID_TOKEN", "Token sem identidade.");
  return { externalUserId: sub, email, emailVerified: payload.emailVerified === true };
}

export type DbTokenInput = {
  authUserId: string;
  secret: Uint8Array;
  ttlSeconds?: number;
  /** Relógio injetável para testes (segundos Unix). */
  now?: number;
};

/** Token curto para o PostgREST: sub = auth_user_id, role = authenticated. */
export async function mintDatabaseToken({ authUserId, secret, ttlSeconds = 300, now }: DbTokenInput): Promise<string> {
  if (!UUID.test(authUserId)) throw new IdentityBridgeError("INVALID_LINK", "Vínculo de identidade inválido.");
  if (secret.byteLength < 32) throw new Error("Segredo de assinatura do banco ausente ou curto demais.");
  const ttl = Math.min(Math.max(Math.floor(ttlSeconds), 30), DB_TOKEN_MAX_TTL_SECONDS);
  const iat = now ?? Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "authenticated", amr: [{ method: "neon_auth", timestamp: iat }] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(authUserId)
    .setAudience("authenticated")
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttl)
    .sign(secret);
}

export type BridgeDeps = {
  verify: (token: string) => Promise<ProviderIdentity>;
  /** Vínculo mantido no banco: identidade do provedor → auth_user_id. */
  resolveLink: (externalUserId: string) => Promise<string | null>;
  mint: (authUserId: string) => Promise<string>;
};

/** Token do provedor → token do banco. Qualquer falha recusa; nada vem do cliente. */
export async function bridgeIdentity(providerToken: string, deps: BridgeDeps): Promise<{ authUserId: string; dbToken: string; email: string }> {
  const identity = await deps.verify(providerToken);
  if (!identity.emailVerified) throw new IdentityBridgeError("EMAIL_NOT_VERIFIED", "E-mail ainda não confirmado.");
  const authUserId = await deps.resolveLink(identity.externalUserId);
  if (!authUserId) throw new IdentityBridgeError("UNLINKED", "Esta conta ainda não tem acesso configurado no EDUCA.");
  if (!UUID.test(authUserId)) throw new IdentityBridgeError("INVALID_LINK", "Vínculo de identidade inválido.");
  return { authUserId, dbToken: await deps.mint(authUserId), email: identity.email };
}
