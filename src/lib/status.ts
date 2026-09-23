import type { Tone } from "@/components/ui/Badge";

// Registro TIPADO de status: código do banco -> rótulo + tom semântico.
//
// Nada de "procurar palavras no texto": cada entidade declara os códigos
// que o banco aceita (CHECK constraints) e o que eles significam. O código
// armazenado nunca muda — só a apresentação. Código desconhecido cai num
// rótulo neutro legível, nunca numa cor inventada.
//
// Convenção de tom:
//   success  concluído / aprovado / positivo
//   info     em andamento no fluxo normal
//   warning  aguardando alguém / atenção
//   danger   falha, recusa, atraso
//   critical severidade crítica / bloqueio
//   neutral  rascunho, inativo, cancelado, encerrado sem juízo de valor

export type StatusIcon = "check" | "clock" | "alert" | "x" | "pause" | "progress" | "dot";
export type StatusMeta = { label: string; tone: Tone; icon?: StatusIcon };

const S = (label: string, tone: Tone, icon?: StatusIcon): StatusMeta => ({ label, tone, icon });

// Vocabulário comum (vale para qualquer entidade que não sobrescreva).
const GENERIC: Record<string, StatusMeta> = {
  ACTIVE: S("Ativo", "success", "dot"),
  INACTIVE: S("Inativo", "neutral"),
  ATIVO: S("Ativo", "success", "dot"),
  INATIVO: S("Inativo", "neutral"),
  DRAFT: S("Rascunho", "neutral"),
  PENDING: S("Pendente", "warning", "clock"),
  PENDING_APPROVAL: S("Aguardando aprovação", "warning", "clock"),
  REQUESTED: S("Solicitado", "warning", "clock"),
  APPROVED: S("Aprovado", "success", "check"),
  REJECTED: S("Recusado", "danger", "x"),
  CANCELLED: S("Cancelado", "neutral", "x"),
  OPEN: S("Aberto", "info"),
  IN_PROGRESS: S("Em andamento", "info", "progress"),
  COMPLETED: S("Concluído", "success", "check"),
  CLOSED: S("Encerrado", "neutral", "check"),
  DONE: S("Concluído", "success", "check"),
  OVERDUE: S("Vencido", "danger", "alert"),
  FAILED: S("Falhou", "danger", "alert"),
  ERROR: S("Erro", "danger", "alert"),
  OBSOLETE: S("Obsoleto", "neutral"),
  CONFIRMED: S("Confirmado", "success", "check"),
  REVERSED: S("Estornado", "neutral"),
  ON_HOLD: S("Em espera", "warning", "pause"),
  LOW: S("Baixa", "neutral"),
  MEDIUM: S("Média", "info"),
  HIGH: S("Alta", "warning", "alert"),
  URGENT: S("Urgente", "danger", "alert"),
  CRITICAL: S("Crítica", "critical", "alert"),
};

