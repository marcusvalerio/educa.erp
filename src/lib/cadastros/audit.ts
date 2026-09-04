import type { AuditAcao, AuditEntry } from "./types";

const STORAGE_KEY = "erp:cadastros:audit-log";
const MAX_ENTRIES = 500;

let cache: AuditEntry[] | null = null;

function read(): AuditEntry[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist(entries: AuditEntry[]) {
  cache = entries;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // localStorage indisponível (modo privado ou cota excedida) — histórico segue apenas em memória.
  }
}

export function logAudit(entidade: string, registro: string, acao: AuditAcao, usuario = "Ana Ribeiro") {
  const entry: AuditEntry = {
    id: `AUD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    data: new Date().toISOString(),
    usuario,
    entidade,
    registro,
    acao,
  };
  persist([entry, ...read()]);
  return entry;
}

export function listAudit(filter?: { entidade?: string; registro?: string }): AuditEntry[] {
  const entries = read();
  if (!filter) return entries;
  return entries.filter(
    (e) =>
      (!filter.entidade || e.entidade === filter.entidade) &&
      (!filter.registro || e.registro === filter.registro)
  );
}
