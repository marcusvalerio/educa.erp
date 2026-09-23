"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/Feedback";
import { NoAccess } from "@/components/shell/ShellFrame";
import { useSession } from "@/components/shell/SessionProvider";
import { ERP_NAV } from "@/lib/nav";
import { canAccess } from "@/lib/navigation/access";
import { REPORTS, type ReportDef } from "@/lib/dashboard/metrics";
import { useCached } from "@/lib/dashboard/client";
import type { DateRange } from "@/lib/dashboard/periods";
import { formatInteger } from "@/lib/format";
import { DashboardHeader, FocusPanel, usePeriod } from "./Context";
import { ChangesPanel, SummaryStrip } from "./ReportBlocks";
import { ProblemsPanel } from "./Problems";
import { AgingBuckets, CommercialFunnel, DailyHeatmap, ErpFlows, MonthlyTrend, StatusDistribution, TopRanking } from "./Insights";

// Painéis contextuais por área. Todos seguem a mesma leitura:
// CONTEXTO → RESUMO → MUDANÇAS/PROBLEMAS → OPERAÇÕES (fluxo) →
// INVESTIGAÇÃO → AÇÃO. Cada bloco só aparece se o usuário puder ler a
// fonte dele — o banco continua decidindo o que volta.

type FlowId = "venda" | "compra" | "producao";

export type AreaId =
  | "executivo"
  | "comercial"
  | "compras"
  | "estoque"
  | "logistica"
  | "producao"
  | "financeiro"
  | "fiscal"
  | "controladoria"
  | "qualidade"
  | "manutencao"
  | "operacoes"
  | "ti";

type AreaDef = {
  title: string;
  description: string;
  /** Permissão(ões) de entrada — espelha o item de navegação. */
  permission: string | string[];
  report?: ReportDef;
  summaryKeys?: string[];
  /** Módulos cujos detectores de problema aparecem aqui. */
  problemModules?: string[];
  flows?: FlowId[];
  /** Seções de navegação oferecidas em "Onde agir". */
  sections: string[];
  insights?: (range: DateRange) => ReactNode;
};

const SO_OPEN_GROUPS = [
  { label: "Aguardando aprovação", statuses: ["draft", "pending_approval"], tone: "warning" as const, href: "/comercial/pedidos-venda?view=aprovacao" },
  { label: "Em reserva", statuses: ["approved", "reservation_pending", "reserved"], tone: "neutral" as const, href: "/comercial/pedidos-venda?view=em-andamento" },
  { label: "Em separação", statuses: ["picking", "ready_to_ship"], tone: "info" as const, href: "/logistica/picking" },
  { label: "Expedidos", statuses: ["partially_shipped", "shipped"], tone: "accent" as const, href: "/logistica/expedicao" },
  { label: "Concluídos", statuses: ["completed"], tone: "success" as const, href: "/comercial/pedidos-venda?status=completed" },
  { label: "Cancelados", statuses: ["cancelled"], tone: "danger" as const, href: "/comercial/pedidos-venda?status=cancelled" },
];

const PO_GROUPS = [
  { label: "Em aprovação", statuses: ["draft", "pending_approval"], tone: "warning" as const, href: "/suprimentos/pedidos-compra?view=aprovacao" },
  { label: "Aprovados / enviados", statuses: ["approved", "sent"], tone: "neutral" as const, href: "/suprimentos/pedidos-compra" },
  { label: "Recebimento parcial", statuses: ["partially_received"], tone: "info" as const, href: "/logistica/recebimento" },
  { label: "Recebidos / fechados", statuses: ["received", "closed"], tone: "success" as const },
  { label: "Cancelados", statuses: ["cancelled"], tone: "danger" as const },
];

const SHIPMENT_GROUPS = [
  { label: "Em preparação", statuses: ["draft", "ready", "picking", "packed"], tone: "neutral" as const, href: "/logistica/expedicao" },
  { label: "Prontas para sair", statuses: ["ready_to_ship"], tone: "info" as const, href: "/logistica/expedicao" },
  { label: "Em trânsito", statuses: ["shipped", "in_transit"], tone: "warning" as const, href: "/logistica/transportes?view=transito" },
  { label: "Entregues", statuses: ["delivered", "completed"], tone: "success" as const, href: "/logistica/transportes?view=entregues" },
  { label: "Canceladas", statuses: ["cancelled"], tone: "danger" as const },
];

