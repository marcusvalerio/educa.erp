"use client";

import { useEffect, useState } from "react";

// Busca com cache curto e deduplicação de requisições em voo: o centro
// operacional, os painéis por área e as áreas de trabalho dos módulos
// leem as mesmas coleções — cada uma é buscada uma vez por minuto, não
// uma vez por widget.

type Entry = { at: number; promise: Promise<unknown> };
const cache = new Map<string, Entry>();
const TTL = 60_000;

export class FetchError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function cachedGet<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL) return hit.promise as Promise<T>;
  const promise = fetch(path, { cache: "no-store" }).then(async (res) => {
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      cache.delete(path);
      throw new FetchError(body?.error?.message ?? `Erro ${res.status}`, res.status);
    }
    return body.data as T;
  });
  promise.catch(() => cache.delete(path));
  cache.set(path, { at: Date.now(), promise });
  return promise;
}

export function invalidateCache(prefix = "") {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

export type Loadable<T> = { data: T | null; loading: boolean; error: string | null; reload: () => void };

/** Carrega um recurso somente quando `enabled` (permissão) — sem permissão, nem chama a API. */
export function useCached<T>(path: string | null, enabled = true): Loadable<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null; key: string | null }>({
    data: null,
    loading: !!path && enabled,
    error: null,
    key: null,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path || !enabled) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({ ...prev, loading: true, error: null }));
    cachedGet<T>(path)
      .then((data) => !cancelled && setState({ data, loading: false, error: null, key: path }))
      .catch((error: unknown) =>
        !cancelled &&
        setState({
          data: null,
          loading: false,
          error: error instanceof FetchError && error.status === 403 ? "Sem permissão para estes dados." : error instanceof Error ? error.message : "Falha ao carregar.",
          key: path,
        })
      );
    return () => {
      cancelled = true;
    };
  }, [path, enabled, tick]);

  return {
    data: path && enabled ? state.data : null,
    loading: !!path && enabled && state.loading,
    error: path && enabled ? state.error : null,
    reload: () => {
      if (path) invalidateCache(path);
      setTick((n) => n + 1);
    },
  };
}

export function reportPath(endpoint: string, range: { start: string; end: string }): string {
  return `${endpoint}?periodStart=${range.start}&periodEnd=${range.end}`;
}
