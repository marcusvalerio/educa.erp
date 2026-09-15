"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Landmark, RefreshCcw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { apiGet } from "@/lib/api-client";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { CashFlowSummaryRow, CashFlowProjectionRow } from "@/lib/database/schema";
import type { Row } from "@/lib/mock/generators";

// Fase 19 — dados reais de v_cash_flow_summary/v_cash_flow_projection
// (Fase 7, Financeiro) — resumo é um único registro (não uma lista),
// por isso esta tela é bespoke em vez de ResourceListPage.
export default function FluxoCaixaPage() {
  const [summary, setSummary] = useState<CashFlowSummaryRow | null>(null);
  const [projection, setProjection] = useState<CashFlowProjectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [summaryData, projectionData] = await Promise.all([
          apiGet<CashFlowSummaryRow>("/api/cash-flow-summary"),
          apiGet<CashFlowProjectionRow[]>("/api/cash-flow-projection"),
        ]);
        if (cancelled) return;
        setSummary(summaryData);
        setProjection(projectionData ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o fluxo de caixa.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const projectionRows: Row[] = projection.map((item, i) => ({
    id: String(i),
    due_date: formatDate(item.due_date),
    direction: item.direction,
    amount: formatCurrencyBRL(item.amount),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Financeiro", href: "/financeiro" }, { label: "Fluxo de caixa" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Fluxo de caixa</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">
            Saldo consolidado e projeção de entradas/saídas a partir dos títulos e contas financeiras reais.
          </p>
        </div>
      </div>

      {error ? (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar o fluxo de caixa</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </Card>
      ) : loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Card key={i} className="p-5">
                <span className="animate-skeleton block h-3 w-24 rounded bg-border-strong/60" />
                <span className="animate-skeleton mt-3 block h-7 w-32 rounded bg-border-strong/60" />
              </Card>
            ))}
          </div>
          <TableSkeleton columns={3} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="flex items-center gap-3 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                <Landmark size={18} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">Saldo em contas</p>
                <p className="font-display mt-1 text-xl font-semibold text-ink">{formatCurrencyBRL(summary?.current_balance_total ?? 0)}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-success-soft text-success">
                <ArrowUpCircle size={18} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">A receber (aberto)</p>
                <p className="font-display mt-1 text-xl font-semibold text-ink">{formatCurrencyBRL(summary?.open_receivable_total ?? 0)}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-warning-soft text-warning">
                <ArrowDownCircle size={18} strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">A pagar (aberto)</p>
                <p className="font-display mt-1 text-xl font-semibold text-ink">{formatCurrencyBRL(summary?.open_payable_total ?? 0)}</p>
              </div>
            </Card>
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Projeção por vencimento</p>
            <DataTable
              columns={[
                { key: "due_date", label: "Vencimento" },
                { key: "direction", label: "Direção", render: "status" },
                { key: "amount", label: "Valor", align: "right" },
              ]}
              rows={projectionRows}
              emptyHint="Nenhum título em aberto para projeção."
            />
          </div>
        </>
      )}
    </div>
  );
}
