import type { AuditChange } from "@/lib/cadastros/types";
import { STATUS_REGISTRY, statusMeta, type StatusEntity } from "@/lib/status";

// Diferença entre o antes e o depois gravados em audit_logs, em linguagem
// de tela: "precoVenda" → "Preço venda". Campos técnicos ficam de fora.

const HIDDEN = /^(id|company_?id|companyId|created_?at|updated_?at|createdAt|updatedAt|.*_id|.*Id|auth_user_id|search_vector|metadata)$/;

const WORDS: Record<string, string> = { preco: "preço", codigo: "código", descricao: "descrição", razao: "razão", situacao: "situação", numero: "número", observacoes: "observações", minimo: "mínimo", maximo: "máximo", unidade: "unidade" };

// Campos gravados em inglês pelas funções do banco → rótulo de tela.
const FIELD_LABELS: Record<string, string> = {
  installments: "Parcelas",
  installment_number: "Parcela",
  updated_amount: "Valor atualizado",
  original_amount: "Valor original",
  amount: "Valor",
  reason: "Motivo",
  status: "Situação",
  origin_type: "Origem",
  due_date: "Vencimento",
  issue_date: "Emissão",
  description: "Descrição",
  notes: "Observações",
  code: "Código",
  number: "Número",
  type: "Tipo",
  currency_code: "Moeda",
  exchange_rate: "Câmbio",
  total_amount: "Valor total",
  paid_amount: "Valor pago",
  received_amount: "Valor recebido",
  discount_amount: "Desconto",
  interest_amount: "Juros",
  fine_amount: "Multa",
  payment_method: "Forma de pagamento",
  document_reference: "Documento",
  quantity: "Quantidade",
};

const ORIGIN_LABELS: Record<string, string> = {
  sales_order: "Pedido de venda",
  sales_orders: "Pedido de venda",
  purchase_order: "Pedido de compra",
  purchase_orders: "Pedido de compra",
  purchase_receipt: "Recebimento de compra",
  purchase_receipts: "Recebimento de compra",
  fiscal_document: "Nota fiscal",
  fiscal_documents: "Nota fiscal",
  manual: "Manual",
  import: "Importação",
  imports: "Importação",
  contract: "Contrato",
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
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

function show(value: unknown, key?: string, entity?: string): string | null {
  if (typeof value === "string" && key === "status") {
    const known = entity && entity in STATUS_REGISTRY ? (entity as StatusEntity) : undefined;
    return statusMeta(known, value).label;
  }
  if (typeof value === "string" && key === "origin_type") return ORIGIN_LABELS[value.toLowerCase()] ?? value;
  if (Array.isArray(value) && key === "installments") return `${value.length} parcela${value.length === 1 ? "" : "s"}`;
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function auditChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null, limit = 30, entity?: string): AuditChange[] {
  if (!before && !after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: AuditChange[] = [];
  for (const key of keys) {
    if (HIDDEN.test(key)) continue;
    const antes = before ? show(before[key], key, entity) : null;
    const depois = after ? show(after[key], key, entity) : null;
    if (antes === depois) continue;
    out.push({ campo: fieldLabel(key), antes, depois });
    if (out.length >= limit) break;
  }
  return out;
}
