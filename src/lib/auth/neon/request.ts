import "server-only";

import { cookies, headers } from "next/headers";
import type { ClientHints } from "./client";
import { resolveNeonSessionCached, SESSION_COOKIE, type NeonResolution } from "./server";

// Ponto de encontro entre a requisição do Next (cookies/cabeçalhos) e a
// resolução de sessão do Neon. Só lê: gravar/apagar o cookie é das rotas
// de autenticação e do proxy.

export async function requestHints(): Promise<{ hints: ClientHints; origin: string | null }> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host && /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return {
    hints: { forwardedFor: h.get("x-forwarded-for"), userAgent: h.get("user-agent") },
    origin: host ? `${proto}://${host}` : null,
  };
}

export async function currentNeonCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function resolveCurrentNeonSession(): Promise<NeonResolution> {
  const { hints, origin } = await requestHints();
  return resolveNeonSessionCached(await currentNeonCookie(), hints, origin);
}

/** Token curto do banco da sessão atual, ou null (sem sessão válida). */
export async function currentNeonDatabaseToken(): Promise<string | null> {
  const resolved = await resolveCurrentNeonSession();
  return resolved.status === "ok" ? resolved.identity.dbToken : null;
}
