"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, ChevronRight } from "lucide-react";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { NoAccess } from "@/components/shell/ShellFrame";
import { useSession } from "@/components/shell/SessionProvider";
import { ERP_NAV } from "@/lib/nav";
import { canAccess } from "@/lib/navigation/access";
import { REPORTS } from "@/lib/dashboard/metrics";
import { useCached } from "@/lib/dashboard/client";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { StatusEntity } from "@/lib/status";
import { DashboardHeader, PeriodPicker, usePeriod } from "./Context";
import { SummaryStrip } from "./ReportBlocks";
import { ProblemsPanel } from "./Problems";

// Área de trabalho de um módulo: contexto, resumo do período, pendências
// do módulo, registros recentes e a navegação interna — tudo filtrado
// pelas permissões do usuário. Substitui as antigas "landing pages".

type RecentDef = {
  title: string;
  source: string;
  permission: string;
  entity: StatusEntity;
  label: (row: Row) => string;
  sublabel?: (row: Row) => string | null | undefined;
  dateKey: string;
  amountKey?: string;
  listHref: string;
  rowHref?: (row: Row) => string;
};

type Row = Record<string, unknown>;

type WorkspaceDef = {
  report?: keyof typeof REPORTS;
  summaryKeys?: string[];
  problemModules?: string[];
  recent?: RecentDef;
  dashboard?: string;
};

const WORKSPACES: Record<string, WorkspaceDef> = {
  comercial: {
    report: "commercial",
    summaryKeys: ["orders_amount", "orders_count", "average_ticket", "pending_orders"],
    problemModules: ["comercial"],
    dashboard: "/gestao/dashboard/comercial",
    recent: {
      title: "Pedidos recentes",
      source: "/api/sales-orders",
      permission: "sales_orders.view",
      entity: "sales_orders",
      label: (r) => String(r.code),
      sublabel: (r) => (r.delivery_city as string) ?? null,
      dateKey: "order_date",
      amountKey: "total_amount",
      listHref: "/comercial/pedidos-venda",
      rowHref: (r) => `/comercial/pedidos-venda/${r.id}`,
    },
  },
  crm: {
    problemModules: ["crm"],
    recent: {
      title: "Oportunidades recentes",
      source: "/api/opportunities",
      permission: "opportunities.view",
      entity: "opportunities",
      label: (r) => String(r.title ?? r.code),
      sublabel: (r) => String(r.code),
      dateKey: "created_at",
      amountKey: "estimated_value",
      listHref: "/crm/oportunidades",
    },
  },
  suprimentos: {
    report: "purchases",
    summaryKeys: ["orders_amount", "orders_count", "requests_count", "receipts_count"],
    problemModules: ["compras"],
    dashboard: "/gestao/dashboard/compras",
    recent: {
      title: "Pedidos de compra recentes",
      source: "/api/purchase-orders",
      permission: "purchase_orders.view",
      entity: "purchase_orders",
      label: (r) => String(r.code),
      dateKey: "issued_at",
      amountKey: "total_amount",
      listHref: "/suprimentos/pedidos-compra",
    },
  },
  logistica: {
    report: "logistics",
    summaryKeys: ["shipments_count", "delivered_count", "in_transit_count", "failed_count"],
    problemModules: ["logistica", "estoque"],
    dashboard: "/gestao/dashboard/logistica",
    recent: {
      title: "Expedições recentes",
      source: "/api/shipments",
      permission: "shipments.view",
      entity: "shipments",
      label: (r) => String(r.code),
      sublabel: (r) => (r.delivery_city as string) ?? null,
      dateKey: "created_at",
      listHref: "/logistica/expedicao",
    },
  },
  producao: {
    report: "production",
    summaryKeys: ["orders_count", "in_progress_orders", "completed_orders", "scrap_quantity"],
    problemModules: ["producao"],
    dashboard: "/gestao/dashboard/producao",
    recent: {
      title: "Ordens de produção recentes",
      source: "/api/production-orders",
      permission: "production_orders.view",
      entity: "production_orders",
      label: (r) => String(r.code),
      dateKey: "created_at",
      listHref: "/producao/ordens",
    },
  },
  financeiro: {
    report: "finance",
    summaryKeys: ["cash_balance", "received_in_period", "paid_in_period", "overdue_receivable"],
    problemModules: ["financeiro"],
    dashboard: "/gestao/dashboard/financeiro",
    recent: {
      title: "Títulos a receber recentes",
      source: "/api/accounts-receivable",
      permission: "accounts_receivable.view",
      entity: "accounts_receivable",
      label: (r) => String(r.code),
      sublabel: (r) => (r.description as string) ?? null,
      dateKey: "due_date",
      amountKey: "updated_amount",
      listHref: "/financeiro/contas-receber",
    },
  },
  fiscal: {
    report: "fiscal",
    summaryKeys: ["documents_count", "authorized_count", "pending_count", "rejected_count"],
    problemModules: ["fiscal"],
    dashboard: "/gestao/dashboard/fiscal",
    recent: {
      title: "Documentos fiscais recentes",
      source: "/api/fiscal-documents",
      permission: "fiscal_documents.view",
      entity: "fiscal_documents",
      label: (r) => String(r.code),
      sublabel: (r) => (r.number ? `Nº ${r.number}${r.series ? ` · série ${r.series}` : ""}` : null),
      dateKey: "issue_date",
      listHref: "/fiscal/notas-fiscais",
    },
  },
  projetos: {
    problemModules: ["projetos"],
    recent: {
      title: "Projetos recentes",
      source: "/api/projects",
      permission: "projects.view",
      entity: "projects",
      label: (r) => String(r.name ?? r.code),
      sublabel: (r) => String(r.code),
      dateKey: "created_at",
      listHref: "/projetos/lista",
    },
  },
  qualidade: {
    problemModules: ["qualidade"],
    dashboard: "/gestao/dashboard/qualidade",
    recent: {
      title: "Não conformidades recentes",
      source: "/api/nonconformities",
      permission: "nonconformities.view",
      entity: "nonconformities",
      label: (r) => String(r.code),
      sublabel: (r) => (r.description as string) ?? null,
      dateKey: "opened_at",
      listHref: "/qualidade/nao-conformidades",
    },
  },
  ativos: {
    problemModules: ["manutencao"],
    dashboard: "/gestao/dashboard/manutencao",
    recent: {
      title: "Ordens de manutenção recentes",
      source: "/api/maintenance-orders",
      permission: "maintenance_orders.view",
      entity: "maintenance_orders",
      label: (r) => String(r.code),
      sublabel: (r) => (r.description as string) ?? null,
      dateKey: "created_at",
      listHref: "/ativos/ordens-manutencao",
    },
  },
  gestao: {
    report: "controlling",
    summaryKeys: ["net_revenue", "gross_margin_pct", "operating_result", "managerial_result"],
    dashboard: "/gestao/dashboard/controladoria",
  },
  cadastros: {},
  configuracoes: {},
};