const PRODUCTION_GROUPS = [
  { label: "Planejadas", statuses: ["draft", "planned"], tone: "neutral" as const, href: "/producao/ordens" },
  { label: "Liberadas", statuses: ["released", "materials_reserved"], tone: "info" as const, href: "/producao/ordens" },
  { label: "Em produção", statuses: ["in_progress"], tone: "accent" as const, href: "/producao/ordens?view=producao" },
  { label: "Suspensas", statuses: ["on_hold"], tone: "warning" as const, href: "/producao/ordens?view=espera" },
  { label: "Concluídas", statuses: ["completed"], tone: "success" as const, href: "/producao/ordens?status=completed" },
  { label: "Canceladas", statuses: ["cancelled"], tone: "danger" as const },
];

const RECEIVABLE_OPEN = ["OPEN", "PARTIALLY_RECEIVED", "OVERDUE"];
const PAYABLE_OPEN = ["OPEN", "PARTIALLY_PAID", "OVERDUE"];

export const AREAS: Record<AreaId, AreaDef> = {
  executivo: {
    title: "Painel executivo",
    description: "Visão consolidada da empresa: resultado, caixa, carteira e o que está travando a operação.",
    permission: "reports.view",
    report: REPORTS.executive,
    summaryKeys: ["net_revenue", "gross_margin_pct", "managerial_result", "cash_balance", "accounts_receivable_open", "accounts_payable_open", "open_sales_orders", "inventory_value"],
    flows: ["venda", "compra", "producao"],
    sections: ["comercial", "financeiro", "logistica", "gestao"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.executive} metricKey="net_revenue" title="Receita líquida por mês" />
        <AgingBuckets title="Carteira a receber por vencimento" source="/api/accounts-receivable" permission="accounts_receivable.view" dueKey="due_date" amountKey="updated_amount" openStatuses={RECEIVABLE_OPEN} href="/financeiro/contas-receber" />
        <StatusDistribution title="Pedidos de venda do período por situação" source="/api/sales-orders" permission="sales_orders.view" groups={SO_OPEN_GROUPS} dateKey="order_date" range={range} />
        <TopRanking title="Maiores clientes no período" description="Valor em pedidos não cancelados." source="/api/sales-orders" permission="sales_orders.view" groupKey="customer_id" valueKey="total_amount" lookupPath="/api/customers?pageSize=500" lookupField="nome" dateKey="order_date" range={range} excludeStatuses={["cancelled"]} />
      </>
    ),
  },
  comercial: {
    title: "Painel comercial",
    description: "Pedidos, conversão, clientes e o avanço da carteira até a expedição.",
    permission: "commercial_reports.view",
    report: REPORTS.commercial,
    summaryKeys: ["orders_amount", "orders_count", "average_ticket", "quote_conversion_pct"],
    problemModules: ["comercial", "crm"],
    flows: ["venda"],
    sections: ["comercial", "crm"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.commercial} metricKey="orders_amount" title="Valor em pedidos por mês" />
        <CommercialFunnel range={range} />
        <TopRanking title="Maiores clientes no período" description="Valor em pedidos não cancelados." source="/api/sales-orders" permission="sales_orders.view" groupKey="customer_id" valueKey="total_amount" lookupPath="/api/customers?pageSize=500" lookupField="nome" dateKey="order_date" range={range} excludeStatuses={["cancelled"]} />
        <DailyHeatmap title="Pedidos por dia" description="Últimas 12 semanas, pela data do pedido." source="/api/sales-orders" permission="sales_orders.view" dateKey="order_date" />
      </>
    ),
  },
  compras: {
    title: "Painel de compras",
    description: "Solicitações, pedidos, recebimentos e fornecedores.",
    permission: "purchase_reports.view",
    report: REPORTS.purchases,
    summaryKeys: ["orders_amount", "orders_count", "receipts_amount", "divergent_receipt_items"],
    problemModules: ["compras"],
    flows: ["compra"],
    sections: ["suprimentos"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.purchases} metricKey="orders_amount" title="Valor comprado por mês" />
        <StatusDistribution title="Pedidos de compra do período por situação" source="/api/purchase-orders" permission="purchase_orders.view" groups={PO_GROUPS} dateKey="issued_at" range={range} />
        <TopRanking title="Maiores fornecedores no período" description="Valor em pedidos não cancelados." source="/api/purchase-orders" permission="purchase_orders.view" groupKey="supplier_id" valueKey="total_amount" lookupPath="/api/suppliers?pageSize=500" lookupField="razaoSocial" dateKey="issued_at" range={range} excludeStatuses={["cancelled"]} />
        <DailyHeatmap title="Recebimentos por dia" description="Últimas 12 semanas, pela data de recebimento." source="/api/purchase-receipts" permission="purchase_receipts.view" dateKey="received_at" />
      </>
    ),
  },
  estoque: {
    title: "Painel de estoque",
    description: "Posição valorizada, giro, movimentações e requisições internas.",
    permission: "inventory_reports.view",
    report: REPORTS.inventory,
    summaryKeys: ["total_value", "receipts_count", "issues_count", "products_without_movement"],
    problemModules: ["estoque"],
    sections: ["logistica"],
    insights: () => (
      <>
        <MonthlyTrend report={REPORTS.inventory} metricKey="issues_count" title="Saídas por mês" />
        <MonthlyTrend report={REPORTS.inventory} metricKey="receipts_count" title="Entradas por mês" />
        <DailyHeatmap title="Movimentações por dia" description="Últimas 12 semanas." source="/api/stock-movements" permission="stock.view" dateKey="created_at" />
        <StatusDistribution
          title="Requisições de material"
          source="/api/material-requests"
          permission="stock.view"
          groups={[
            { label: "Solicitadas", statuses: ["requested"], tone: "warning", href: "/logistica/almoxarifado?view=pendentes" },
            { label: "Entregues", statuses: ["delivered"], tone: "success" },
            { label: "Canceladas", statuses: ["cancelled"], tone: "danger" },
          ]}
        />
      </>
    ),
  },
  logistica: {
    title: "Painel de logística",
    description: "Separação, expedição, transporte e entrega.",
    permission: "logistics_reports.view",
    report: REPORTS.logistics,
    summaryKeys: ["shipments_count", "delivered_count", "failed_count", "average_lead_time_days"],
    problemModules: ["logistica", "estoque"],
    flows: ["venda"],
    sections: ["logistica"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.logistics} metricKey="delivered_count" title="Entregas por mês" />
        <StatusDistribution title="Expedições do período por situação" source="/api/shipments" permission="shipments.view" groups={SHIPMENT_GROUPS} dateKey="created_at" range={range} />
        <DailyHeatmap title="Expedições por dia de saída" description="Últimas 12 semanas." source="/api/shipments" permission="shipments.view" dateKey="shipped_at" />
      </>
    ),
  },
  producao: {
    title: "Painel de produção",
    description: "Ordens, apontamentos, consumo de material e refugo.",
    permission: "production_reports.view",
    report: REPORTS.production,
    summaryKeys: ["orders_count", "in_progress_orders", "produced_quantity", "scrap_quantity"],
    problemModules: ["producao", "estoque"],
    flows: ["producao"],
    sections: ["producao"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.production} metricKey="produced_quantity" title="Quantidade produzida por mês" />
        <StatusDistribution title="Ordens do período por situação" source="/api/production-orders" permission="production_orders.view" groups={PRODUCTION_GROUPS} dateKey="created_at" range={range} />
        <DailyHeatmap title="Ordens concluídas por dia" description="Últimas 12 semanas." source="/api/production-orders" permission="production_orders.view" dateKey="finished_at" />
      </>
    ),
  },
  financeiro: {
    title: "Painel financeiro",
    description: "Caixa, recebimentos, pagamentos e inadimplência.",
    permission: "financial_reports.view",
    report: REPORTS.finance,
    summaryKeys: ["cash_balance", "received_in_period", "paid_in_period", "overdue_receivable"],
    problemModules: ["financeiro"],
    sections: ["financeiro"],
    insights: () => (
      <>
        <MonthlyTrend report={REPORTS.finance} metricKey="received_in_period" title="Recebido por mês" />
        <MonthlyTrend report={REPORTS.finance} metricKey="paid_in_period" title="Pago por mês" />
        <AgingBuckets title="A receber por vencimento" source="/api/accounts-receivable" permission="accounts_receivable.view" dueKey="due_date" amountKey="updated_amount" openStatuses={RECEIVABLE_OPEN} href="/financeiro/contas-receber" />
        <AgingBuckets title="A pagar por vencimento" source="/api/accounts-payable" permission="accounts_payable.view" dueKey="due_date" amountKey="updated_amount" openStatuses={PAYABLE_OPEN} href="/financeiro/contas-pagar" />
        <TopRanking title="Maiores saldos a receber" description="Títulos em aberto, por cliente." source="/api/accounts-receivable" permission="accounts_receivable.view" groupKey="customer_id" valueKey="updated_amount" lookupPath="/api/customers?pageSize=500" lookupField="nome" excludeStatuses={["RECEIVED", "CANCELLED"]} />
      </>
    ),
  },
  fiscal: {
    title: "Painel fiscal",
    description: "Emissão, autorização, rejeições e tributos.",
    permission: "fiscal_reports.view",
    report: REPORTS.fiscal,
    summaryKeys: ["documents_count", "authorized_count", "rejected_count", "taxes_amount"],
    problemModules: ["fiscal"],
    sections: ["fiscal"],
    insights: (range) => (
      <>
        <MonthlyTrend report={REPORTS.fiscal} metricKey="documents_count" title="Documentos por mês" />
        <StatusDistribution
          title="Documentos do período por situação"
          source="/api/fiscal-documents"
          permission="fiscal_documents.view"
          dateKey="issue_date"
          range={range}
          groups={[
            { label: "Em preparação", statuses: ["DRAFT", "CALCULATED", "READY"], tone: "neutral", href: "/fiscal/notas-fiscais?view=pendentes" },
            { label: "Em autorização", statuses: ["AUTHORIZING", "CONTINGENCY"], tone: "warning", href: "/fiscal/notas-fiscais?view=pendentes" },
            { label: "Autorizados", statuses: ["AUTHORIZED"], tone: "success", href: "/fiscal/notas-fiscais?status=AUTHORIZED" },
            { label: "Rejeitados / denegados", statuses: ["REJECTED", "DENIED"], tone: "danger", href: "/fiscal/notas-fiscais?view=rejeitadas" },
            { label: "Cancelados", statuses: ["CANCELLED"], tone: "neutral" },
          ]}
        />
        <DailyHeatmap title="Emissões por dia" description="Últimas 12 semanas." source="/api/fiscal-documents" permission="fiscal_documents.view" dateKey="issue_date" />
      </>
    ),
  },
  controladoria: {
    title: "Painel de controladoria",
    description: "Resultado, margem e despesas — base para as decisões de gestão.",
    permission: "controlling.view",
    report: REPORTS.controlling,
    summaryKeys: ["net_revenue", "gross_margin_pct", "operating_result", "managerial_result"],
    problemModules: ["financeiro"],
    sections: ["gestao", "financeiro"],
    insights: () => (
      <>
        <MonthlyTrend report={REPORTS.controlling} metricKey="managerial_result" title="Resultado gerencial por mês" />
        <MonthlyTrend report={REPORTS.controlling} metricKey="operating_expenses" title="Despesas operacionais por mês" />
        <MonthlyTrend report={REPORTS.controlling} metricKey="gross_profit" title="Lucro bruto por mês" />
        <AgingBuckets title="Inadimplência por faixa" source="/api/accounts-receivable" permission="accounts_receivable.view" dueKey="due_date" amountKey="updated_amount" openStatuses={RECEIVABLE_OPEN} href="/financeiro/contas-receber" />
      </>
    ),
  },
  qualidade: {
    title: "Painel de qualidade",
    description: "Não conformidades, inspeções e ações corretivas.",
    permission: "nonconformities.view",
    problemModules: ["qualidade"],
    sections: ["qualidade"],
    insights: () => (
      <>
        <StatusDistribution
          title="Não conformidades por situação"
          source="/api/nonconformities"
          permission="nonconformities.view"
          groups={[
            { label: "Abertas", statuses: ["OPEN"], tone: "danger", href: "/qualidade/nao-conformidades?view=criticas" },
            { label: "Em análise", statuses: ["IN_ANALYSIS"], tone: "warning", href: "/qualidade/nao-conformidades?status=IN_ANALYSIS" },
            { label: "Em tratamento", statuses: ["IN_TREATMENT"], tone: "info", href: "/qualidade/nao-conformidades?status=IN_TREATMENT" },
            { label: "Encerradas", statuses: ["CLOSED"], tone: "success" },
          ]}
        />
        <StatusDistribution
          title="Não conformidades por gravidade"
          source="/api/nonconformities"
          permission="nonconformities.view"
          field="severity"
          groups={[
            { label: "Crítica", statuses: ["CRITICAL"], tone: "critical", href: "/qualidade/nao-conformidades?severity=CRITICAL" },
            { label: "Alta", statuses: ["HIGH"], tone: "danger", href: "/qualidade/nao-conformidades?severity=HIGH" },
            { label: "Média", statuses: ["MEDIUM"], tone: "warning" },
            { label: "Baixa", statuses: ["LOW"], tone: "neutral" },
          ]}
        />
        <StatusDistribution
          title="Inspeções por resultado"
          source="/api/quality-inspections"
          permission="quality_inspections.view"
          groups={[
            { label: "Pendentes", statuses: ["PENDING", "IN_PROGRESS"], tone: "warning", href: "/qualidade/inspecoes" },
            { label: "Aprovadas", statuses: ["APPROVED"], tone: "success" },
            { label: "Aprovadas parcialmente", statuses: ["PARTIALLY_APPROVED"], tone: "info" },
            { label: "Reprovadas", statuses: ["REJECTED"], tone: "danger" },
          ]}
        />
        <DailyHeatmap title="Não conformidades abertas por dia" description="Últimas 12 semanas." source="/api/nonconformities" permission="nonconformities.view" dateKey="opened_at" />
      </>
    ),
  },
  manutencao: {
    title: "Painel de manutenção",
    description: "Ordens de manutenção, ativos parados e cumprimento do plano.",
    permission: "maintenance_orders.view",
    problemModules: ["manutencao"],
    sections: ["ativos"],
    insights: () => (
      <>
        <StatusDistribution
          title="Ordens de manutenção por situação"
          source="/api/maintenance-orders"
          permission="maintenance_orders.view"
          groups={[
            { label: "Abertas / planejadas", statuses: ["OPEN", "PLANNED"], tone: "neutral", href: "/ativos/ordens-manutencao" },
            { label: "Em execução", statuses: ["IN_PROGRESS"], tone: "info" },
            { label: "Aguardando peças", statuses: ["WAITING_PARTS"], tone: "warning" },
            { label: "Concluídas", statuses: ["COMPLETED"], tone: "success" },
            { label: "Canceladas", statuses: ["CANCELLED"], tone: "danger" },
          ]}
        />
        <StatusDistribution
          title="Ordens por tipo"
          source="/api/maintenance-orders"
          permission="maintenance_orders.view"
          field="order_type"
          groups={[
            { label: "Preventiva", statuses: ["PREVENTIVE"], tone: "success" },
            { label: "Preditiva", statuses: ["PREDICTIVE"], tone: "info" },
            { label: "Corretiva", statuses: ["CORRECTIVE"], tone: "warning" },
          ]}
        />
        <StatusDistribution
          title="Ativos por situação"
          source="/api/assets"
          permission="assets.view"
          groups={[
            { label: "Em operação", statuses: ["ACTIVE"], tone: "success", href: "/ativos/lista?status=ACTIVE" },
            { label: "Em manutenção", statuses: ["UNDER_MAINTENANCE"], tone: "warning", href: "/ativos/lista?view=manutencao" },
            { label: "Inativos", statuses: ["INACTIVE"], tone: "neutral" },
            { label: "Baixados", statuses: ["DECOMMISSIONED"], tone: "danger" },
          ]}
        />
        <DailyHeatmap title="Manutenções concluídas por dia" description="Últimas 12 semanas." source="/api/maintenance-orders" permission="maintenance_orders.view" dateKey="completed_at" />
      </>
    ),
  },
  operacoes: {
    title: "Painel de operações",
    description: "Estoque, produção e expedição lado a lado: onde o fluxo está parando.",
    permission: ["shipments.view", "stock.view", "production_orders.view"],
    report: REPORTS.logistics,
    summaryKeys: ["shipments_count", "delivered_count", "in_transit_count", "failed_count"],
    problemModules: ["logistica", "estoque", "producao", "compras"],
    flows: ["venda", "producao", "compra"],
    sections: ["logistica", "producao", "suprimentos"],
    insights: (range) => (
      <>
        <StatusDistribution title="Expedições do período" source="/api/shipments" permission="shipments.view" groups={SHIPMENT_GROUPS} dateKey="created_at" range={range} />
        <StatusDistribution title="Ordens de produção do período" source="/api/production-orders" permission="production_orders.view" groups={PRODUCTION_GROUPS} dateKey="created_at" range={range} />
        <DailyHeatmap title="Movimentações de estoque por dia" description="Últimas 12 semanas." source="/api/stock-movements" permission="stock.view" dateKey="created_at" />
      </>
    ),
  },
  ti: {
    title: "TI e acessos",
    description: "Usuários, vínculos de acesso e atividade registrada na auditoria.",
    permission: "users.read",
    sections: [],
    insights: () => (
      <>
        <AccessOverview />
        <DailyHeatmap title="Eventos de auditoria por dia" description="Últimos 100 eventos registrados." source="/api/admin/audit?pageSize=100" permission="audit_logs.read" dateKey="created_at" />
      </>
    ),
  },
};

