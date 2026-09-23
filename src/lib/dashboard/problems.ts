import { isOverdue } from "@/lib/list/query";

// Detectores de PROBLEMAS do centro operacional (lógica pura, testada).
//
// Cada detector declara: a permissão que a fonte exige, a coleção real
// que ele lê, como conta (e soma, quando há valor financeiro) e ONDE o
// usuário age — o link já leva à lista filtrada (drill-down). Nada é
// estimado: sem permissão, o detector não roda; sem dados, conta zero.

export type Severity = "warning" | "danger" | "critical";

type AnyRow = Record<string, unknown>;

export type ProblemDef = {
  id: string;
  /** Código do módulo da plataforma (para foco por setor/cargo). */
  module: string;
  label: string;
  /** Frase curta explicando o problema. */
  hint: string;
  severity: Severity;
  permission: string;
  source: string;
  compute: (rows: AnyRow[], today: Date) => { count: number; amount?: number };
  href: string;
};

const up = (v: unknown) => String(v ?? "").toUpperCase();
const inSet = (row: AnyRow, statuses: string[]) => statuses.map((s) => s.toUpperCase()).includes(up(row.status));
const sum = (rows: AnyRow[], key: string) => rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

function overdue(dateKey: string, open: string[]) {
  return (rows: AnyRow[], today: Date) => {
    const hits = rows.filter((row) => inSet(row, open) && isOverdue(row[dateKey] as string | null, today));
    return { count: hits.length };
  };
}

function overdueAmount(dateKey: string, open: string[], amountKey: string) {
  return (rows: AnyRow[], today: Date) => {
    const hits = rows.filter((row) => inSet(row, open) && isOverdue(row[dateKey] as string | null, today));
    return { count: hits.length, amount: sum(hits, amountKey) };
  };
}

function byStatus(statuses: string[]) {
  return (rows: AnyRow[]) => ({ count: rows.filter((row) => inSet(row, statuses)).length });
}

export const SO_OPEN = ["pending_approval", "approved", "reservation_pending", "reserved", "picking", "ready_to_ship", "partially_shipped"];

