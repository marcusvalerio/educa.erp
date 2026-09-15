"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";

// Fase 19 — Conclusão da UI: resolve id -> nome para colunas de
// referência (cliente/fornecedor/produto...) nas telas convertidas de
// ResourceListPage, sem duplicar a busca de cada cadastro relacionado
// (reaproveita a mesma rota /api/* que os cadastros já usam). Enquanto
// o lookup não chega, format() cai no próprio id — nunca um nome
// fictício.
export function useIdNameLookup(apiPath: string, nameField = "name"): Map<string, string> {
  const [lookup, setLookup] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    apiGet<Record<string, unknown>[]>(apiPath)
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const row of rows) {
          const id = row.id;
          const name = row[nameField];
          if (typeof id === "string" && typeof name === "string") map.set(id, name);
        }
        setLookup(map);
      })
      .catch(() => {
        // Lookup é só um enriquecimento de exibição — uma falha aqui
        // nunca deve travar a listagem principal (format() cai no id).
      });
    return () => {
      cancelled = true;
    };
  }, [apiPath, nameField]);

  return lookup;
}