type AdminUser = { id: string; status: string; has_login: boolean; role_ids: string[]; branch_access: unknown[]; links_visible: boolean };

function AccessOverview() {
  const { can } = useSession();
  const res = useCached<AdminUser[]>("/api/admin/users", can("users.read"));
  if (!can("users.read")) return null;
  const users = res.data ?? [];
  const active = users.filter((u) => String(u.status).toUpperCase() === "ATIVO" || String(u.status).toLowerCase() === "active");
  const linksVisible = users.every((u) => u.links_visible);
  return (
    <Panel className="lg:col-span-2">
      <PanelHeader title="Acessos" description="Situação dos usuários da empresa. Detalhes e correções em Administração › Usuários." />
      {res.error ? (
        <EmptyState compact kind="error" title="Usuários indisponíveis" description={res.error} onRetry={res.reload} />
      ) : (
        <StatStrip columns={4} className="rounded-none border-0">
          <Stat label="Usuários ativos" value={formatInteger(active.length)} hint={`${formatInteger(users.length)} cadastrados`} loading={res.loading} href="/admin/users" />
          <Stat label="Sem login vinculado" value={formatInteger(users.filter((u) => !u.has_login).length)} tone={users.some((u) => !u.has_login) ? "warning" : "neutral"} loading={res.loading} href="/admin/users" />
          <Stat label="Sem papel atribuído" value={linksVisible ? formatInteger(active.filter((u) => u.role_ids.length === 0).length) : "—"} hint={linksVisible ? undefined : "Requer permissão de papéis"} loading={res.loading} href="/admin/users" />
          <Stat label="Sem unidade liberada" value={linksVisible ? formatInteger(active.filter((u) => u.branch_access.length === 0).length) : "—"} loading={res.loading} href="/admin/users" />
        </StatStrip>
      )}
    </Panel>
  );
}

