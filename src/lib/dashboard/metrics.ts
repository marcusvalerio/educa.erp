import { formatCurrencyBRL, formatInteger, formatPercent, percentChange } from "@/lib/format";

// Métricas por relatório (fn_report_*). Cada uma declara formato, o
// sentido de "bom" (receita subir é bom; atraso subir é ruim) e o destino
// de drill-down. Só aparecem para quem tem a permissão do relatório.

export type MetricFormat = "money" | "int" | "pct" | "days" | "qty";
export type Metric = {
  key: string;
  label: string;
  format: MetricFormat;
  goodWhen?: "up" | "down";
  href?: string;
  /** Saldo/posição (não é fluxo do período): comparação ainda é real, mas lê-se como "variação da posição". */
  position?: boolean;
};

export type ReportDef = {
  id: string;
  label: string;
  endpoint: string;
  permission: string;
  module: string;
  metrics: Metric[];
};

export const REPORTS: Record<string, ReportDef> = {
  executive: {
    id: "executive",
    label: "Executivo",
    endpoint: "/api/reports/executive",
    permission: "reports.view",
    module: "core",
    metrics: [
      { key: "net_revenue", label: "Receita líquida", format: "money", goodWhen: "up", href: "/comercial/faturamento" },
      { key: "gross_margin_pct", label: "Margem bruta", format: "pct", goodWhen: "up", href: "/gestao/dashboard/controladoria" },
      { key: "managerial_result", label: "Resultado gerencial", format: "money", goodWhen: "up", href: "/gestao/dashboard/controladoria" },
      { key: "cash_balance", label: "Saldo em caixa", format: "money", goodWhen: "up", href: "/financeiro/fluxo-caixa", position: true },
      { key: "accounts_receivable_open", label: "A receber em aberto", format: "money", goodWhen: "down", href: "/financeiro/contas-receber?view=abertos", position: true },
      { key: "accounts_payable_open", label: "A pagar em aberto", format: "money", goodWhen: "down", href: "/financeiro/contas-pagar?view=abertos", position: true },
      { key: "inventory_value", label: "Valor em estoque", format: "money", href: "/logistica/estoque", position: true },
      { key: "open_sales_orders", label: "Pedidos em aberto", format: "int", href: "/comercial/pedidos-venda?view=em-andamento", position: true },
      { key: "open_shipments", label: "Expedições em aberto", format: "int", href: "/logistica/expedicao", position: true },
      { key: "open_production_orders", label: "OPs em aberto", format: "int", href: "/producao/ordens", position: true },
      { key: "operating_expenses", label: "Despesas operacionais", format: "money", goodWhen: "down" },
      { key: "cmv", label: "CMV", format: "money", goodWhen: "down" },
    ],
  },
  commercial: {
    id: "commercial",
    label: "Comercial",
    endpoint: "/api/reports/commercial",
    permission: "commercial_reports.view",
    module: "comercial",
    metrics: [
      { key: "orders_amount", label: "Valor em pedidos", format: "money", goodWhen: "up", href: "/comercial/pedidos-venda" },
      { key: "orders_count", label: "Pedidos", format: "int", goodWhen: "up", href: "/comercial/pedidos-venda" },
      { key: "average_ticket", label: "Ticket médio", format: "money", goodWhen: "up" },
      { key: "customers_count", label: "Clientes atendidos", format: "int", goodWhen: "up", href: "/cadastros/clientes" },
      { key: "quote_conversion_pct", label: "Conversão de orçamentos", format: "pct", goodWhen: "up", href: "/comercial/orcamentos" },
      { key: "pending_orders", label: "Pedidos pendentes", format: "int", goodWhen: "down", href: "/comercial/pedidos-venda?view=aprovacao" },
      { key: "cancelled_orders", label: "Pedidos cancelados", format: "int", goodWhen: "down", href: "/comercial/pedidos-venda?status=cancelled" },
    ],
  },
  purchases: {
    id: "purchases",
    label: "Compras",
    endpoint: "/api/reports/purchases",
    permission: "purchase_reports.view",
    module: "compras",
    metrics: [
      { key: "orders_amount", label: "Valor comprado", format: "money", href: "/suprimentos/pedidos-compra" },
      { key: "orders_count", label: "Pedidos de compra", format: "int", href: "/suprimentos/pedidos-compra" },
      { key: "requests_count", label: "Solicitações", format: "int", href: "/suprimentos/solicitacao-compra" },
      { key: "receipts_amount", label: "Valor recebido", format: "money", href: "/logistica/recebimento" },
      { key: "receipts_count", label: "Recebimentos", format: "int", href: "/logistica/recebimento" },
      { key: "divergent_receipt_items", label: "Itens com divergência", format: "int", goodWhen: "down", href: "/logistica/recebimento" },
      { key: "suppliers_count", label: "Fornecedores ativos no período", format: "int" },
    ],
  },
  inventory: {
    id: "inventory",
    label: "Estoque",
    endpoint: "/api/reports/inventory",
    permission: "inventory_reports.view",
    module: "estoque",
    metrics: [
      { key: "total_value", label: "Valor em estoque", format: "money", href: "/logistica/estoque", position: true },
      { key: "total_quantity", label: "Quantidade total", format: "qty", href: "/logistica/estoque", position: true },
      { key: "receipts_count", label: "Entradas", format: "int", href: "/logistica/movimentacoes?movement_type=RECEIPT" },
      { key: "issues_count", label: "Saídas", format: "int", href: "/logistica/movimentacoes?movement_type=ISSUE" },
      { key: "transfers_count", label: "Transferências", format: "int", href: "/logistica/transferencias" },
      { key: "adjustments_count", label: "Ajustes", format: "int", goodWhen: "down", href: "/logistica/movimentacoes" },
      { key: "reservations_active", label: "Reservas ativas", format: "int", position: true },
      { key: "products_without_movement", label: "Produtos sem giro", format: "int", goodWhen: "down", href: "/cadastros/produtos" },
    ],
  },
  logistics: {
    id: "logistics",
    label: "Logística",
    endpoint: "/api/reports/logistics",
    permission: "logistics_reports.view",
    module: "logistica",
    metrics: [
      { key: "shipments_count", label: "Expedições", format: "int", href: "/logistica/expedicao" },
      { key: "delivered_count", label: "Entregues", format: "int", goodWhen: "up", href: "/logistica/transportes?view=entregues" },
      { key: "in_transit_count", label: "Em trânsito", format: "int", href: "/logistica/transportes?view=transito" },
      { key: "failed_count", label: "Falhas de entrega", format: "int", goodWhen: "down", href: "/logistica/transportes" },
      { key: "pick_lists_count", label: "Listas de separação", format: "int", href: "/logistica/picking" },
      { key: "average_lead_time_days", label: "Lead time médio", format: "days", goodWhen: "down" },
    ],
  },
  production: {
    id: "production",
    label: "Produção",
    endpoint: "/api/reports/production",
    permission: "production_reports.view",
    module: "producao",
    metrics: [
      { key: "orders_count", label: "OPs no período", format: "int", href: "/producao/ordens" },
      { key: "in_progress_orders", label: "Em produção", format: "int", href: "/producao/ordens?view=producao" },
      { key: "completed_orders", label: "Concluídas", format: "int", goodWhen: "up", href: "/producao/ordens?status=completed" },
      { key: "produced_quantity", label: "Quantidade produzida", format: "qty", goodWhen: "up" },
      { key: "scrap_quantity", label: "Refugo", format: "qty", goodWhen: "down" },
      { key: "consumed_material_cost", label: "Custo de material consumido", format: "money" },
      { key: "cancelled_orders", label: "Canceladas", format: "int", goodWhen: "down" },
    ],
  },
  finance: {
    id: "finance",
    label: "Financeiro",
    endpoint: "/api/reports/finance",
    permission: "financial_reports.view",
    module: "financeiro",
    metrics: [
      { key: "cash_balance", label: "Saldo em caixa", format: "money", goodWhen: "up", href: "/financeiro/fluxo-caixa", position: true },
      { key: "received_in_period", label: "Recebido no período", format: "money", goodWhen: "up", href: "/financeiro/contas-receber" },
      { key: "paid_in_period", label: "Pago no período", format: "money", href: "/financeiro/contas-pagar" },
      { key: "overdue_receivable", label: "Recebíveis vencidos", format: "money", goodWhen: "down", href: "/financeiro/contas-receber?view=atrasados", position: true },
      { key: "overdue_payable", label: "Pagamentos vencidos", format: "money", goodWhen: "down", href: "/financeiro/contas-pagar?view=atrasados", position: true },
      { key: "accounts_receivable_open", label: "A receber em aberto", format: "money", href: "/financeiro/contas-receber?view=abertos", position: true },
      { key: "accounts_payable_open", label: "A pagar em aberto", format: "money", href: "/financeiro/contas-pagar?view=abertos", position: true },
    ],
  },
  fiscal: {
    id: "fiscal",
    label: "Fiscal",
    endpoint: "/api/reports/fiscal",
    permission: "fiscal_reports.view",
    module: "fiscal",
    metrics: [
      { key: "documents_count", label: "Documentos", format: "int", href: "/fiscal/notas-fiscais" },
      { key: "authorized_count", label: "Autorizados", format: "int", goodWhen: "up", href: "/fiscal/notas-fiscais?status=AUTHORIZED" },
      { key: "pending_count", label: "Pendentes", format: "int", goodWhen: "down", href: "/fiscal/notas-fiscais?view=pendentes" },
      { key: "rejected_count", label: "Rejeitados", format: "int", goodWhen: "down", href: "/fiscal/notas-fiscais?view=rejeitadas" },
      { key: "cancelled_count", label: "Cancelados", format: "int", goodWhen: "down" },
      { key: "taxes_amount", label: "Tributos destacados", format: "money" },
      { key: "saidas_count", label: "Saídas", format: "int" },
      { key: "entradas_count", label: "Entradas", format: "int" },
    ],
  },
  controlling: {
    id: "controlling",
    label: "Controladoria",
    endpoint: "/api/controlling/kpis",
    permission: "controlling.view",
    module: "controladoria",
    metrics: [
      { key: "net_revenue", label: "Receita líquida", format: "money", goodWhen: "up" },
      { key: "gross_profit", label: "Lucro bruto", format: "money", goodWhen: "up" },
      { key: "gross_margin_pct", label: "Margem bruta", format: "pct", goodWhen: "up" },
      { key: "operating_result", label: "Resultado operacional", format: "money", goodWhen: "up" },
      { key: "managerial_result", label: "Resultado gerencial", format: "money", goodWhen: "up" },
      { key: "financial_result", label: "Resultado financeiro", format: "money", goodWhen: "up" },
      { key: "operating_expenses", label: "Despesas operacionais", format: "money", goodWhen: "down" },
      { key: "average_ticket", label: "Ticket médio", format: "money", goodWhen: "up" },
    ],
  },
};

