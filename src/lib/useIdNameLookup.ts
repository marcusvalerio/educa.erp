"use client";

import { useEffect, useState } from "react";
import { cachedGet } from "@/lib/dashboard/client";

// Resolve id -> nome para colunas de referência (cliente, fornecedor,
// produto...). As rotas de cadastro devolvem entidades mapeadas
// (nome/razaoSocial/descricao) e as de domínio devolvem linhas do banco
// (name/legal_name/description): o campo pedido é tentado primeiro e,
// sem ele, os equivalentes conhecidos. Enquanto o lookup não chega, a
// coluna mostra o id curto — nunca um nome fictício. Local de estoque sem
// descrição cai no código do local (codigoLocal), para continuar aparecendo
// na reserva e no saldo.

const NAME_FALLBACKS = ["nome", "nomeFantasia", "razaoSocial", "name", "trade_name", "legal_name", "descricao", "description", "codigoLocal", "codigo", "code"];

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

type LookupRow = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "código — descrição" do produto (cadastro mapeado ou linha do banco). */
export function productLabel(row: LookupRow): string | null {
  const code = txt(row.codigo) || txt(row.code) || txt(row.sku);
  const name = txt(row.descricao) || txt(row.description) || txt(row.nome) || txt(row.name);
  return [code, name].filter(Boolean).join(" — ") || null;
}

/** "código — descrição" do local de estoque. */
export function locationLabel(row: LookupRow): string | null {
  const code = txt(row.codigoLocal) || txt(row.codigo) || txt(row.code);
  const name = txt(row.descricao) || txt(row.description) || txt(row.nome) || txt(row.name);
  return [code, name].filter(Boolean).join(" — ") || null;
}

/** Como useIdNameLookup, mas com um rótulo montado (ex.: productLabel). Passe uma função estável. */
export function useLabelLookup(apiPath: string, label: (row: LookupRow) => string | null): Map<string, string> {
  const [lookup, setLookup] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    cachedGet<LookupRow[]>(lookupPath(apiPath))
      .then((rows) => {
        if (cancelled || !Array.isArray(rows)) return;
        const map = new Map<string, string>();
        for (const row of rows) {
          const name = label(row);
          if (typeof row.id === "string" && name) map.set(row.id, name);
        }
        setLookup(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiPath, label]);
  return lookup;
}