export const PROBLEMS: ProblemDef[] = [
  {
    id: "sales-late",
    module: "comercial",
    label: "Pedidos de venda com entrega atrasada",
    hint: "Entrega prevista vencida e pedido ainda não expedido por completo.",
    severity: "danger",
    permission: "sales_orders.view",
    source: "/api/sales-orders",
    compute: overdueAmount("expected_delivery_at", SO_OPEN, "total_amount"),
    href: "/comercial/pedidos-venda?view=atrasados",
  },
  {
    id: "sales-approval",
    module: "comercial",
    label: "Pedidos de venda aguardando aprovação",
    hint: "Pedidos parados até uma decisão de aprovação.",
    severity: "warning",
    permission: "sales_orders.view",
    source: "/api/sales-orders",
    compute: (rows) => {
      const hits = rows.filter((row) => inSet(row, ["pending_approval"]));
      return { count: hits.length, amount: sum(hits, "total_amount") };
    },
    href: "/comercial/pedidos-venda?view=aprovacao",
  },
  {
    id: "quotes-expired",
    module: "comercial",
    label: "Orçamentos com validade vencida",
    hint: "Propostas enviadas cuja validade passou sem resposta.",
    severity: "warning",
    permission: "sales_quotes.view",
    source: "/api/sales-quotes",
    compute: overdue("valid_until", ["draft", "sent"]),
    href: "/comercial/orcamentos?view=atrasados",
  },
  {
    id: "payables-overdue",
    module: "financeiro",
    label: "Contas a pagar vencidas",
    hint: "Títulos com vencimento passado ainda em aberto.",
    severity: "danger",
    permission: "accounts_payable.view",
    source: "/api/accounts-payable",
    compute: overdueAmount("due_date", ["OPEN", "PARTIALLY_PAID", "OVERDUE"], "updated_amount"),
    href: "/financeiro/contas-pagar?view=atrasados",
  },
  {
    id: "receivables-overdue",
    module: "financeiro",
    label: "Contas a receber vencidas",
    hint: "Recebíveis com vencimento passado ainda em aberto.",
    severity: "danger",
    permission: "accounts_receivable.view",
    source: "/api/accounts-receivable",
    compute: overdueAmount("due_date", ["OPEN", "PARTIALLY_RECEIVED", "OVERDUE"], "updated_amount"),
    href: "/financeiro/contas-receber?view=atrasados",
  },
  {
    id: "purchase-late",
    module: "compras",
    label: "Pedidos de compra com entrega atrasada",
    hint: "Fornecedor não entregou na data prevista.",
    severity: "danger",
    permission: "purchase_orders.view",
    source: "/api/purchase-orders",
    compute: overdueAmount("expected_delivery_at", ["approved", "sent", "partially_received"], "total_amount"),
    href: "/suprimentos/pedidos-compra?view=atrasados",
  },
  {
    id: "purchase-requests-approval",
    module: "compras",
    label: "Solicitações de compra aguardando aprovação",
    hint: "Necessidades internas paradas antes da cotação.",
    severity: "warning",
    permission: "purchase_requests.view",
    source: "/api/purchase-requests",
    compute: byStatus(["requested"]),
    href: "/suprimentos/solicitacao-compra?view=aprovacao",
  },
  {
    id: "receipts-pending",
    module: "compras",
    label: "Recebimentos em conferência",
    hint: "Mercadoria recebida ainda não confirmada no estoque.",
    severity: "warning",
    permission: "purchase_receipts.view",
    source: "/api/purchase-receipts",
    compute: byStatus(["draft"]),
    href: "/logistica/recebimento?view=conferencia",
  },
  {
    id: "shipments-late",
    module: "logistica",
    label: "Expedições atrasadas",
    hint: "Data prevista de expedição vencida sem despacho.",
    severity: "danger",
    permission: "shipments.view",
    source: "/api/shipments",
    compute: overdue("expected_ship_date", ["draft", "ready", "picking", "packed", "ready_to_ship"]),
    href: "/logistica/expedicao?view=atrasados",
  },
  {
    id: "stock-unavailable",
    module: "estoque",
    label: "Saldos sem disponibilidade",
    hint: "Produto/local com disponível zerado ou negativo.",
    severity: "warning",
    permission: "stock.view",
    source: "/api/stock-balances",
    compute: (rows) => ({ count: rows.filter((row) => Number(row.available) <= 0).length }),
    href: "/logistica/estoque?view=sem-disponivel",
  },
  {
    id: "material-requests",
    module: "estoque",
    label: "Requisições de almoxarifado pendentes",
    hint: "Material solicitado ainda não entregue.",
    severity: "warning",
    permission: "stock.view",
    source: "/api/material-requests",
    compute: byStatus(["requested"]),
    href: "/logistica/almoxarifado?view=pendentes",
  },
  {
    id: "production-late",
    module: "producao",
    label: "Ordens de produção atrasadas",
    hint: "Data planejada vencida sem conclusão.",
    severity: "danger",
    permission: "production_orders.view",
    source: "/api/production-orders",
    compute: overdue("planned_date", ["planned", "released", "materials_reserved", "in_progress", "on_hold"]),
    href: "/producao/ordens?view=atrasados",
  },
  {
    id: "fiscal-rejected",
    module: "fiscal",
    label: "Documentos fiscais rejeitados ou denegados",
    hint: "Exigem correção e nova transmissão.",
    severity: "critical",
    permission: "fiscal_documents.view",
    source: "/api/fiscal-documents",
    compute: (rows) => {
      const hits = rows.filter((row) => inSet(row, ["REJECTED", "DENIED"]));
      return { count: hits.length, amount: sum(hits, "total_amount") };
    },
    href: "/fiscal/notas-fiscais?view=rejeitadas",
  },
  {
    id: "nonconformities-open",
    module: "qualidade",
    label: "Não conformidades graves em aberto",
    hint: "Severidade alta ou crítica ainda sem encerramento.",
    severity: "critical",
    permission: "nonconformities.view",
    source: "/api/nonconformities",
    compute: (rows) => ({
      count: rows.filter((row) => inSet(row, ["OPEN", "IN_ANALYSIS", "IN_TREATMENT"]) && ["HIGH", "CRITICAL"].includes(up(row.severity))).length,
    }),
    href: "/qualidade/nao-conformidades?view=abertas",
  },
  {
    id: "maintenance-late",
    module: "manutencao",
    label: "Ordens de manutenção atrasadas",
    hint: "Programadas para data passada e ainda não iniciadas/concluídas.",
    severity: "danger",
    permission: "maintenance_orders.view",
    source: "/api/maintenance-orders",
    compute: overdue("scheduled_date", ["OPEN", "PLANNED", "WAITING_PARTS"]),
    href: "/ativos/ordens-manutencao?view=atrasados",
  },
  {
    id: "service-orders-late",
    module: "projetos",
    label: "Ordens de serviço atrasadas",
    hint: "Programadas para data passada e ainda em aberto.",
    severity: "warning",
    permission: "service_orders.view",
    source: "/api/service-orders",
    compute: overdue("scheduled_date", ["OPEN", "SCHEDULED", "WAITING"]),
    href: "/projetos/ordens-servico?view=atrasados",
  },
  {
    id: "tasks-blocked",
    module: "projetos",
    label: "Tarefas de projeto bloqueadas",
    hint: "Tarefas impedidas de avançar.",
    severity: "warning",
    permission: "project_tasks.view",
    source: "/api/project-tasks",
    compute: byStatus(["BLOCKED"]),
    href: "/projetos/tarefas?view=bloqueadas",
  },
  {
    id: "activities-late",
    module: "crm",
    label: "Atividades comerciais atrasadas",
    hint: "Follow-ups e tarefas de CRM com prazo vencido.",
    severity: "warning",
    permission: "activities.view",
    source: "/api/activities",
    compute: overdue("due_date", ["PENDING"]),
    href: "/crm/atividades?view=atrasados",
  },
];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, danger: 1, warning: 2 };

export type ProblemResult = ProblemDef & { count: number; amount?: number };

/**
 * Ordena problemas: severidade -> foco do contexto do usuário (módulos
 * priorizados pelo dashboard context) -> volume. Zeros ficam de fora.
 */
export function rankProblems(results: ProblemResult[], focusModules: string[]): ProblemResult[] {
  const focusIndex = (module: string) => {
    const i = focusModules.indexOf(module);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return results
    .filter((r) => r.count > 0)
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || focusIndex(a.module) - focusIndex(b.module) || b.count - a.count
    );
}
