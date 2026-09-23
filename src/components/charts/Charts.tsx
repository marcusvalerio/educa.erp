"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { toneDotClass, type Tone } from "@/components/ui/Badge";

// Camada visual única dos gráficos (Recharts + HTML):
//   - marcas finas: colunas <= 24px, ponta arredondada de 4px, linha 2px;
//   - grade em hairline sólida e recessiva; textos em tokens de texto;
//   - neutros por padrão, cor semântica só quando significa algo;
//   - tooltip em todo gráfico interativo (valor em destaque, rótulo depois).

export const CHART = {
  primary: "var(--color-chart-1)",
  secondary: "var(--color-chart-2)",
  attention: "var(--color-chart-3)",
  problem: "var(--color-chart-4)",
  critical: "var(--color-chart-5)",
  grid: "var(--color-chart-grid)",
  axis: "var(--color-subtle-foreground)",
  success: "var(--color-success)",
};

const axisTick = { fill: CHART.axis, fontSize: 11 };

export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

type Formatter = (value: number) => string;

type TooltipEntry = { dataKey?: unknown; value?: unknown; name?: unknown; color?: string };
type TooltipBase = { active?: boolean; payload?: ReadonlyArray<TooltipEntry>; label?: unknown };

function ChartTooltip({ active, payload, label, format, labels }: TooltipBase & { format: Formatter; labels?: Record<string, string> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-popover">
      <p className="mb-1 font-medium text-muted-foreground">{String(label ?? "")}</p>
      <ul className="flex flex-col gap-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: String(entry.color ?? CHART.primary) }} />
              {labels?.[String(entry.dataKey)] ?? String(entry.name ?? "")}
            </span>
            <span className="font-semibold text-foreground tabular-nums">{format(Number(entry.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ colunas
export type ColumnDatum = { label: string; value: number; highlight?: boolean };

/** Série única ao longo do tempo. Destaque (ex.: mês atual) no tom principal; o resto recua. */
export function ColumnTrend({ data, format, height = 220, seriesLabel }: { data: ColumnDatum[]; format: Formatter; height?: number; seriesLabel: string }) {
  return (
    <div style={{ height }} role="img" aria-label={`${seriesLabel}: ${data.map((d) => `${d.label} ${format(d.value)}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
          <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} tick={axisTick} width={48} />
          <Tooltip cursor={{ fill: "var(--color-surface-hover)" }} content={(props) => <ChartTooltip active={props.active} payload={props.payload as ReadonlyArray<TooltipEntry> | undefined} label={props.label} format={format} labels={{ value: seriesLabel }} />} />
          <Bar dataKey="value" name={seriesLabel} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.highlight ? CHART.primary : CHART.secondary} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ linhas
export type LineSeries = { key: string; label: string; color: string; area?: boolean };

export function LineTrend({
  data,
  series,
  format,
  height = 220,
  xKey = "label",
}: {
  data: Array<Record<string, number | string>>;
  series: LineSeries[];
  format: Formatter;
  height?: number;
  xKey?: string;
}) {
  const labels = Object.fromEntries(series.map((s) => [s.key, s.label]));
  const Chart = series.some((s) => s.area) ? AreaChart : LineChart;
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.label).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <Chart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={axisTick} minTickGap={16} />
          <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} tick={axisTick} width={48} />
          <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={(props) => <ChartTooltip active={props.active} payload={props.payload as ReadonlyArray<TooltipEntry> | undefined} label={props.label} format={format} labels={labels} />} />
          {series.map((s) =>
            s.area ? (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                fill={s.color}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
            ) : (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              />
            )
          )}
        </Chart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------ ranking
export type RankItem = { id: string; label: string; value: number; href?: string; sublabel?: string };

/** Ranking horizontal (HTML): rótulo, barra fina, valor na ponta. */
export function RankingBars({ items, format, max: maxProp }: { items: RankItem[]; format: Formatter; max?: number }) {
  const max = maxProp ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="flex flex-col gap-2.5">
      {items.map((item, index) => {
        const pct = Math.max(2, (item.value / max) * 100);
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-4 shrink-0 text-right text-2xs text-subtle-foreground tabular-nums">{index + 1}</span>
                <span className="truncate text-foreground group-hover:underline">{item.label}</span>
                {item.sublabel && <span className="hidden truncate text-xs text-subtle-foreground sm:inline">{item.sublabel}</span>}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{format(item.value)}</span>
            </div>
            <div className="mt-1 ml-6 h-1.5 rounded-full bg-muted">
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} />
            </div>
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-ring">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------ distribuição
export type DistributionPart = { id: string; label: string; value: number; tone: Tone; href?: string };

/** Uma barra empilhada (parte-todo) com vão de 2px entre segmentos + legenda. */
export function DistributionBar({ parts, format = (v) => v.toLocaleString("pt-BR") }: { parts: DistributionPart[]; format?: Formatter }) {
  const total = parts.reduce((acc, p) => acc + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm" role="img" aria-label={visible.map((p) => `${p.label}: ${format(p.value)}`).join("; ")}>
        {visible.map((part) => (
          <div key={part.id} title={`${part.label}: ${format(part.value)}`} className={cn("h-full first:rounded-l-sm last:rounded-r-sm", toneDotClass(part.tone))} style={{ width: `${(part.value / Math.max(total, 1)) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {parts.map((part) => {
          const row = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-xs", toneDotClass(part.tone))} />
                <span className="truncate text-muted-foreground">{part.label}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium text-foreground">{format(part.value)}</span>
                <span className="ml-1.5 text-xs text-subtle-foreground">{total > 0 ? `${Math.round((part.value / total) * 100)}%` : "—"}</span>
              </span>
            </>
          );
          return (
            <li key={part.id}>
              {part.href ? (
                <Link href={part.href} className="flex items-center justify-between gap-2 rounded-sm hover:bg-surface-hover">
                  {row}
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-2">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ funil
export type FunnelStage = { id: string; label: string; value: number; href?: string };

/** Funil ordinal (etapas em sequência) com conversão entre etapas. */
export function FunnelBars({ stages, format = (v) => v.toLocaleString("pt-BR") }: { stages: FunnelStage[]; format?: Formatter }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-2">
      {stages.map((stage, index) => {
        const prev = index > 0 ? stages[index - 1].value : null;
        const conv = prev && prev > 0 ? Math.round((stage.value / prev) * 100) : null;
        const inner = (
          <div className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-muted-foreground">{stage.label}</span>
            <div className="h-5 rounded-sm bg-muted">
              <div className="h-full rounded-sm bg-chart-1" style={{ width: `${Math.max(1.5, (stage.value / max) * 100)}%` }} />
            </div>
            <span className="w-24 text-right tabular-nums">
              <span className="font-medium">{format(stage.value)}</span>
              {conv !== null && <span className="ml-1.5 text-xs text-subtle-foreground">{conv}%</span>}
            </span>
          </div>
        );
        return <li key={stage.id}>{stage.href ? <Link href={stage.href} className="block rounded-sm hover:bg-surface-hover">{inner}</Link> : inner}</li>;
      })}
    </ol>
  );
}

// ------------------------------------------------------------ heatmap
export type HeatCell = { date: string; value: number };

/** Calendário de intensidade (uma cor, claro -> escuro). Semanas em colunas. */
export function CalendarHeatmap({ cells, format = (v) => v.toLocaleString("pt-BR"), label }: { cells: HeatCell[]; format?: Formatter; label: string }) {
  const max = Math.max(1, ...cells.map((c) => c.value));
  const weeks: HeatCell[][] = [];
  cells.forEach((cell, i) => {
    const w = Math.floor(i / 7);
    (weeks[w] ??= []).push(cell);
  });
  const days = ["D", "S", "T", "Q", "Q", "S", "S"];
  return (
    <div className="flex items-start gap-2 overflow-x-auto" role="img" aria-label={label}>
      <div className="grid grid-rows-7 gap-1 pt-0 text-2xs text-subtle-foreground">
        {days.map((d, i) => (
          <span key={i} className="flex h-3.5 items-center">
            {i % 2 === 1 ? d : ""}
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        {weeks.map((week, w) => (
          <div key={w} className="grid grid-rows-7 gap-1">
            {week.map((cell) => {
              const level = cell.value === 0 ? 0 : Math.ceil((cell.value / max) * 4);
              return (
                <span
                  key={cell.date}
                  title={`${new Date(cell.date + "T00:00:00").toLocaleDateString("pt-BR")}: ${format(cell.value)}`}
                  className="h-3.5 w-3.5 rounded-xs"
                  style={{
                    background: level === 0 ? "var(--color-muted)" : `color-mix(in srgb, var(--color-chart-1) ${[0, 25, 50, 75, 100][level]}%, var(--color-muted))`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ sparkline
export function Sparkline({ values, className, strokeClass = "stroke-chart-1" }: { values: number[]; className?: string; strokeClass?: string }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-6 w-20", className)} aria-hidden>
      <polyline points={points} fill="none" className={strokeClass} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function SmallMultiples({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}
