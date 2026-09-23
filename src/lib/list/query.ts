// Lógica pura de listas (testada em tests/list-query.test.ts): estado na
// URL, busca/filtro/ordenação/paginação locais (quando a API devolve a
// coleção inteira) e exportação CSV. Quando a API pagina no servidor
// (resposta com `meta`), só a serialização de parâmetros é usada.

export type SortDir = "asc" | "desc";

export type ListState = {
  q: string;
  page: number;
  pageSize: number;
  sort: string | null;
  dir: SortDir;
  filters: Record<string, string>;
};

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
const RESERVED = new Set(["q", "page", "size", "sort", "dir"]);

export function parseListState(params: URLSearchParams, filterIds: string[]): ListState {
  const page = Math.max(1, Number(params.get("page")) || 1);
  const sizeParam = Number(params.get("size"));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE;
  const filters: Record<string, string> = {};
  for (const id of filterIds) {
    const value = params.get(id);
    if (value) filters[id] = value;
  }
  return {
    q: params.get("q") ?? "",
    page,
    pageSize,
    sort: params.get("sort"),
    dir: params.get("dir") === "desc" ? "desc" : "asc",
    filters,
  };
}

/** Aplica um patch ao estado e devolve a query string (preservando parâmetros alheios). */
export function serializeListState(current: URLSearchParams, state: ListState, filterIds: string[]): string {
  const next = new URLSearchParams(current.toString());
  const set = (key: string, value: string | null | undefined, fallback?: string) => {
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
  };
  set("q", state.q.trim());
  set("page", String(state.page), "1");
  set("size", String(state.pageSize), String(DEFAULT_PAGE_SIZE));
  set("sort", state.sort);
  set("dir", state.sort ? state.dir : null, "asc");
  for (const id of filterIds) {
    if (RESERVED.has(id)) continue;
    set(id, state.filters[id]);
  }
  const text = next.toString();
  return text ? `?${text}` : "";
}

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === "string" && typeof b === "string" && a.trim() !== "" && b.trim() !== "" && !Number.isNaN(na) && !Number.isNaN(nb) && /^-?\d/.test(a)) {
    return na - nb;
  }
  return normalize(a).localeCompare(normalize(b), "pt-BR", { numeric: true });
}

export type ClientQueryConfig<T> = {
  /** Valores pesquisáveis por linha (busca textual sem acento/caixa). */
  searchText: (row: T) => string;
  /** Valor ordenável por id de coluna. */
  sortValue: (row: T, columnId: string) => unknown;
  /** Predicados de filtro locais por id de filtro. */
  predicates: Record<string, (row: T, value: string) => boolean>;
};

export function applyClientQuery<T>(rows: T[], state: ListState, config: ClientQueryConfig<T>): { rows: T[]; total: number; filtered: T[] } {
  const term = normalize(state.q.trim());
  let result = rows;
  if (term) result = result.filter((row) => normalize(config.searchText(row)).includes(term));
  for (const [id, value] of Object.entries(state.filters)) {
    const predicate = config.predicates[id];
    if (predicate && value) result = result.filter((row) => predicate(row, value));
  }
  if (state.sort) {
    const sortId = state.sort;
    const factor = state.dir === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => factor * compareValues(config.sortValue(a, sortId), config.sortValue(b, sortId)));
  }
  const total = result.length;
  const start = (state.page - 1) * state.pageSize;
  return { rows: result.slice(start, start + state.pageSize), total, filtered: result };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** CSV com separador ";" (padrão do Excel pt-BR) e BOM para acentuação. */
export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map((row) => row.map(escape).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export function isOverdue(dateValue: string | null | undefined, today = new Date()): boolean {
  if (!dateValue) return false;
  const [y, m, d] = dateValue.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return false;
  const due = new Date(y, m - 1, d);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due.getTime() < startOfToday.getTime();
}
