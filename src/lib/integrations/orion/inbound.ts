import { HEADER_KEY_ID, HEADER_SIGNATURE, HEADER_TIMESTAMP, verifySignature } from "./signature";
import { parseInboundEnvelope } from "@/lib/validations/orion";
import type { HandlerResult, HeaderReader, IntegrationSecretsRow, OrionDb } from "./types";

// Rotas servidor-a-servidor do ATLAS chamadas pelo ORION (§3.6, §2.7).
// Ignoram cookies: a empresa é SEMPRE a resolvida pelo key_id assinado.

export const MAX_EVENT_BYTES = 1024 * 1024;

type Deps = { db: OrionDb; decrypt: (b64: string) => string; now?: number };
type Req = { method: string; pathWithQuery: string; headers: HeaderReader; body: string };

const rejected = (status: number, code: string, message: string, retryable = false, eventId: string | null = null, extra: Record<string, unknown> = {}): HandlerResult => ({
  status,
  body: { status: "rejected", event_id: eventId, error: { code, message, retryable, ...extra } },
});

/** Autentica a requisição pelo key_id da empresa. */
export async function authenticate(deps: Deps, req: Req): Promise<{ ok: true; integration: IntegrationSecretsRow } | { ok: false; result: HandlerResult }> {
  const keyId = req.headers.get(HEADER_KEY_ID);
  if (!keyId) return { ok: false, result: rejected(401, "unknown_key", "Cabeçalho X-Astraeus-Key-Id ausente.") };
  const { data, error } = await deps.db.rpc("fn_orion_integration_secrets", { p_company_id: null, p_key_id: keyId });
  if (error) throw new Error(`fn_orion_integration_secrets: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as IntegrationSecretsRow | undefined;
  if (!row) return { ok: false, result: rejected(401, "unknown_key", "key_id desconhecido.") };
  let secrets: string[];
  try {
    secrets = [deps.decrypt(row.secret_ciphertext_b64), row.previous_secret_ciphertext_b64 ? deps.decrypt(row.previous_secret_ciphertext_b64) : ""];
  } catch {
    return { ok: false, result: rejected(500, "secret_unavailable", "Segredo da empresa indisponível nesta instalação.", true) };
  }
  const check = verifySignature({
    secrets,
    timestamp: req.headers.get(HEADER_TIMESTAMP),
    signature: req.headers.get(HEADER_SIGNATURE),
    method: req.method,
    pathWithQuery: req.pathWithQuery,
    body: req.body,
    now: deps.now,
  });
  if (!check.ok) {
    const code = check.code === "missing_headers" ? "invalid_signature" : check.code;
    return { ok: false, result: rejected(401, code, code === "stale_timestamp" ? "Timestamp fora da janela de 300 s." : "Assinatura inválida.") };
  }
  return { ok: true, integration: row };
}

/** POST /api/integrations/orion/v1/events */
export async function handleInboundEvent(deps: Deps, req: Req): Promise<HandlerResult> {
  if (Buffer.byteLength(req.body, "utf8") > MAX_EVENT_BYTES) return rejected(413, "payload_too_large", "Corpo acima de 1 MB.");
  const auth = await authenticate(deps, req);
  if (!auth.ok) return auth.result;
  let json: unknown;
  try {
    json = JSON.parse(req.body);
  } catch {
    return rejected(400, "invalid_envelope", "Corpo não é JSON válido.");
  }
  const parsed = parseInboundEnvelope(json);
  const eventId = typeof (json as { id?: unknown })?.id === "string" ? ((json as { id: string }).id) : null;
  if (!parsed.ok) return rejected(400, parsed.code, parsed.message, false, eventId, parsed.details.length ? { details: parsed.details } : {});
  const env = parsed.envelope;
  const integration = auth.integration;
  if (env.atlas_company_id !== integration.company_id || (integration.orion_company_id && env.orion_company_id !== integration.orion_company_id)) {
    return rejected(403, "company_mismatch", "A empresa do envelope não é a da credencial.", false, env.id);
  }
  const headerKey = req.headers.get("idempotency-key");
  if (headerKey && headerKey !== env.id) return rejected(400, "invalid_envelope", "Idempotency-Key diferente do id do evento.", false, env.id);
  const { data, error } = await deps.db.rpc("fn_orion_receive_event", { p_company_id: integration.company_id, p_envelope: env, p_reprocess: false });
  if (error) throw new Error(`fn_orion_receive_event: ${error.message}`);
  const out = data as { http: number; body: unknown };
  return { status: out.http, body: out.body };
}

/** GET /api/integrations/orion/v1/access?atlas_user_id=… (§2.7) */
export async function handleAccessCheck(deps: Deps, req: Req, atlasUserId: string | null): Promise<HandlerResult> {
  const auth = await authenticate(deps, req);
  if (!auth.ok) return auth.result;
  if (!atlasUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(atlasUserId)) {
    return rejected(400, "validation_failed", "Informe atlas_user_id (uuid).");
  }
  const { data, error } = await deps.db.rpc("fn_orion_access_status", { p_company_id: auth.integration.company_id, p_user_id: atlasUserId });
  if (error) throw new Error(`fn_orion_access_status: ${error.message}`);
  return { status: 200, body: toAccessResponse(data as Record<string, unknown>) };
}

/** Resposta no formato exato do contrato (s2s.access-check.response.*.json). */
export function toAccessResponse(row: Record<string, unknown>): Record<string, unknown> {
  if (row.active === true) {
    const { atlas_user_id, atlas_company_id, active, orion_role, access_version, email, name, warehouses, checked_at } = row;
    return { atlas_user_id, atlas_company_id, active, orion_role, access_version, email, name, warehouses, checked_at };
  }
  const { atlas_user_id, atlas_company_id, active, reason, access_version, checked_at } = row;
  return { atlas_user_id, atlas_company_id, active, reason, access_version, checked_at };
}

/** GET /api/integrations/orion/v1/documents/{type}/{id} */
export async function handleDocumentState(deps: Deps, req: Req, type: string, id: string): Promise<HandlerResult> {
  const auth = await authenticate(deps, req);
  if (!auth.ok) return auth.result;
  if (!["sales_order", "purchase_order", "production_order"].includes(type) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return rejected(400, "validation_failed", "Tipo ou id de documento inválido.");
  }
  const { data, error } = await deps.db.rpc("fn_orion_document_state", { p_company_id: auth.integration.company_id, p_type: type, p_id: id });
  if (error) throw new Error(`fn_orion_document_state: ${error.message}`);
  if (!data) return rejected(404, "unknown_reference", "Documento não encontrado.");
  return { status: 200, body: data };
}
