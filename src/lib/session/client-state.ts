"use client";

import type { SessionContext } from "./types";
import { invalidateCache } from "@/lib/dashboard/client";
import { userScopedKeys } from "@/lib/onboarding/access";

// Estado da sessão que vive no navegador.
//
// 1. Pré-carga: o login já busca /api/session/context para decidir o
//    destino; o SessionProvider reaproveita essa resposta (em memória,
//    por poucos segundos) em vez de buscar de novo.
// 2. Limpeza no logout: nada do usuário anterior fica para trás — unidade
//    em foco, caches de API, sessionStorage e a pré-carga.

const PRIME_TTL_MS = 15_000;
let primed: { data: SessionContext; at: number } | null = null;

export function primeSession(data: SessionContext) {
  primed = { data, at: Date.now() };
}

export function takePrimedSession(): SessionContext | null {
  const entry = primed;
  primed = null;
  if (!entry || Date.now() - entry.at > PRIME_TTL_MS) return null;
  return entry.data;
}

export function clearClientSessionState() {
  primed = null;
  invalidateCache("");
  try {
    for (const key of userScopedKeys(Object.keys(window.localStorage))) window.localStorage.removeItem(key);
  } catch {
    // armazenamento indisponível: nada a limpar
  }
  try {
    window.sessionStorage.clear();
  } catch {
    // idem
  }
}
