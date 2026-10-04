// Cliente HTTP genérico para as telas reais (Fase 19 — Conclusão da UI).
// Todas as rotas /api/* já respondem no mesmo envelope
// ({success:true,data} | {success:false,error}) desde a Fase 2 — este
// helper só centraliza o unwrap/erro, nunca reimplementado tela a tela.

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || !res.ok || body.success === false) {
    const message = body && !body.success ? body.error.message : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }
  return body.data;
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || !res.ok || body.success === false) {
    const message = body && !body.success ? body.error.message : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }
  return body.data;
}

/**
 * Como apiSend, mas devolve também a mensagem do servidor (ex.: "Este pedido já
 * tem a conta a receber CR-0236. Nenhum título novo foi criado."), para a tela
 * não anunciar um texto fixo de sucesso quando nada foi criado.
 */
export async function apiSendWithMessage<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  payload?: unknown,
): Promise<{ data: T; message: string | null; created: boolean | null }> {
  const res = await fetch(path, {
    method,
    headers: payload !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  const body = (await res.json().catch(() => null)) as (ApiEnvelope<T> & { message?: string; created?: boolean }) | null;
  if (!body || !res.ok || body.success === false) {
    const message = body && !body.success ? body.error.message : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }
  return { data: body.data, message: typeof body.message === "string" ? body.message : null, created: typeof body.created === "boolean" ? body.created : null };
}
