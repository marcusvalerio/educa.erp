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
  Receipt,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { formatCurrencyBRL, formatInteger, formatPercent, percentChange } from "@/lib/format";
import type { ReportExecutiveResult } from "@/lib/database/schema";

// Fase 19 — Dashboard executivo com dados REAIS: chama diretamente a
// mesma função de BI operacional (fn_report_executive, Fase 12) já
// usada por /api/reports/executive — nenhum número fictício/mock aqui
// (o antigo KPI_ROWS hardcoded de src/lib/pages/gestao.ts foi removido
// desta tela). A "tendência" de cada card é uma variação percentual
// REAL entre o período atual e o período anterior de mesma duração —
// nunca um valor inventado como nos StatCards mock de outras telas.

type PeriodRange = { periodStart: string; periodEnd: string };

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="p-5">
          <span className="animate-skeleton block h-3 w-24 rounded bg-border-strong/60" />
          <span className="animate-skeleton mt-3 block h-7 w-32 rounded bg-border-strong/60" />
          <span className="animate-skeleton mt-3 block h-3 w-20 rounded bg-border-strong/50" />
        </Card>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [current, setCurrent] = useState<ReportExecutiveResult | null>(null);
  const [previous, setPrevious] = useState<ReportExecutiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Gestão", href: "/gestao" }, { label: "Dashboard" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Dashboard executivo</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">
            Visão consolidada do mês em curso, comparada ao mesmo intervalo do mês anterior — dados ao vivo de Comercial, Estoque, Financeiro e Produção.
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Receita bruta"
              value={formatCurrencyBRL(current.gross_revenue)}
              {...trendOf(current.gross_revenue, previous?.gross_revenue ?? 0)}
              icon={Banknote}
              accent="brand"
              featured
            />
            <StatCard
              label="Resultado gerencial"
              value={formatCurrencyBRL(current.managerial_result)}
              {...trendOf(current.managerial_result, previous?.managerial_result ?? 0)}
              icon={current.managerial_result >= 0 ? Wallet : AlertTriangle}
              accent={current.managerial_result >= 0 ? "success" : "danger"}
              featured
            />
            <StatCard
              label="Margem bruta"
              value={formatPercent(current.gross_margin_pct)}
              {...trendOf(current.gross_margin_pct ?? 0, previous?.gross_margin_pct ?? 0)}
              icon={Percent}
              accent="info"
            />
            <StatCard
              label="Saldo em caixa"
              value={formatCurrencyBRL(current.cash_balance)}
              {...trendOf(current.cash_balance, previous?.cash_balance ?? 0)}
              icon={Landmark}
              accent="success"
            />
            <StatCard
              label="Contas a receber (aberto)"
              value={formatCurrencyBRL(current.accounts_receivable_open)}
              {...trendOf(current.accounts_receivable_open, previous?.accounts_receivable_open ?? 0)}
              icon={Receipt}
              accent="warning"
            />
            <StatCard
              label="Contas a pagar (aberto)"
              value={formatCurrencyBRL(current.accounts_payable_open)}
              {...trendOf(current.accounts_payable_open, previous?.accounts_payable_open ?? 0)}
              icon={CreditCard}
              accent="warning"
            />
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Indicadores operacionais (em aberto agora)</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                  <ShoppingCart size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Pedidos de venda</p>
                  <p className="font-display text-lg font-semibold text-ink">{formatInteger(current.open_sales_orders)}</p>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-info-soft text-info">
                  <Truck size={16} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Expedições</p>
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
          <p className="text-[13.5px] font-medium text-ink">Sem dados para o período</p>
          <p className="max-w-sm text-[13px] text-ink-subtle">
            Nenhum movimento encontrado no mês atual para esta empresa. Os indicadores aparecem aqui assim que houver atividade comercial, financeira ou de estoque.
          </p>
        </Card>
      )}
    </div>
  );
}
