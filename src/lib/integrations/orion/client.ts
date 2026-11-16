import { signedHeaders } from "./signature";
import { linkRequestSchema, linkResponseSchema, type OrionLinkRequest } from "@/lib/validations/orion";

// Chamadas HTTP do ATLAS ao ORION (§3.4): vínculo com a credencial de
// instalação e eventos com o segredo da empresa.

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export const ORION_API_BASE = "/api/atlas/v1";
export const REQUEST_TIMEOUT_MS = 10_000;

export async function signedCall(input: {
  fetchImpl?: FetchLike;
  baseUrl: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  keyId: string;
  secret: string;
  body?: unknown;
  idempotencyKey?: string;
  now?: number;
  timeoutMs?: number;
}): Promise<{ status: number; json: unknown; text: string }> {
  const body = input.body === undefined ? "" : JSON.stringify(input.body);
  const pathWithQuery = `${ORION_API_BASE}${input.path}`;
  const headers = signedHeaders({ keyId: input.keyId, secret: input.secret, method: input.method, pathWithQuery, body, now: input.now, idempotencyKey: input.idempotencyKey });
  const fetchImpl = input.fetchImpl ?? (fetch as unknown as FetchLike);
  const res = await fetchImpl(`${input.baseUrl.replace(/\/+$/, "")}${pathWithQuery}`, {
    method: input.method,
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(input.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

/** Corpo de POST /links — fixture docs/contrato/s2s.links.request.json. */
export type LinkRequest = OrionLinkRequest;

/** POST {ORION}/api/atlas/v1/links com a credencial de instalação (§6.1 passo 4). */
export async function linkCompany(input: { orionUrl: string; installKeyId: string; installSecret: string; request: LinkRequest; fetchImpl?: FetchLike }): Promise<{ orionCompanyId: string }> {
  const body = linkRequestSchema.parse(input.request);
  const res = await signedCall({
    fetchImpl: input.fetchImpl,
    baseUrl: input.orionUrl,
    method: "POST",
    path: "/links",
    keyId: input.installKeyId,
    secret: input.installSecret,
    body,
  });
  const json = res.json as { error?: { message?: string } } | null;
  const parsed = linkResponseSchema.safeParse(res.json);
  if (res.status < 200 || res.status >= 300 || !parsed.success) {
    throw new Error(`O ORION recusou o vínculo (HTTP ${res.status}): ${json?.error?.message ?? (res.text.slice(0, 200) || "sem detalhes")}`);
  }
  if (parsed.data.atlas_company_id !== body.atlas_company_id || parsed.data.key_id !== body.key_id) {
    throw new Error("O ORION respondeu o vínculo de outra empresa/chave.");
  }
  return { orionCompanyId: parsed.data.orion_company_id };
}
