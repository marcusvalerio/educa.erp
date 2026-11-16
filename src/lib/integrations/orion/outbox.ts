import { signedCall, type FetchLike } from "./client";
import type { OrionDb } from "./types";

// Processador da outbox do ATLAS (§4.4). O banco escolhe o que está devido
// e garante a ordem por agregado (fn_orion_outbox_claim: seq N só sai depois
// de N-1 enviado); aqui só assinamos, enviamos e devolvemos o resultado
// (fn_orion_outbox_result: backoff exponencial, 20 tentativas).

type Claimed = {
  id: string;
  company_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_seq: number | string;
  payload: Record<string, unknown>;
  created_at: string;
  attempts: number;
  orion_url: string;
  orion_company_id: string | null;
  key_id: string;
  secret_ciphertext_b64: string;
};

export type OutboxStats = { claimed: number; sent: number; retried: number; failed: number };

export function buildEnvelope(row: Claimed): Record<string, unknown> {
  return {
    id: row.id,
    type: row.event_type,
    version: 1,
    source: "atlas",
    atlas_company_id: row.company_id,
    orion_company_id: row.orion_company_id,
    aggregate: { type: row.aggregate_type, id: row.aggregate_id, sequence: Number(row.aggregate_seq) },
    occurred_at: new Date(row.created_at).toISOString().replace(/\.\d{3}Z$/, "Z"),
    payload: row.payload,
  };
}

/** Classifica a resposta do ORION (tabela de §3.4). */
export function classify(status: number, json: unknown): { ok: boolean; retryable: boolean; error: string | null } {
  const body = (json ?? {}) as { status?: string; error?: { code?: string; message?: string; retryable?: boolean } };
  if ((status === 200 || status === 202) && body.status !== "rejected") return { ok: true, retryable: false, error: null };
  const code = body.error?.code ?? `http_${status}`;
  const message = `${code}: ${body.error?.message ?? "sem detalhes"}`;
  if (status === 429 || status >= 500) return { ok: false, retryable: true, error: message };
  if (typeof body.error?.retryable === "boolean") return { ok: false, retryable: body.error.retryable, error: message };
  if (code === "out_of_order" || code === "dependency_missing") return { ok: false, retryable: true, error: message };
  return { ok: false, retryable: false, error: message };
}

export async function processOutbox(deps: {
  db: OrionDb;
  decrypt: (b64: string) => string;
  fetchImpl?: FetchLike;
  now?: () => number;
  limit?: number;
  maxRounds?: number;
}): Promise<OutboxStats> {
  const stats: OutboxStats = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  for (let round = 0; round < (deps.maxRounds ?? 20); round++) {
    const { data, error } = await deps.db.rpc("fn_orion_outbox_claim", { p_limit: deps.limit ?? 100 });
    if (error) throw new Error(`fn_orion_outbox_claim: ${error.message}`);
    const rows = (data ?? []) as Claimed[];
    if (rows.length === 0) break;
    stats.claimed += rows.length;
    for (const row of rows) {
      let result: { ok: boolean; retryable: boolean; error: string | null; status: number | null; response: unknown };
      try {
        const res = await signedCall({
          fetchImpl: deps.fetchImpl,
          baseUrl: row.orion_url,
          method: "POST",
          path: "/events",
          keyId: row.key_id,
          secret: deps.decrypt(row.secret_ciphertext_b64),
          body: buildEnvelope(row),
          idempotencyKey: row.id,
          now: deps.now?.(),
        });
        result = { ...classify(res.status, res.json), status: res.status, response: res.json };
      } catch (e) {
        result = { ok: false, retryable: true, error: `rede: ${(e as Error).message}`, status: null, response: null };
      }
      const upd = await deps.db.rpc("fn_orion_outbox_result", {
        p_id: row.id,
        p_ok: result.ok,
        p_http_status: result.status,
        p_error: result.error,
        p_retryable: result.retryable,
        p_response: result.response && typeof result.response === "object" ? result.response : null,
      });
      if (upd.error) throw new Error(`fn_orion_outbox_result: ${upd.error.message}`);
      const st = (upd.data as { status?: string } | null)?.status;
      if (result.ok) stats.sent++;
      else if (st === "failed") stats.failed++;
      else stats.retried++;
    }
  }
  return stats;
}
