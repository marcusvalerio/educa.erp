"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrencyBRL } from "@/lib/format";

// Tendência de faturamento real (últimos N meses) — cada ponto vem de
// uma chamada real a fn_report_executive (ver ExecutiveDashboard), uma
// por mês. Cores via var(--color-*) (nunca hex fixo) para acompanhar
// o tema light/dark/system automaticamente — diferente do antigo
// RevenueChart.tsx (removido nesta etapa), que usava hex hardcoded e
// dados 100% simulados.
export type RevenueTrendPoint = { label: string; value: number };

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `R$ ${(value / 1_000).toFixed(0)}k`;
  return `R$ ${value.toFixed(0)}`;
}

export function RevenueTrendChart({ data, loading, error }: { data: RevenueTrendPoint[]; loading: boolean; error: string | null }) {
  const hasData = !loading && !error && data.some((d) => d.value > 0);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Tendência de faturamento</h3>
          <p className="text-[12px] text-ink-subtle">Receita bruta por mês, últimos {data.length || 6} meses</p>
        </div>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="h-2 w-2 rounded-full bg-brand" /> Faturamento
        </span>
      </div>

      <div className="mt-4 h-64">
        {loading ? (
          <div className="flex h-full items-end gap-2 px-2">
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className="animate-skeleton flex-1 rounded-t-md bg-border-strong/60"
                style={{ height: `${30 + ((i * 13) % 50)}%` }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <BarChart3 size={22} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[12.5px] text-ink-subtle">{error}</p>
          </div>
        ) : !hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <BarChart3 size={22} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink">Sem faturamento no período</p>
            <p className="max-w-xs text-[12px] text-ink-subtle">O gráfico aparece assim que houver pedidos faturados nos últimos meses.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="revenueTrendGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }} />
              <YAxis tickFormatter={formatCompact} tickLine={false} axisLine={false} tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }} width={56} />
              <Tooltip
                formatter={(value) => formatCurrencyBRL(Number(value))}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink)",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  boxShadow: "var(--shadow-raised)",
                }}
              />
              <Area type="monotone" dataKey="value" stroke="var(--color-brand)" strokeWidth={2} fill="url(#revenueTrendGradient)" animationDuration={500} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
