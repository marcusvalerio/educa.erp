"use client";

import { useEffect, useState } from "react";
import { cachedGet } from "@/lib/dashboard/client";

// Resolve id -> nome para colunas de referência (cliente, fornecedor,
// produto...). As rotas de cadastro devolvem entidades mapeadas
// (nome/razaoSocial/descricao) e as de domínio devolvem linhas do banco
// (name/legal_name/description): o campo pedido é tentado primeiro e,
// sem ele, os equivalentes conhecidos. Enquanto o lookup não chega, a
// coluna mostra o id curto — nunca um nome fictício.

const NAME_FALLBACKS = ["nome", "nomeFantasia", "razaoSocial", "name", "trade_name", "legal_name", "descricao", "description", "codigo", "code"];

/** Cadastros paginam por padrão (200); o lookup pede o máximo permitido. */
export function lookupPath(apiPath: string): string {
  if (/[?&]pageSize=/.test(apiPath)) return apiPath;
  return `${apiPath}${apiPath.includes("?") ? "&" : "?"}pageSize=500`;
}

export function pickName(row: Record<string, unknown>, nameField: string): string | null {
  for (const key of [nameField, ...NAME_FALLBACKS]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function useIdNameLookup(apiPath: string, nameField = "name"): Map<string, string> {
  const [lookup, setLookup] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    cachedGet<Record<string, unknown>[]>(lookupPath(apiPath))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const map = new Map<string, string>();
        for (const row of rows) {
          const name = pickName(row, nameField);
          if (typeof row.id === "string" && name) map.set(row.id, name);
        }
        setLookup(map);
      })
      .catch(() => {
        // Lookup é só enriquecimento de exibição — falha aqui nunca trava a lista.
      });
    return () => {
      cancelled = true;
    };
  }, [apiPath, nameField]);

  return lookup;
}
