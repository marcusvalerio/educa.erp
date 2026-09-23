"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseListState, serializeListState, type ListState } from "@/lib/list/query";
import type { Density } from "./types";

// Estado da lista na URL: busca, página, tamanho, ordenação e filtros
// sobrevivem a recarregar, compartilhar link e voltar do detalhe — é o
// que permite o drill-down do dashboard (?view=atrasados&status=OPEN).
export function useListState(filterIds: string[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = filterIds.join("|");
  const state = useMemo(() => parseListState(new URLSearchParams(params.toString()), key ? key.split("|") : []), [params, key]);

  const update = useCallback(
    (patch: Partial<ListState>) => {
      const next: ListState = { ...state, ...patch, filters: { ...state.filters, ...(patch.filters ?? {}) } };
      for (const [id, value] of Object.entries(next.filters)) if (!value) delete next.filters[id];
      const resetsPage = patch.q !== undefined || patch.filters !== undefined || patch.pageSize !== undefined || patch.sort !== undefined;
      if (resetsPage && patch.page === undefined) next.page = 1;
      const query = serializeListState(new URLSearchParams(params.toString()), next, key ? key.split("|") : []);
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [state, params, key, router, pathname]
  );

  const clear = useCallback(() => {
    const cleared = new URLSearchParams(params.toString());
    for (const id of ["q", "page", ...(key ? key.split("|") : [])]) cleared.delete(id);
    const text = cleared.toString();
    router.replace(`${pathname}${text ? `?${text}` : ""}`, { scroll: false });
  }, [params, key, router, pathname]);

  return { state, update, clear };
}

type TablePrefs = { density: Density; hidden: string[] };

// Preferências de exibição por tabela (densidade e colunas ocultas),
// pessoais e locais ao navegador.
export function useTablePrefs(tableId: string, defaultHidden: string[]) {
  const storageKey = `educa-table:${tableId}`;
  const [prefs, setPrefs] = useState<TablePrefs>({ density: "compact", hidden: defaultHidden });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TablePrefs>;
        // Leitura única de preferência persistida após a montagem (evita
        // divergência de hidratação com o HTML do servidor).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPrefs((prev) => ({
          density: parsed.density === "comfortable" ? "comfortable" : "compact",
          hidden: Array.isArray(parsed.hidden) ? parsed.hidden : prev.hidden,
        }));
      }
    } catch {
      // sem persistência: usa o padrão
    }
  }, [storageKey]);

  const save = useCallback(
    (next: TablePrefs) => {
      setPrefs(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // idem
      }
    },
    [storageKey]
  );

  return {
    density: prefs.density,
    hidden: new Set(prefs.hidden),
    setDensity: (density: Density) => save({ ...prefs, density }),
    toggleColumn: (id: string) =>
      save({ ...prefs, hidden: prefs.hidden.includes(id) ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id] }),
  };
}
