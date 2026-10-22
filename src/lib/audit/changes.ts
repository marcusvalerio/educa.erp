import type { AuditChange } from "@/lib/cadastros/types";

// Diferença entre o antes e o depois gravados em audit_logs, em linguagem
// de tela: "precoVenda" → "Preço venda". Campos técnicos ficam de fora.

const HIDDEN = /^(id|company_?id|companyId|created_?at|updated_?at|createdAt|updatedAt|.*_id|.*Id|auth_user_id|search_vector|metadata)$/;

const WORDS: Record<string, string> = { preco: "preço", codigo: "código", descricao: "descrição", razao: "razão", situacao: "situação", numero: "número", observacoes: "observações", minimo: "mínimo", maximo: "máximo", unidade: "unidade" };

export function fieldLabel(key: string): string {
  const words = key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => WORDS[w] ?? w);
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function show(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function auditChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null, limit = 30): AuditChange[] {
  if (!before && !after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: AuditChange[] = [];
  for (const key of keys) {
    if (HIDDEN.test(key)) continue;
    const antes = before ? show(before[key]) : null;
    const depois = after ? show(after[key]) : null;
    if (antes === depois) continue;
    out.push({ campo: fieldLabel(key), antes, depois });
    if (out.length >= limit) break;
  }
  return out;
}