function RecentPanel({ def }: { def: RecentDef }) {
  const { can } = useSession();
  const allowed = can(def.permission);
  const res = useCached<Row[]>(def.source, allowed);
  if (!allowed) return null;
  const rows = [...(res.data ?? [])]
    .sort((a, b) => String(b.created_at ?? b[def.dateKey] ?? "").localeCompare(String(a.created_at ?? a[def.dateKey] ?? "")))
    .slice(0, 6);
  return (
    <Panel>
      <PanelHeader
        title={def.title}
        actions={
          <Link href={def.listHref} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Ver todos
          </Link>
        }
      />
      {res.loading ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : res.error ? (
        <EmptyState compact kind="error" title="Registros indisponíveis" description={res.error} onRetry={res.reload} />
      ) : rows.length === 0 ? (
        <EmptyState compact title="Nenhum registro ainda" description="Os registros criados neste módulo aparecem aqui." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => {
            const sub = def.sublabel?.(row);
            return (
              <li key={String(row.id)}>
                <Link href={def.rowHref ? def.rowHref(row) : `${def.listHref}?q=${encodeURIComponent(def.label(row))}`} className="group flex items-center gap-3 px-4 py-2 hover:bg-surface-hover">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{def.label(row)}</p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {formatDate(row[def.dateKey] as string)}
                      {sub ? ` · ${sub}` : ""}
                    </p>
                  </div>
                  {def.amountKey && <span className="hidden text-sm tabular-nums sm:inline">{formatCurrencyBRL(Number(row[def.amountKey]) || 0)}</span>}
                  <StatusBadge entity={def.entity} status={String(row.status ?? "")} />
                  <ChevronRight size={14} className="shrink-0 text-subtle-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function ModuleWorkspace({ section: sectionId }: { section: string }) {
  const { can } = useSession();
  const { range, previous } = usePeriod();
  const section = ERP_NAV.find((s) => s.id === sectionId);
  const def = WORKSPACES[sectionId] ?? {};
  if (!section) return null;

  const items = section.items.filter((item) => canAccess(item.permission, can));
  if (items.length === 0) return <NoAccess />;

  const report = def.report ? REPORTS[def.report] : undefined;
  const reportOk = !!report && can(report.permission);
  const dashboardItem = def.dashboard ? ERP_NAV.find((s) => s.id === "dashboards")?.items.find((i) => i.href === def.dashboard) : undefined;
  const dashboardOk = !!dashboardItem && canAccess(dashboardItem.permission, can);
  const hasActivity = !!def.problemModules || !!def.recent;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title={section.label}
        description={section.description}
        actions={
          <>
            {reportOk && <PeriodPicker />}
            {dashboardOk && (
              <Link href={def.dashboard!} className={buttonClasses("secondary", "sm")}>
                <BarChart3 size={14} aria-hidden />
                Painel da área
              </Link>
            )}
          </>
        }
      />

      {reportOk && report && <SummaryStrip report={report} range={range} previous={previous} enabled keys={def.summaryKeys} />}

      {hasActivity && (
        <div className="grid gap-4 lg:grid-cols-5">
          {def.problemModules && (
            <div className={def.recent ? "min-w-0 lg:col-span-3" : "min-w-0 lg:col-span-5"}>
              <ProblemsPanel modules={def.problemModules} title="Pendências do módulo" description="Situações que pedem ação, com base nos registros reais." limit={6} />
            </div>
          )}
          {def.recent && (
            <div className={def.problemModules ? "min-w-0 lg:col-span-2" : "min-w-0 lg:col-span-5"}>
              <RecentPanel def={def.recent} />
            </div>
          )}
        </div>
      )}

      <section aria-label={`Navegação de ${section.label}`} className="flex flex-col gap-2">
        <SectionTitle title="Rotinas" description="Listas e cadastros deste módulo disponíveis para o seu perfil." />
        <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.href} className="bg-surface">
              <Link href={item.href} className="group flex h-full items-center justify-between gap-3 px-4 py-3 hover:bg-surface-hover">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.label}</span>
                  {item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}
                </span>
                <ArrowRight size={14} className="shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
