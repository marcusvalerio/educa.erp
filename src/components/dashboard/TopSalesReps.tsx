"use client";

import { Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL } from "@/lib/format";

// "Top Performers" adaptado para ERP: vendedores com maior faturamento
// no período, agregado no cliente a partir de /api/sales-orders reais
// (nunca um ranking fictício) — ver buildTopSalesReps em
// ExecutiveDashboard.tsx.
export type TopSalesRep = { id: string; name: string; total: number; ordersCount: number };

export function TopSalesReps({ reps, loading, error }: { reps: TopSalesRep[]; loading: boolean; error: string | null }) {
  const maxTotal = Math.max(1, ...reps.map((r) => r.total));

  return (
    <Card className="p-5">
      <div>
        <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Top vendedores</h3>
        <p className="text-[12px] text-ink-subtle">Faturamento por vendedor no período</p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {loading ? (
          Array.from({ length: 4 }, (_, i) => <span key={i} className="animate-skeleton block h-9 rounded-md bg-border-strong/60" />)
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Trophy size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[12.5px] text-ink-subtle">{error}</p>
          </div>
        ) : reps.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Trophy size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink">Não há registros.</p>
            <p className="max-w-xs text-[12px] text-ink-subtle">Nenhum pedido faturado por vendedor neste período.</p>
          </div>
        ) : (
          reps.slice(0, 5).map((rep, i) => (
            <div key={rep.id} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-ink">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{rep.name}</span>
                  <span className="shrink-0 text-[12.5px] font-medium text-ink">{formatCurrencyBRL(rep.total)}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-brand-tint" style={{ width: `${Math.max(4, (rep.total / maxTotal) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