/** "Onde agir": atalhos permitidos das seções da área. */
function ActionLinks({ sections }: { sections: string[] }) {
  const { can } = useSession();
  const groups = useMemo(
    () =>
      sections
        .map((id) => ERP_NAV.find((s) => s.id === id))
        .filter((s): s is NonNullable<typeof s> => !!s)
        .map((section) => ({ section, items: section.items.filter((i) => canAccess(i.permission, can)).slice(0, 6) }))
        .filter((g) => g.items.length > 0),
    [sections, can]
  );
  if (groups.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Onde agir" description="Listas e rotinas desta área que você pode operar." />
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {groups.map(({ section, items }) => (
          <div key={section.id} className="bg-surface p-3">
            <p className="mb-1 px-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">{section.label}</p>
            <ul>
              {items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="group flex items-center justify-between gap-2 rounded-sm px-1 py-1.5 text-sm hover:bg-surface-hover">
                    <span className="truncate">{item.label}</span>
                    <ArrowRight size={13} className="shrink-0 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function AreaDashboard({ area }: { area: AreaId }) {
  const def = AREAS[area];
  const { can } = useSession();
  const { range, previous } = usePeriod();
  if (!canAccess(def.permission, can)) return <NoAccess />;
  const reportOk = !!def.report && can(def.report.permission);
  const problemModules = def.problemModules;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader title={def.title} description={def.description} />

      {reportOk && def.report && (
        <section aria-label="Resumo" className="flex flex-col gap-2">
          <SectionTitle title="Resumo" description={`Relatório ${def.report.label.toLowerCase()} no período selecionado.`} />
          <SummaryStrip report={def.report} range={range} previous={previous} enabled keys={def.summaryKeys} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className={reportOk ? "lg:col-span-3" : "lg:col-span-5"}>
          <ProblemsPanel modules={problemModules} />
        </div>
        {reportOk && def.report && (
          <div className="lg:col-span-2">
            <ChangesPanel report={def.report} range={range} previous={previous} enabled />
          </div>
        )}
      </div>

      {def.flows && <ErpFlows range={range} flows={def.flows} />}

      {def.insights && (
        <section aria-label="Investigação" className="flex flex-col gap-2">
          <SectionTitle title="Investigação" description="Tendências e distribuições com os dados registrados. Clique para abrir a lista filtrada." />
          <div className="grid gap-4 lg:grid-cols-2">{def.insights(range)}</div>
        </section>
      )}

      <ActionLinks sections={def.sections} />
    </div>
  );
}

/** Centro operacional (página inicial): contexto do usuário primeiro, depois o que exige ação. */
export function OperationalCenter() {
  const { data, can } = useSession();
  const { range, previous } = usePeriod();
  const execOk = can(REPORTS.executive.permission);
  const firstName = data?.tenant?.user.name?.split(" ")[0];
  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title={firstName ? `Olá, ${firstName}` : "Centro operacional"}
        description="O que mudou, o que precisa de atenção e onde agir — com os dados que o seu perfil pode ver."
      />

      {execOk && (
        <section aria-label="Resumo" className="flex flex-col gap-2">
          <SectionTitle title="Resumo" description="Indicadores consolidados no período selecionado." actions={<Link href="/gestao/dashboard" className="text-xs font-medium text-muted-foreground hover:text-foreground">Painel executivo →</Link>} />
          <SummaryStrip report={REPORTS.executive} range={range} previous={previous} enabled keys={["net_revenue", "gross_margin_pct", "cash_balance", "open_sales_orders"]} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ProblemsPanel limit={10} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          {execOk && <ChangesPanel report={REPORTS.executive} range={range} previous={previous} enabled />}
          <FocusPanel />
        </div>
      </div>

      <ErpFlows range={range} />

      <section aria-label="Investigação" className="flex flex-col gap-2">
        <SectionTitle title="Investigação" description="Tendências dos seus módulos. Painéis por área em Dashboards." />
        <div className="grid gap-4 lg:grid-cols-2">
          <MonthlyTrend report={REPORTS.executive} metricKey="net_revenue" title="Receita líquida por mês" />
          <AgingBuckets title="A receber por vencimento" source="/api/accounts-receivable" permission="accounts_receivable.view" dueKey="due_date" amountKey="updated_amount" openStatuses={RECEIVABLE_OPEN} href="/financeiro/contas-receber" />
        </div>
      </section>
    </div>
  );
}
