"use client";

import { useEffect, useMemo, useState } from "react";
import type { ListState } from "@/lib/list/query";
import type { ColumnDef, FilterDef } from "./types";

type Envelope<T> = { success: boolean; data?: T[]; meta?: { total: number; page: number; pageSize: number }; error?: { message: string } };

export type ResourceResult<T> = {
  rows: T[];
  total: number;
  mode: "server" | "client" | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

// Busca uma coleção respeitando o que a API sabe fazer:
//   - SEMPRE envia os filtros que a API declara aceitar (serverParam);
//   - envia page/pageSize/search/sort/order; se a resposta traz `meta`,
//     a API paginou (modo servidor) e nada é recalculado no navegador;
//   - sem `meta`, a API devolveu a coleção inteira (modo cliente) e a
//     lista aplica busca/filtro/ordenação/paginação localmente.
// Nunca inventa linhas: se a API falha, o estado é de erro.
// Modo já descoberto por endpoint nesta sessão (evita uma segunda busca
// ao descobrir que a API não pagina).
const modeCache = new Map<string, "server" | "client">();

export function useResource<T>(apiPath: string, state: ListState, filters: FilterDef<T>[], columns: ColumnDef<T>[]): ResourceResult<T> {
  const basePath = apiPath.split("?")[0];
  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<"server" | "client" | null>(() => modeCache.get(basePath) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const url = useMemo(() => {
    const [path, existing] = apiPath.split("?");
    const params = new URLSearchParams(existing ?? "");
    for (const filter of filters) {
      const value = state.filters[filter.id];
      if (value && filter.serverParam) params.set(filter.serverParam, value);
    }
    // Parâmetros de paginação/busca: ignorados com segurança por APIs que
    // não paginam. Só entram de fato no modo servidor.
    if (mode !== "client") {
      params.set("page", String(state.page));
      params.set("pageSize", String(state.pageSize));
      if (state.q.trim()) params.set("search", state.q.trim());
      const sortCol = columns.find((c) => c.id === state.sort);
      if (sortCol?.serverSortKey) {
        params.set("sort", sortCol.serverSortKey);
        params.set("order", state.dir);
      }
    }
    const text = params.toString();
    return text ? `${path}?${text}` : path;
  }, [apiPath, filters, state, columns, mode]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as Envelope<T> | null;
        if (cancelled) return;
        if (!res.ok || !body?.success) {
          setError(
            res.status === 403
              ? "Seu perfil não tem permissão para consultar estes dados."
              : body?.error?.message ?? `Erro ${res.status} ao comunicar com o servidor.`
          );
          setRows([]);
          setTotal(0);
          return;
        }
        const data = Array.isArray(body.data) ? body.data : [];
        setError(null);
        if (body.meta) {
          modeCache.set(basePath, "server");
          setMode("server");
          setRows(data);
          setTotal(body.meta.total);
        } else {
          modeCache.set(basePath, "client");
          setMode("client");
          setRows(data);
          setTotal(data.length);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível conectar ao servidor.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, basePath, reloadKey]);

  return { rows, total, mode, loading, error, reload: () => setReloadKey((n) => n + 1) };
}