export const STATUS_REGISTRY = {
  sales_orders: {
    DRAFT: S("Rascunho", "neutral"),
    PENDING_APPROVAL: S("Aguardando aprovação", "warning", "clock"),
    APPROVED: S("Aprovado", "info", "check"),
    RESERVATION_PENDING: S("Reserva pendente", "warning", "clock"),
    RESERVED: S("Reservado", "info"),
    PICKING: S("Em separação", "info", "progress"),
    READY_TO_SHIP: S("Pronto p/ expedir", "info"),
    PARTIALLY_SHIPPED: S("Expedido parcial", "warning", "progress"),
    SHIPPED: S("Expedido", "info", "progress"),
    COMPLETED: S("Concluído", "success", "check"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  sales_quotes: {
    DRAFT: S("Rascunho", "neutral"),
    SENT: S("Enviado", "info"),
    APPROVED: S("Aprovado", "success", "check"),
    REJECTED: S("Recusado", "danger", "x"),
    EXPIRED: S("Expirado", "warning", "clock"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  purchase_requests: {
    DRAFT: S("Rascunho", "neutral"),
    REQUESTED: S("Solicitada", "warning", "clock"),
    APPROVED: S("Aprovada", "info", "check"),
    REJECTED: S("Recusada", "danger", "x"),
    CANCELLED: S("Cancelada", "neutral", "x"),
    PARTIALLY_ORDERED: S("Pedido parcial", "info", "progress"),
    ORDERED: S("Pedida", "info"),
    COMPLETED: S("Concluída", "success", "check"),
  },
  purchase_quotes: {
    DRAFT: S("Rascunho", "neutral"),
    SENT: S("Enviada", "info"),
    CLOSED: S("Encerrada", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  purchase_orders: {
    DRAFT: S("Rascunho", "neutral"),
    PENDING_APPROVAL: S("Aguardando aprovação", "warning", "clock"),
    APPROVED: S("Aprovado", "info", "check"),
    SENT: S("Enviado", "info"),
    PARTIALLY_RECEIVED: S("Recebido parcial", "warning", "progress"),
    RECEIVED: S("Recebido", "success", "check"),
    CLOSED: S("Encerrado", "neutral", "check"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  purchase_receipts: {
    DRAFT: S("Rascunho", "neutral"),
    CONFIRMED: S("Confirmado", "success", "check"),
    REJECTED: S("Recusado", "danger", "x"),
  },
  shipments: {
    DRAFT: S("Rascunho", "neutral"),
    READY: S("Liberada", "info"),
    PICKING: S("Em separação", "info", "progress"),
    PACKED: S("Embalada", "info"),
    READY_TO_SHIP: S("Pronta p/ expedir", "info"),
    SHIPPED: S("Expedida", "info", "progress"),
    IN_TRANSIT: S("Em trânsito", "info", "progress"),
    DELIVERED: S("Entregue", "success", "check"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  delivery_events: {
    OUT_FOR_DELIVERY: S("Saiu p/ entrega", "info", "progress"),
    DELIVERED: S("Entregue", "success", "check"),
    FAILED: S("Falha na entrega", "danger", "alert"),
    REFUSED: S("Recusada", "danger", "x"),
    ABSENT: S("Destinatário ausente", "warning", "alert"),
    RETURNED: S("Devolvida", "warning"),
  },
  pick_lists: {
    PENDING: S("Pendente", "warning", "clock"),
    IN_PROGRESS: S("Separando", "info", "progress"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  stock_transfers: {
    DRAFT: S("Rascunho", "neutral"),
    IN_TRANSIT: S("Em trânsito", "info", "progress"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  stock_counts: {
    COUNTING: S("Em contagem", "info", "progress"),
    CLOSED: S("Encerrada", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  material_requests: {
    REQUESTED: S("Solicitada", "warning", "clock"),
    DELIVERED: S("Entregue", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  production_orders: {
    DRAFT: S("Rascunho", "neutral"),
    PLANNED: S("Planejada", "info"),
    RELEASED: S("Liberada", "info"),
    MATERIALS_RESERVED: S("Materiais reservados", "info"),
    IN_PROGRESS: S("Em produção", "info", "progress"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
    ON_HOLD: S("Em espera", "warning", "pause"),
  },
  product_boms: {
    DRAFT: S("Rascunho", "neutral"),
    ACTIVE: S("Vigente", "success", "dot"),
    OBSOLETE: S("Obsoleta", "neutral"),
  },
  accounts_payable: {
    OPEN: S("Em aberto", "info"),
    PARTIALLY_PAID: S("Pago parcial", "warning", "progress"),
    PAID: S("Pago", "success", "check"),
    OVERDUE: S("Vencido", "danger", "alert"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  accounts_receivable: {
    OPEN: S("Em aberto", "info"),
    PARTIALLY_RECEIVED: S("Recebido parcial", "warning", "progress"),
    RECEIVED: S("Recebido", "success", "check"),
    OVERDUE: S("Vencido", "danger", "alert"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  fiscal_documents: {
    DRAFT: S("Rascunho", "neutral"),
    CALCULATED: S("Calculada", "info"),
    READY: S("Pronta", "info"),
    AUTHORIZING: S("Autorizando", "warning", "progress"),
    AUTHORIZED: S("Autorizada", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
    DENIED: S("Denegada", "critical", "alert"),
    REJECTED: S("Rejeitada", "danger", "x"),
    CONTINGENCY: S("Contingência", "warning", "alert"),
  },
  tax_rules: {
    DRAFT: S("Rascunho", "neutral"),
    ACTIVE: S("Vigente", "success", "dot"),
    INACTIVE: S("Inativa", "neutral"),
  },
  leads: {
    NEW: S("Novo", "info"),
    CONTACTED: S("Contatado", "info", "progress"),
    QUALIFIED: S("Qualificado", "success", "check"),
    DISQUALIFIED: S("Desqualificado", "neutral", "x"),
    CONVERTED: S("Convertido", "success", "check"),
  },
  opportunities: {
    OPEN: S("Aberta", "info"),
    WON: S("Ganha", "success", "check"),
    LOST: S("Perdida", "danger", "x"),
  },
  activities: {
    PENDING: S("Pendente", "warning", "clock"),
    DONE: S("Realizada", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  assets: {
    ACTIVE: S("Em operação", "success", "dot"),
    INACTIVE: S("Inativo", "neutral"),
    UNDER_MAINTENANCE: S("Em manutenção", "warning", "progress"),
    DECOMMISSIONED: S("Baixado", "neutral", "x"),
  },
  maintenance_orders: {
    OPEN: S("Aberta", "info"),
    PLANNED: S("Planejada", "info"),
    IN_PROGRESS: S("Em execução", "info", "progress"),
    WAITING_PARTS: S("Aguardando peças", "warning", "clock"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  nonconformities: {
    OPEN: S("Aberta", "danger", "alert"),
    IN_ANALYSIS: S("Em análise", "warning", "progress"),
    IN_TREATMENT: S("Em tratamento", "info", "progress"),
    CLOSED: S("Encerrada", "success", "check"),
  },
  quality_inspections: {
    PENDING: S("Pendente", "warning", "clock"),
    IN_PROGRESS: S("Em inspeção", "info", "progress"),
    APPROVED: S("Aprovada", "success", "check"),
    REJECTED: S("Reprovada", "danger", "x"),
    PARTIALLY_APPROVED: S("Aprovada parcial", "warning"),
  },
  quality_actions: {
    OPEN: S("Aberta", "info"),
    IN_PROGRESS: S("Em execução", "info", "progress"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  projects: {
    PLANNING: S("Planejamento", "neutral"),
    IN_PROGRESS: S("Em andamento", "info", "progress"),
    ON_HOLD: S("Pausado", "warning", "pause"),
    COMPLETED: S("Concluído", "success", "check"),
    CANCELLED: S("Cancelado", "neutral", "x"),
  },
  project_tasks: {
    OPEN: S("Aberta", "info"),
    IN_PROGRESS: S("Em andamento", "info", "progress"),
    BLOCKED: S("Bloqueada", "critical", "alert"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  service_orders: {
    OPEN: S("Aberta", "info"),
    SCHEDULED: S("Agendada", "info"),
    IN_PROGRESS: S("Em execução", "info", "progress"),
    WAITING: S("Aguardando", "warning", "clock"),
    COMPLETED: S("Concluída", "success", "check"),
    CANCELLED: S("Cancelada", "neutral", "x"),
  },
  company_lifecycle: {
    TRIAL: S("Avaliação", "info"),
    ACTIVE: S("Ativa", "success", "dot"),
    SUSPENDED: S("Suspensa", "warning", "pause"),
    CANCELLED: S("Cancelada", "critical", "x"),
  },
  platform_role: {
    OWNER: S("Owner", "critical"),
    ADMIN: S("Admin", "neutral"),
  },
  audit_action: {
    CREATE: S("Criação", "success"),
    UPDATE: S("Alteração", "info"),
    DELETE: S("Exclusão", "danger"),
    ACTIVATE: S("Ativação", "success"),
    INACTIVATE: S("Inativação", "neutral"),
    GRANT: S("Concessão", "warning"),
    REVOKE: S("Revogação", "warning"),
    ASSIGN: S("Atribuição", "warning"),
    UNASSIGN: S("Remoção", "warning"),
    ENABLE: S("Habilitação", "success"),
    DISABLE: S("Desabilitação", "neutral"),
    SUSPEND: S("Suspensão", "critical"),
    RESUME: S("Reativação", "success"),
    CONFIGURE: S("Configuração", "info"),
    EXPORT: S("Exportação", "info"),
  },
} satisfies Record<string, Record<string, StatusMeta>>;

export type StatusEntity = keyof typeof STATUS_REGISTRY;

function humanize(code: string): string {
  const text = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return text ? text[0].toUpperCase() + text.slice(1) : "—";
}

export function statusMeta(entity: StatusEntity | undefined, code: string | null | undefined): StatusMeta {
  if (code === null || code === undefined || code === "") return S("—", "neutral");
  const key = String(code).trim().toUpperCase().replace(/\s+/g, "_");
  const table = entity ? (STATUS_REGISTRY[entity] as Record<string, StatusMeta>) : undefined;
  return table?.[key] ?? GENERIC[key] ?? S(humanize(String(code)), "neutral");
}

// Tabelas cujo CHECK usa códigos minúsculos (o registro guarda tudo em
// maiúsculas só para a busca). Necessário para enviar o código EXATO
// como filtro à API.
const LOWERCASE_CODES = new Set<StatusEntity>([
  "sales_orders",
  "sales_quotes",
  "purchase_requests",
  "purchase_quotes",
  "purchase_orders",
  "purchase_receipts",
  "shipments",
  "delivery_events",
  "pick_lists",
  "stock_transfers",
  "stock_counts",
  "material_requests",
  "production_orders",
  "product_boms",
  "tax_rules",
]);

export function dbStatusCode(entity: StatusEntity, key: string): string {
  return LOWERCASE_CODES.has(entity) ? key.toLowerCase() : key.toUpperCase();
}

/** Códigos declarados de uma entidade — base para filtros por status. */
export function statusOptions(entity: StatusEntity): Array<{ value: string; label: string }> {
  return Object.entries(STATUS_REGISTRY[entity] as Record<string, StatusMeta>).map(([code, meta]) => ({
    value: dbStatusCode(entity, code),
    label: meta.label,
  }));
}
