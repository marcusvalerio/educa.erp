"use client";

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import type { Tone } from "@/components/ui/Badge";
import { useSession } from "@/components/shell/SessionProvider";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { CalendarHeatmap, ColumnTrend, DistributionBar, FunnelBars, RankingBars } from "@/components/charts/Charts";
import { FlowSankey } from "@/components/charts/FlowSankey";
import { cachedGet, reportPath, useCached } from "@/lib/dashboard/client";
import { buildOrderToDeliveryFlow, buildProcureToReceiveFlow, buildProductionFlow, type Flow } from "@/lib/dashboard/flows";
import { formatMetric, type ReportDef } from "@/lib/dashboard/metrics";
import { inRange, lastMonths, toIso, type DateRange } from "@/lib/dashboard/periods";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import { pickName } from "@/lib/useIdNameLookup";

// Visualizações de INVESTIGAÇÃO. Todas leem coleções/relatórios reais,
// respeitam a permissão da fonte e tratam vazio/erro. Nenhuma inventa
// série: sem dados, o painel diz isso.

type AnyRow = Record<string, unknown>;

// ------------------------------------------------------------ tendência mensal
export function MonthlyTrend({ report, metricKey, title, description }: { report: ReportDef; metricKey: string; title: string; description?: string }) {
  const { can } = useSession();
  const allowed = can(report.permission);
  const months = useMemo(() => lastMonths(6), []);
  const [state, setState] = useState<{ data: Array<{ label: string; value: number }> | null; error: string | null }>({ data: null, error: null });

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    Promise.all(months.map((m) => cachedGet<AnyRow | null>(reportPath(report.endpoint, m))))
      .then((rows) => !cancelled && setState({ data: rows.map((row, i) => ({ label: months[i].label, value: Number(row?.[metricKey] ?? 0) })), error: null }))
      .catch((error: unknown) => !cancelled && setState({ data: null, error: error instanceof Error ? error.message : "Falha ao carregar." }));
    return () => {
      cancelled = true;
    };
  }, [allowed, months, report.endpoint, metricKey]);

  if (!allowed) return null;
  const metric = report.metrics.find((m) => m.key === metricKey);
  const format = (v: number) => formatMetric(v, metric?.format ?? "int");
  const data = state.data ?? [];
  return (
    <ChartPanel
      title={title}
      description={description ?? "Últimos 6 meses — o mês atual (parcial) em destaque."}
      loading={!state.data && !state.error}
      error={state.error}
      empty={!!state.data && data.every((d) => d.value === 0)}
      table={{ columns: [{ label: "Mês" }, { label: metric?.label ?? "Valor", align: "right" }], rows: data.map((d) => [d.label, format(d.value)]) }}
    >
      <ColumnTrend data={data.map((d, i) => ({ ...d, highlight: i === data.length - 1 }))} format={format} seriesLabel={metric?.label ?? title} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ distribuição por status
export type StatusGroup = { label: string; statuses: string[]; tone: Tone; href?: string };

export function StatusDistribution({
  title,
  description,
  source,
  permission,
  groups,
  dateKey,
  range,
  field = "status",
}: {
  title: string;
  description?: string;
  source: string;
  permission: string;
  groups: StatusGroup[];
  dateKey?: string;
  range?: DateRange;
  /** Coluna agrupada (padrão: status; ex.: severity). */
  field?: string;
}) {
  const { can } = useSession();
  const allowed = can(permission);
  const res = useCached<AnyRow[]>(source, allowed);
  if (!allowed) return null;
  const rows = (res.data ?? []).filter((row) => !dateKey || !range || inRange(row[dateKey] as string, range));
  const parts = groups.map((g, i) => ({
    id: String(i),
    label: g.label,
    tone: g.tone,
    href: g.href,
    value: rows.filter((row) => g.statuses.map((s) => s.toLowerCase()).includes(String(row[field] ?? "").toLowerCase())).length,
  }));
  return (
    <ChartPanel
      title={title}
      description={description}
      loading={res.loading}
      error={res.error}
      onRetry={res.reload}
      empty={!!res.data && rows.length === 0}
      height={96}
      table={{ columns: [{ label: "Situação" }, { label: "Quantidade", align: "right" }], rows: parts.map((p) => [p.label, formatInteger(p.value)]) }}
    >
      <DistributionBar parts={parts} format={formatInteger} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ vencimentos (aging)
export function AgingBuckets({
  title,
  source,
  permission,
  dueKey,
  amountKey,
  openStatuses,
  href,
}: {
  title: string;
  source: string;
  permission: string;
  dueKey: string;
  amountKey: string;
  openStatuses: string[];
  href: string;
}) {
  const { can } = useSession();
  const allowed = can(permission);
  const res = useCached<AnyRow[]>(source, allowed);
  if (!allowed) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const open = (res.data ?? []).filter((row) => openStatuses.map((s) => s.toUpperCase()).includes(String(row.status ?? "").toUpperCase()));
  const buckets = [
    { id: "a-vencer", label: "A vencer", tone: "neutral" as Tone, min: -Infinity, max: 0 },
    { id: "1-30", label: "Vencidos 1–30 dias", tone: "warning" as Tone, min: 1, max: 30 },
    { id: "31-60", label: "Vencidos 31–60 dias", tone: "danger" as Tone, min: 31, max: 60 },
    { id: "60+", label: "Vencidos há mais de 60 dias", tone: "critical" as Tone, min: 61, max: Infinity },
  ].map((b) => {
    const hits = open.filter((row) => {
      const due = row[dueKey] as string | null;
      if (!due) return b.id === "a-vencer";
      const [y, m, d] = due.slice(0, 10).split("-").map(Number);
      const days = Math.floor((start - new Date(y, m - 1, d).getTime()) / 86_400_000);
      return days >= b.min && days <= b.max;
    });
    return { ...b, value: hits.reduce((acc, row) => acc + (Number(row[amountKey]) || 0), 0), count: hits.length };
  });
  return (
    <ChartPanel
      title={title}
      description="Títulos em aberto por faixa de atraso (valor atualizado)."
      loading={res.loading}
      error={res.error}
      onRetry={res.reload}
      empty={!!res.data && open.length === 0}
      emptyTitle="Nenhum título em aberto"
      height={96}
      table={{ columns: [{ label: "Faixa" }, { label: "Títulos", align: "right" }, { label: "Valor", align: "right" }], rows: buckets.map((b) => [b.label, formatInteger(b.count), formatCurrencyBRL(b.value)]) }}
    >
      <DistributionBar parts={buckets.map((b) => ({ id: b.id, label: b.label, value: b.value, tone: b.tone, href: b.id === "a-vencer" ? `${href}?view=abertos` : `${href}?view=atrasados` }))} format={formatCurrencyBRL} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ ranking
export function TopRanking({
  title,
  description,
  source,
  permission,
  groupKey,
  valueKey,
  lookupPath,
  lookupField = "name",
  dateKey,
  range,
  hrefFor,
  excludeStatuses = [],
}: {
  title: string;
  description?: string;
  source: string;
  permission: string;
  groupKey: string;
  valueKey: string;
  lookupPath: string;
  lookupField?: string;
  dateKey?: string;
  range?: DateRange;
  hrefFor?: (id: string) => string;
  excludeStatuses?: string[];
}) {
  const { can } = useSession();
  const allowed = can(permission);
  const res = useCached<AnyRow[]>(source, allowed);
  const lookup = useCached<AnyRow[]>(lookupPath, allowed);
  if (!allowed) return null;
  const names = new Map((lookup.data ?? []).map((r) => [String(r.id), pickName(r, lookupField) ?? ""]));
  const totals = new Map<string, number>();
  for (const row of res.data ?? []) {
    if (dateKey && range && !inRange(row[dateKey] as string, range)) continue;
    if (excludeStatuses.map((s) => s.toLowerCase()).includes(String(row.status ?? "").toLowerCase())) continue;
    const id = String(row[groupKey] ?? "");
    if (!id) continue;
    totals.set(id, (totals.get(id) ?? 0) + (Number(row[valueKey]) || 0));
  }
  const items = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, value]) => ({ id, value, label: names.get(id) || `#${id.slice(0, 8)}`, href: hrefFor?.(id) }));
  return (
    <ChartPanel
      title={title}
      description={description}
      loading={res.loading}
      error={res.error}
      onRetry={res.reload}
      empty={!!res.data && items.length === 0}
      height={180}
      table={{ columns: [{ label: "Nome" }, { label: "Valor", align: "right" }], rows: items.map((i) => [i.label, formatCurrencyBRL(i.value)]) }}
    >
      <RankingBars items={items} format={formatCurrencyBRL} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ calendário
export function DailyHeatmap({ title, description, source, permission, dateKey, weeks = 12 }: { title: string; description?: string; source: string; permission: string; dateKey: string; weeks?: number }) {
  const { can } = useSession();
  const allowed = can(permission);
  const res = useCached<AnyRow[]>(source, allowed);
  const days = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (weeks * 7 - 1));
    // Alinha o início ao domingo para as colunas representarem semanas.
    start.setDate(start.getDate() - start.getDay());
    const out: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(toIso(d));
    return out;
  }, [weeks]);
  if (!allowed) return null;
  const counts = new Map<string, number>();
  for (const row of res.data ?? []) {
    const day = String(row[dateKey] ?? "").slice(0, 10);
    if (day) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const cells = days.map((date) => ({ date, value: counts.get(date) ?? 0 }));
  const total = cells.reduce((a, c) => a + c.value, 0);
  return (
    <ChartPanel
      title={title}
      description={description}
      loading={res.loading}
      error={res.error}
      onRetry={res.reload}
      empty={!!res.data && total === 0}
      height={130}
      footer={res.data && total > 0 ? <>Total no intervalo: <span className="font-medium text-foreground tabular-nums">{formatInteger(total)}</span></> : undefined}
    >
      <CalendarHeatmap cells={cells} label={`${title}: ${formatInteger(total)} registros em ${weeks} semanas`} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ funil comercial
export function CommercialFunnel({ range }: { range: DateRange }) {
  const { can } = useSession();
  const quotesOk = can("sales_quotes.view");
  const ordersOk = can("sales_orders.view");
  const quotes = useCached<AnyRow[]>("/api/sales-quotes", quotesOk);
  const orders = useCached<AnyRow[]>("/api/sales-orders", ordersOk);
  if (!quotesOk || !ordersOk) return null;
  const q = (quotes.data ?? []).filter((r) => inRange(r.issued_at as string, range));
  const o = (orders.data ?? []).filter((r) => inRange(r.order_date as string, range));
  const stages = [
    { id: "q", label: "Orçamentos emitidos", value: q.length, href: "/comercial/orcamentos" },
    { id: "qa", label: "Orçamentos aprovados", value: q.filter((r) => String(r.status) === "approved").length, href: "/comercial/orcamentos?status=approved" },
    { id: "o", label: "Pedidos no período", value: o.filter((r) => String(r.status) !== "cancelled").length, href: "/comercial/pedidos-venda" },
    { id: "os", label: "Expedidos / concluídos", value: o.filter((r) => ["partially_shipped", "shipped", "completed"].includes(String(r.status))).length, href: "/logistica/expedicao" },
  ];
  return (
    <ChartPanel
      title="Funil comercial"
      description="Do orçamento à expedição no período — percentual em relação à etapa anterior."
      loading={quotes.loading || orders.loading}
      error={quotes.error ?? orders.error}
      empty={!!quotes.data && !!orders.data && stages.every((s) => s.value === 0)}
      height={140}
      table={{ columns: [{ label: "Etapa" }, { label: "Quantidade", align: "right" }], rows: stages.map((s) => [s.label, formatInteger(s.value)]) }}
    >
      <FunnelBars stages={stages} format={formatInteger} />
    </ChartPanel>
  );
}

// ------------------------------------------------------------ fluxos do ERP
type FlowId = "venda" | "compra" | "producao";

export function ErpFlows({ range, flows = ["venda", "compra", "producao"] }: { range: DateRange; flows?: FlowId[] }) {
  const { can } = useSession();
  const available = flows.filter((f) =>
    f === "venda" ? can("sales_orders.view") : f === "compra" ? can("purchase_orders.view") : can("production_orders.view")
  );
  const [tab, setTab] = useState<FlowId | null>(null);
  const active = tab && available.includes(tab) ? tab : available[0];
  if (available.length === 0) return null;
  return (
    <Panel>
      <PanelHeader title="Fluxo do ERP" description="Como os registros do período avançam pelas etapas — clique numa etapa para abrir a lista." />
      <div className="px-4 pt-1 pb-3">
        <Tabs value={active} onValueChange={(v) => setTab(v as FlowId)}>
          <TabsList>
            {available.includes("venda") && <TabsTrigger value="venda">Pedido à entrega</TabsTrigger>}
            {available.includes("compra") && <TabsTrigger value="compra">Compra ao recebimento</TabsTrigger>}
            {available.includes("producao") && <TabsTrigger value="producao">Produção</TabsTrigger>}
          </TabsList>
          <TabsContent value="venda">{active === "venda" && <SalesFlow range={range} />}</TabsContent>
          <TabsContent value="compra">{active === "compra" && <PurchaseFlow range={range} />}</TabsContent>
          <TabsContent value="producao">{active === "producao" && <ProductionFlow range={range} />}</TabsContent>
        </Tabs>
      </div>
    </Panel>
  );
}

function FlowBody({ flow, loading, error, onRetry, emptyText }: { flow: Flow | null; loading: boolean; error: string | null; onRetry: () => void; emptyText: string }) {
  if (loading) return <Skeleton className="h-60 w-full" />;
  if (error) return <EmptyState compact kind="error" title="Fluxo indisponível" description={error} onRetry={onRetry} />;
  if (!flow || flow.total === 0) return <EmptyState compact title="Sem movimento no período" description={emptyText} />;
  return (
    <>
      <FlowSankey flow={flow} />
      <p className="mt-1 text-xs text-muted-foreground">
        Base: <span className="font-medium text-foreground tabular-nums">{formatInteger(flow.total)}</span> registro(s) do período.
      </p>
    </>
  );
}

function SalesFlow({ range }: { range: DateRange }) {
  const { can } = useSession();
  const orders = useCached<AnyRow[]>("/api/sales-orders");
  const shipments = useCached<AnyRow[]>("/api/shipments", can("shipments.view"));
  const flow = orders.data ? buildOrderToDeliveryFlow(orders.data, shipments.data ?? [], range) : null;
  return <FlowBody flow={flow} loading={orders.loading} error={orders.error} onRetry={orders.reload} emptyText="Nenhum pedido de venda com data no período selecionado." />;
}

function PurchaseFlow({ range }: { range: DateRange }) {
  const { can } = useSession();
  const orders = useCached<AnyRow[]>("/api/purchase-orders");
  const receipts = useCached<AnyRow[]>("/api/purchase-receipts", can("purchase_receipts.view"));
  const flow = orders.data ? buildProcureToReceiveFlow(orders.data, receipts.data ?? [], range) : null;
  return <FlowBody flow={flow} loading={orders.loading} error={orders.error} onRetry={orders.reload} emptyText="Nenhum pedido de compra emitido no período selecionado." />;
}

function ProductionFlow({ range }: { range: DateRange }) {
  const orders = useCached<AnyRow[]>("/api/production-orders");
  const flow = orders.data ? buildProductionFlow(orders.data, range) : null;
  return <FlowBody flow={flow} loading={orders.loading} error={orders.error} onRetry={orders.reload} emptyText="Nenhuma ordem de produção planejada para o período selecionado." />;
}
