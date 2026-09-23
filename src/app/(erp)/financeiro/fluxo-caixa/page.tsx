"use client";

import { useMemo } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/Feedback";
import { ChartPanel } from "@/components/charts/ChartPanel";
import { CHART, LineTrend } from "@/components/charts/Charts";
import { DetailSection, MiniTable } from "@/components/resource/DetailLayout";
import { useCached } from "@/lib/dashboard/client";
import { toIso } from "@/lib/dashboard/periods";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { CashFlowProjectionRow, CashFlowSummaryRow } from "@/lib/database/schema";

// Fluxo de caixa a partir de v_cash_flow_summary / v_cash_flow_projection:
// saldo atual das contas + títulos em aberto por vencimento. A projeção
// é só a soma acumulada desses títulos — nenhum valor é estimado.

type Bucket = { key: string; label: string; start: string; inflow: number; outflow: number; balance: number };

function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda-feira
  return d;
}

function buildBuckets(opening: number, rows: CashFlowProjectionRow[]): Bucket[] {
  const today = new Date();
  const thisWeek = toIso(weekStart(today));
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const [y, m, d] = row.due_date.slice(0, 10).split("-").map(Number);
    const start = toIso(weekStart(new Date(y, m - 1, d)));
    const overdue = start < thisWeek;
    const key = overdue ? "vencidos" : start;
    const bucket = map.get(key) ?? { key, label: overdue ? "Vencidos" : `Semana de ${formatDate(start)}`, start: overdue ? "0000-00-00" : start, inflow: 0, outflow: 0, balance: 0 };
    if (row.direction === "INFLOW") bucket.inflow += Number(row.amount) || 0;
    else bucket.outflow += Number(row.amount) || 0;
    map.set(key, bucket);
  }
  let running = opening;
  return [...map.values()]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => {
      running += b.inflow - b.outflow;
      return { ...b, balance: running };
    });
}

export default function FluxoCaixaPage() {
  const summary = useCached<CashFlowSummaryRow | null>("/api/cash-flow-summary");
  const projection = useCached<CashFlowProjectionRow[]>("/api/cash-flow-projection");
  const opening = Number(summary.data?.current_balance_total ?? 0);
  const buckets = useMemo(() => buildBuckets(opening, projection.data ?? []), [opening, projection.data]);
  const receivable = Number(summary.data?.open_receivable_total ?? 0);
  const payable = Number(summary.data?.open_payable_total ?? 0);
  const projected = opening + receivable - payable;
  const lowest = buckets.reduce<Bucket | null>((min, b) => (!min || b.balance < min.balance ? b : min), null);
  const error = summary.error ?? projection.error;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Fluxo de caixa" description="Saldo das contas financeiras e projeção pelos vencimentos dos títulos em aberto." />

      {error ? (
        <EmptyState kind="error" title="Não foi possível carregar o fluxo de caixa" description={error} onRetry={() => { summary.reload(); projection.reload(); }} />
      ) : (
        <>
          <StatStrip columns={4}>
            <Stat label="Saldo em contas" value={formatCurrencyBRL(opening)} loading={summary.loading} />
            <Stat label="A receber em aberto" value={formatCurrencyBRL(receivable)} loading={summary.loading} href="/financeiro/contas-receber?view=abertos" />
            <Stat label="A pagar em aberto" value={formatCurrencyBRL(payable)} loading={summary.loading} href="/financeiro/contas-pagar?view=abertos" />
            <Stat
              label="Saldo projetado"
              value={formatCurrencyBRL(projected)}
              tone={projected < 0 ? "danger" : "neutral"}
              hint={lowest && lowest.balance < 0 ? `Fica negativo em: ${lowest.label.toLowerCase()}` : "Após liquidar todos os títulos"}
              loading={summary.loading}
            />
          </StatStrip>

          <ChartPanel
            title="Saldo acumulado por semana"
            description="Saldo atual somado às entradas e saídas previstas, semana a semana. Títulos vencidos entram na primeira coluna."
            loading={summary.loading || projection.loading}
            empty={!!projection.data && buckets.length === 0}
            emptyTitle="Nenhum título em aberto"
            emptyDescription="A projeção aparece quando houver contas a pagar ou a receber em aberto."
            table={{
              columns: [{ label: "Período" }, { label: "Entradas", align: "right" }, { label: "Saídas", align: "right" }, { label: "Saldo", align: "right" }],
              rows: buckets.map((b) => [b.label, formatCurrencyBRL(b.inflow), formatCurrencyBRL(b.outflow), formatCurrencyBRL(b.balance)]),
            }}
          >
            <LineTrend
              data={buckets.map((b) => ({ label: b.key === "vencidos" ? "Vencidos" : formatDate(b.start).slice(0, 5), saldo: b.balance }))}
              series={[{ key: "saldo", label: "Saldo acumulado", color: CHART.primary, area: true }]}
              format={formatCurrencyBRL}
            />
          </ChartPanel>

          <DetailSection title="Projeção por semana" description="Entradas e saídas previstas pelos vencimentos.">
            <MiniTable
              rows={buckets}
              rowKey={(b) => b.key}
              empty={projection.loading ? "Carregando…" : "Nenhum título em aberto para projeção."}
              columns={[
                { label: "Período", cell: (b) => <span className={b.key === "vencidos" ? "font-medium text-danger-fg" : undefined}>{b.label}</span> },
                { label: "Entradas", align: "right", cell: (b) => formatCurrencyBRL(b.inflow) },
                { label: "Saídas", align: "right", cell: (b) => formatCurrencyBRL(b.outflow) },
                { label: "Saldo acumulado", align: "right", cell: (b) => <span className={b.balance < 0 ? "font-medium text-danger-fg" : "font-medium"}>{formatCurrencyBRL(b.balance)}</span> },
              ]}
            />
          </DetailSection>
        </>
      )}
    </div>
  );
}