export function formatMetric(value: unknown, format: MetricFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  switch (format) {
    case "money":
      return formatCurrencyBRL(n);
    case "int":
      return formatInteger(Math.round(n));
    case "pct":
      return formatPercent(n);
    case "days":
      return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} d`;
    case "qty":
      return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}

export type MetricChange = { metric: Metric; current: number; previous: number; pct: number | null; good: boolean | null };

/**
 * Maiores mudanças reais entre períodos, ordenadas por magnitude. Métricas
 * sem base (anterior zero) ficam no fim; sem variação não entram.
 */
export function biggestChanges(metrics: Metric[], current: Record<string, unknown> | null, previous: Record<string, unknown> | null, limit = 6): MetricChange[] {
  if (!current || !previous) return [];
  const rows: MetricChange[] = [];
  for (const metric of metrics) {
    const c = Number(current[metric.key]);
    const p = Number(previous[metric.key]);
    if (Number.isNaN(c) || Number.isNaN(p) || current[metric.key] === null || previous[metric.key] === null) continue;
    if (c === p) continue;
    const pct = percentChange(c, p);
    const good = metric.goodWhen ? (metric.goodWhen === "up" ? c > p : c < p) : null;
    rows.push({ metric, current: c, previous: p, pct, good });
  }
  return rows
    .sort((a, b) => (b.pct === null ? -1 : Math.abs(b.pct)) - (a.pct === null ? -1 : Math.abs(a.pct)))
    .slice(0, limit);
}
