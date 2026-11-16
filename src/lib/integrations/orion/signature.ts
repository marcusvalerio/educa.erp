import { createHmac, timingSafeEqual } from "node:crypto";

// Autenticação servidor-a-servidor do contrato (§3.2), nos dois sentidos:
//   X-Astraeus-Key-Id, X-Astraeus-Timestamp (epoch s),
//   X-Astraeus-Signature: sha256=hex(HMAC_SHA256(segredo, `${ts}.${METHOD}.${path_com_query}.${corpo}`))
// Sem "server-only": usado também pelos testes e pelo simulador do ORION.

export const HEADER_KEY_ID = "x-astraeus-key-id";
export const HEADER_TIMESTAMP = "x-astraeus-timestamp";
export const HEADER_SIGNATURE = "x-astraeus-signature";
export const MAX_SKEW_SECONDS = 300;

export function canonicalString(timestamp: string | number, method: string, pathWithQuery: string, body: string): string {
  return `${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${body}`;
}

export function signRequest(secret: string, timestamp: string | number, method: string, pathWithQuery: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(canonicalString(timestamp, method, pathWithQuery, body), "utf8").digest("hex")}`;
}

/** Cabeçalhos completos de uma requisição assinada. */
export function signedHeaders(input: {
  keyId: string;
  secret: string;
  method: string;
  pathWithQuery: string;
  body: string;
  now?: number;
  idempotencyKey?: string;
}): Record<string, string> {
  const ts = String(Math.floor((input.now ?? Date.now()) / 1000));
  const headers: Record<string, string> = {
    "X-Astraeus-Key-Id": input.keyId,
    "X-Astraeus-Timestamp": ts,
    "X-Astraeus-Signature": signRequest(input.secret, ts, input.method, input.pathWithQuery, input.body),
  };
  if (input.body) headers["Content-Type"] = "application/json; charset=utf-8";
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;
  return headers;
}

export type SignatureFailure = "missing_headers" | "stale_timestamp" | "invalid_signature";

/**
 * Confere a assinatura contra o segredo atual e, na rotação, o anterior.
 * A janela de 300 s vale para os dois lados do relógio.
 */
export function verifySignature(input: {
  secrets: Array<string | null | undefined>;
  timestamp: string | null;
  signature: string | null;
  method: string;
  pathWithQuery: string;
  body: string;
  now?: number;
}): { ok: true } | { ok: false; code: SignatureFailure } {
  const { timestamp, signature } = input;
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp) || !/^sha256=[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, code: "missing_headers" };
  }
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > MAX_SKEW_SECONDS) return { ok: false, code: "stale_timestamp" };
  const given = Buffer.from(signature, "utf8");
  for (const secret of input.secrets) {
    if (!secret) continue;
    const expected = Buffer.from(signRequest(secret, timestamp, input.method, input.pathWithQuery, input.body), "utf8");
    if (expected.length === given.length && timingSafeEqual(expected, given)) return { ok: true };
  }
  return { ok: false, code: "invalid_signature" };
}
