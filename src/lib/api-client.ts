// Cliente HTTP genérico para as telas reais (Fase 19 — Conclusão da UI).
// Todas as rotas /api/* já respondem no mesmo envelope
// ({success:true,data} | {success:false,error}) desde a Fase 2 — este
// helper só centraliza o unwrap/erro, nunca reimplementado tela a tela.

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

export const NETWORK_ERROR_MESSAGE =
  "Sem resposta do servidor (internet instável ou sistema sendo atualizado). Confira na lista se o registro já foi salvo e, se não, tente de novo.";

/** fetch que troca a falha de rede ("Failed to fetch") por uma mensagem em português. */
export async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await safeFetch(path);
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!body || !res.ok || body.success === false) {
    const message = body && !body.success ? body.error.message : `Erro ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }
  return body.data;
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", payload?: unknown): Promise<T> {
  const res = await safeFetch(path, {
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
