"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  CreditCard,
  Factory,
  Landmark,
  Package,
  Percent,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import { Breadcrumb, type Crumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { RevenueTrendChart, type RevenueTrendPoint } from "./RevenueTrendChart";
import { PipelineOverview, type PipelineStageSummary } from "./PipelineOverview";
import { RecentOrdersTable } from "./RecentOrdersTable";
import { TopSalesReps, type TopSalesRep } from "./TopSalesReps";
import { apiGet } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatInteger, formatPercent, percentChange } from "@/lib/format";
import type {
  ReportExecutiveResult,
  SalesOrderRow,
  PipelineRow,
  PipelineStageRow,
  OpportunityRow,
  SalesRepresentativeRow,
} from "@/lib/database/schema";

// Fase 19 (revisão) — "Visão geral" com a mesma linguagem visual/
// densidade de informação de um dashboard SalesOps de referência
// (hierarquia de KPIs em destaque + tendência + pipeline + atividade
// recente), mas os CONCEITOS são os do EDUCA.ERP: nenhum dado é
// fictício, tudo vem do reporting executivo real (fn_report_executive,
// Fase 12) e dos módulos Comercial/CRM já existentes. Reaproveitado
// tanto pela home ("/") quanto por /gestao/dashboard.

type PeriodRange = { periodStart: string; periodEnd: string };
type MonthRange = PeriodRange & { label: string };

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currentAndPreviousPeriod(): { current: PeriodRange; previous: PeriodRange } {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const current: PeriodRange = { periodStart: toIsoDate(firstOfMonth), periodEnd: toIsoDate(today) };

  const spanDays = Math.max(1, Math.round((today.getTime() - firstOfMonth.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(firstOfMonth.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (spanDays - 1) * 86_400_000);
  const previous: PeriodRange = { periodStart: toIsoDate(previousStart), periodEnd: toIsoDate(previousEnd) };

  return { current, previous };
}

function lastMonthRanges(count: number): MonthRange[] {
  const today = new Date();
  const ranges: MonthRange[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const lastMoment = i === 0 ? today : new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    ranges.push({
      periodStart: toIsoDate(firstOfMonth),
      periodEnd: toIsoDate(lastMoment),
      label: firstOfMonth.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return ranges;
}

async function fetchExecutiveReport(range: PeriodRange): Promise<ReportExecutiveResult | null> {
  const params = new URLSearchParams({ periodStart: range.periodStart, periodEnd: range.periodEnd });
  const res = await fetch(`/api/reports/executive?${params.toString()}`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.error?.message ?? "Não foi possível carregar o relatório executivo.");
  }
  return body.data ?? null;
}

function trendOf(current: number, previous: number): { change: string; trend: "up" | "down" } {
  const pct = percentChange(current, previous);
  if (pct === null) return { change: "—", trend: "up" };
  return { change: `${pct >= 0 ? "+" : ""}${formatPercent(pct)}`, trend: pct >= 0 ? "up" : "down" };
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="p-5">
          <span className="animate-skeleton block h-3 w-24 rounded bg-border-strong/60" />
          <span className="animate-skeleton mt-3 block h-7 w-32 rounded bg-border-strong/60" />
          <span className="animate-skeleton mt-3 block h-3 w-20 rounded bg-border-strong/50" />
        </Card>
      ))}
    </div>
  );
}

type PipelineWithStages = PipelineRow & { pipeline_stages: PipelineStageRow[] };

// Estados independentes por widget: a falha de um (ex.: pipeline) nunca
// derruba o dashboard inteiro nem esconde os demais widgets já
// carregados — cada seção mostra seu próprio erro/vazio.
export function ExecutiveDashboard({ breadcrumb }: { breadcrumb: Crumb[] }) {
  const [current, setCurrent] = useState<ReportExecutiveResult | null>(null);
  const [previous, setPrevious] = useState<ReportExecutiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [pipelineStages, setPipelineStages] = useState<PipelineStageSummary[]>([]);
  const [pipelineTotal, setPipelineTotal] = useState(0);
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const [recentOrders, setRecentOrders] = useState<SalesOrderRow[]>([]);
  const [topReps, setTopReps] = useState<TopSalesRep[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const customerNames = useIdNameLookup("/api/customers", "name");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { current: curRange, previous: prevRange } = currentAndPreviousPeriod();
        const [curData, prevData] = await Promise.all([fetchExecutiveReport(curRange), fetchExecutiveReport(prevRange)]);
        if (cancelled) return;
        setCurrent(curData);
        setPrevious(prevData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro inesperado ao carregar o dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setTrendLoading(true);
      setTrendError(null);
      try {
        const ranges = lastMonthRanges(6);
        const reports = await Promise.all(ranges.map((r) => fetchExecutiveReport(r)));
        if (cancelled) return;
        setTrend(ranges.map((r, i) => ({ label: r.label, value: reports[i]?.gross_revenue ?? 0 })));
      } catch (err) {
        if (!cancelled) setTrendError(err instanceof Error ? err.message : "Não foi possível carregar a tendência de faturamento.");
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPipelineLoading(true);
      setPipelineError(null);
      try {
        const [pipelines, opportunities] = await Promise.all([
          apiGet<PipelineWithStages[]>("/api/pipelines"),
          apiGet<OpportunityRow[]>("/api/opportunities?status=OPEN"),
        ]);
        if (cancelled) return;
        const activePipeline = pipelines.find((p) => p.status === "active") ?? pipelines[0];
        const stages = (activePipeline?.pipeline_stages ?? []).slice().sort((a, b) => a.sequence - b.sequence);
        const summaries: PipelineStageSummary[] = stages.map((stage) => {
          const stageOpportunities = opportunities.filter((o) => o.stage_id === stage.id);
          return {
            id: stage.id,
            name: stage.name,
            count: stageOpportunities.length,
            value: stageOpportunities.reduce((sum, o) => sum + o.estimated_value, 0),
          };
        });
        setPipelineStages(summaries);
        setPipelineTotal(opportunities.reduce((sum, o) => sum + o.estimated_value, 0));
      } catch (err) {
        if (!cancelled) setPipelineError(err instanceof Error ? err.message : "Não foi possível carregar o pipeline comercial.");
      } finally {
        if (!cancelled) setPipelineLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setOrdersLoading(true);
      setOrdersError(null);
      try {
        const [orders, reps] = await Promise.all([
          apiGet<SalesOrderRow[]>("/api/sales-orders"),
          apiGet<SalesRepresentativeRow[]>("/api/sales-representatives"),
        ]);
        if (cancelled) return;
        setRecentOrders(orders);

        const repNames = new Map(reps.map((r) => [r.id, r.name]));
        const totals = new Map<string, { total: number; count: number }>();
        for (const order of orders) {
          if (!order.sales_representative_id) continue;
          if (order.status === "cancelled" || order.status === "draft") continue;
          const entry = totals.get(order.sales_representative_id) ?? { total: 0, count: 0 };
          entry.total += order.total_amount;
          entry.count += 1;
          totals.set(order.sales_representative_id, entry);
        }
        const ranked: TopSalesRep[] = Array.from(totals.entries())
          .map(([id, { total, count }]) => ({ id, name: repNames.get(id) ?? id, total, ordersCount: count }))
          .sort((a, b) => b.total - a.total);
        setTopReps(ranked);
      } catch (err) {
        if (!cancelled) setOrdersError(err instanceof Error ? err.message : "Não foi possível carregar os pedidos recentes.");
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={breadcrumb} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Visão geral</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">
            Painel executivo do mês em curso, comparado ao mesmo intervalo do mês anterior — dados ao vivo de Comercial, CRM, Estoque, Financeiro e Produção.
          </p>
        </div>
      </div>

      {error && (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar o dashboard</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadKey((k) => k + 1)}>
            Tentar novamente
          </Button>
        </Card>
      )}

      {loading && !error && <DashboardSkeleton />}

      {!loading && !error && current && (
        <>
          {/* KPIs em destaque — mesmo ritmo visual de 4 cards do dashboard de referência */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Faturamento bruto"
              value={formatCurrencyBRL(current.gross_revenue)}
              {...trendOf(current.gross_revenue, previous?.gross_revenue ?? 0)}
              icon={Banknote}
              accent="brand"
              featured
            />
            <StatCard
              label="Margem bruta"
              value={formatPercent(current.gross_margin_pct)}
              {...trendOf(current.gross_margin_pct ?? 0, previous?.gross_margin_pct ?? 0)}
              icon={Percent}
              accent="info"
              featured
            />
            <StatCard
              label="Pedidos em aberto"
              value={formatInteger(current.open_sales_orders)}
              {...trendOf(current.open_sales_orders, previous?.open_sales_orders ?? 0)}
              icon={ShoppingCart}
              accent="warning"
              featured
            />
            <StatCard
              label="Contas a receber (aberto)"
              value={formatCurrencyBRL(current.accounts_receivable_open)}
              {...trendOf(current.accounts_receivable_open, previous?.accounts_receivable_open ?? 0)}
              icon={Wallet}
              accent="success"
              featured
            />
          </div>

          {/* Conteúdo principal: tendência + pedidos recentes (2/3) e pipeline + top vendedores (1/3) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              <RevenueTrendChart data={trend} loading={trendLoading} error={trendError} />
              <RecentOrdersTable orders={recentOrders} customerNames={customerNames} loading={ordersLoading} error={ordersError} />
            </div>
            <div className="flex flex-col gap-4">
              <PipelineOverview stages={pipelineStages} totalValue={pipelineTotal} loading={pipelineLoading} error={pipelineError} />
              <TopSalesReps reps={topReps} loading={ordersLoading} error={ordersError} />
            </div>
          </div>

          {/* Indicadores complementares */}
          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Indicadores complementares</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-success-soft text-success">
                  {current.managerial_result >= 0 ? <Wallet size={16} strokeWidth={1.75} /> : <AlertTriangle size={16} strokeWidth={1.75} />}
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Resultado gerencial</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatCurrencyBRL(current.managerial_result)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-info-soft text-info">
                  <Landmark size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Saldo em caixa</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatCurrencyBRL(current.cash_balance)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-warning-soft text-warning">
                  <CreditCard size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Contas a pagar (aberto)</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatCurrencyBRL(current.accounts_payable_open)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                  <Truck size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Expedições em aberto</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatInteger(current.open_shipments)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-success-soft text-success">
                  <Factory size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Ordens de produção</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatInteger(current.open_production_orders)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-neutral-soft text-neutral">
                  <Package size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Estoque valorizado</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatCurrencyBRL(current.inventory_value)}</p>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      {!loading && !error && !current && (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Boxes size={28} strokeWidth={1.5} className="text-ink-subtle" />
          <p className="text-[13.5px] font-medium text-ink">Não há registros.</p>
          <p className="max-w-sm text-[13px] text-ink-subtle">
            Nenhum movimento encontrado no mês atual para esta empresa. Os indicadores aparecem aqui assim que houver atividade comercial, financeira ou de estoque.
          </p>
        </Card>
      )}
    </div>
  );
}
