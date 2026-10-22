"use client";

import { useState } from "react";
import Link from "next/link";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { toneDotClass, type Tone } from "@/components/ui/Badge";
import { CHART, compactNumber } from "./Charts";

// Meias roscas e tendência com projeção. Mesmas regras da camada visual
// (Charts.tsx): marcas finas, textos em tokens de texto, cor semântica só
// quando significa algo, todo valor também na tabela do ChartPanel.

type Formatter = (value: number) => string;

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--color-subtle-foreground)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  critical: "var(--color-critical)",
  info: "var(--color-info)",
  accent: "var(--color-accent)",
};

// Geometria da meia rosca: centro (100,100), raio 80, de 180° (esquerda) a 0° (direita).
const CX = 100;
const CY = 100;
const R = 80;
const STROKE = 16;

function point(fraction: number) {
  const angle = Math.PI * (1 - Math.min(Math.max(fraction, 0), 1));
  return { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

function arc(from: number, to: number) {
  const a = point(from);
  const b = point(to);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

// ------------------------------------------------------------ indicador (um valor)
/**
 * Meia rosca de um indicador percentual (0–100%). Opcionalmente marca uma
 * meta. O número grande no centro é o valor; a rosca dá a proporção.
 */
export function HalfGauge({
  value,
  label,
  target,
  tone = "neutral",
  caption,
}: {
  /** Percentual, 0 a 100 (valores fora são limitados no desenho, não no texto). */
  value: number;
  label: string;
  target?: number;
  tone?: Tone;
  caption?: string;
}) {
  const fraction = value / 100;
  const color = tone === "neutral" ? CHART.primary : TONE_COLOR[tone];
  const tick = target !== undefined ? point(target / 100) : null;
  const text = `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <figure className="flex flex-col items-center" aria-label={`${label}: ${text}${target !== undefined ? `; meta ${target}%` : ""}`}>
      <div className="relative w-full max-w-64">
        <svg viewBox="0 0 200 112" className="block w-full" role="img" aria-hidden>
          <path d={arc(0, 1)} fill="none" stroke={CHART.grid} strokeWidth={STROKE} strokeLinecap="round" />
          {fraction > 0 && <path d={arc(0, fraction)} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />}
          {tick && (
            <line
              x1={CX + (tick.x - CX) * ((R - STROKE / 2 - 4) / R)}
              y1={CY + (tick.y - CY) * ((R - STROKE / 2 - 4) / R)}
              x2={CX + (tick.x - CX) * ((R + STROKE / 2 + 4) / R)}
              y2={CY + (tick.y - CY) * ((R + STROKE / 2 + 4) / R)}
              stroke="var(--color-foreground)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">{text}</span>
        </div>
      </div>
      <figcaption className="mt-1 text-center text-sm text-muted-foreground">
        {label}
        {target !== undefined && <span className="block text-xs text-subtle-foreground">Meta: {target.toLocaleString("pt-BR")}%</span>}
        {caption && <span className="block text-xs text-subtle-foreground">{caption}</span>}
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------ partes de um todo
export type DonutPart = { id: string; label: string; value: number; tone: Tone; href?: string };

/**
 * Meia rosca segmentada (parte-todo). Ao passar o mouse/tocar num pedaço, o
 * centro mostra aquele pedaço; sem foco, mostra o total.
 */
export function HalfDonut({ parts, format, totalLabel = "Total" }: { parts: DonutPart[]; format: Formatter; totalLabel?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = parts.reduce((acc, p) => acc + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  const gap = visible.length > 1 ? 2 / (Math.PI * R) : 0; // 2px de vão entre pedaços
  const usable = 1 - gap * (visible.length - 1);
  const sizes = visible.map((p) => (p.value / Math.max(total, 1)) * usable);
  const segments = visible.map((p, i) => {
    const from = sizes.slice(0, i).reduce((a, b) => a + b, 0) + gap * i;
    return { ...p, from, to: from + sizes[i] };
  });
  const focus = parts.find((p) => p.id === active);
  return (
    <div>
      <div className="relative mx-auto w-full max-w-72">
        <svg viewBox="0 0 200 112" className="block w-full" role="img" aria-label={visible.map((p) => `${p.label}: ${format(p.value)}`).join("; ")}>
          {segments.length === 0 && <path d={arc(0, 1)} fill="none" stroke={CHART.grid} strokeWidth={STROKE} />}
          {segments.map((s) => (
            <path
              key={s.id}
              d={arc(s.from, Math.max(s.to, s.from + 0.002))}
              fill="none"
              stroke={TONE_COLOR[s.tone]}
              strokeWidth={active === s.id ? STROKE + 4 : STROKE}
              opacity={active && active !== s.id ? 0.35 : 1}
              className="cursor-pointer transition-[stroke-width,opacity] duration-150"
              onMouseEnter={() => setActive(s.id)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setActive((cur) => (cur === s.id ? null : s.id))}
            >
              <title>{`${s.label}: ${format(s.value)}`}</title>
            </path>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{format(focus ? focus.value : total)}</span>
          <span className="max-w-[70%] truncate text-xs text-muted-foreground">
            {focus ? `${focus.label} · ${total > 0 ? Math.round((focus.value / total) * 100) : 0}%` : totalLabel}
          </span>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-sm">
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
          const common = {
            onMouseEnter: () => setActive(part.id),
            onMouseLeave: () => setActive(null),
            className: cn("flex items-center justify-between gap-2 rounded-sm", active === part.id && "bg-surface-hover"),
          };
          return <li key={part.id}>{part.href ? <Link href={part.href} {...common} className={cn(common.className, "hover:bg-surface-hover")}>{row}</Link> : <div {...common}>{row}</div>}</li>;
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ tendência com projeção
export type ProjectionPoint = { label: string; actual?: number; partial?: number; projected?: number; range?: [number, number] };

/**
 * Projeção simples: reta de tendência (mínimos quadrados) sobre os meses
 * fechados, estendida `ahead` meses, com faixa provável de ± o desvio dos
 * meses em relação à reta (mínimo de 10%). O mês atual é parcial e não
 * entra no cálculo.
 */
export function buildProjection(months: Array<{ label: string; value: number }>, futureLabels: string[]): ProjectionPoint[] {
  const closed = months.slice(0, -1);
  const n = closed.length;
  const xs = closed.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / Math.max(n, 1);
  const meanY = closed.reduce((a, m) => a + m.value, 0) / Math.max(n, 1);
  const den = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : xs.reduce((a, x, i) => a + (x - meanX) * (closed[i].value - meanY), 0) / den;
  const intercept = meanY - slope * meanX;
  const fit = (x: number) => Math.max(0, intercept + slope * x);
  const resid = Math.sqrt(closed.reduce((a, m, i) => a + (m.value - fit(i)) ** 2, 0) / Math.max(n - 1, 1));

  // O mês atual ainda não fechou: vira um ponto à parte ("até hoje"), sem
  // ligar à linha — senão parece uma queda.
  const points: ProjectionPoint[] = months.map((m, i) => (i === months.length - 1 ? { label: m.label, partial: m.value } : { label: m.label, actual: m.value }));
  // A linha projetada sai do último mês fechado, para ligar as duas.
  if (n > 0) {
    const last = points[n - 1];
    last.projected = last.actual;
    last.range = [last.actual ?? 0, last.actual ?? 0];
  }
  // Mês atual (parcial) e meses futuros recebem a projeção.
  const futureStart = n;
  const allFuture = [months[months.length - 1]?.label, ...futureLabels].filter(Boolean) as string[];
  allFuture.forEach((label, k) => {
    const x = futureStart + k;
    const p = fit(x);
    const spread = Math.max(resid, p * 0.1);
    const existing = points.find((pt) => pt.label === label && k === 0);
    const target = existing ?? { label };
    target.projected = Math.round(p * 100) / 100;
    target.range = [Math.max(0, p - spread), p + spread];
    if (!existing) points.push(target);
  });
  return points;
}

type ProjTooltipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: ProjectionPoint }>; label?: unknown; format: Formatter };

function ProjectionTooltip({ active, payload, label, format }: ProjTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="min-w-44 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-popover">
      <p className="mb-1 font-medium text-muted-foreground">{String(label ?? "")}</p>
      <ul className="flex flex-col gap-1">
        {point.actual !== undefined && (
          <li className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: CHART.primary }} /> Realizado
            </span>
            <span className="font-semibold text-foreground tabular-nums">{format(point.actual)}</span>
          </li>
        )}
        {point.partial !== undefined && (
          <li className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="h-2 w-2 rounded-full border-2" style={{ borderColor: CHART.primary }} /> Até hoje (mês aberto)
            </span>
            <span className="font-semibold text-foreground tabular-nums">{format(point.partial)}</span>
          </li>
        )}
        {point.projected !== undefined && (
          <li className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: CHART.attention }} /> Projeção
            </span>
            <span className="font-semibold text-foreground tabular-nums">{format(point.projected)}</span>
          </li>
        )}
        {point.range && point.range[1] > point.range[0] && (
          <li className="text-subtle-foreground">
            Provável: {format(point.range[0])} a {format(point.range[1])}
          </li>
        )}
      </ul>
    </div>
  );
}

export function ProjectionTrend({ data, format, height = 240 }: { data: ProjectionPoint[]; format: Formatter; height?: number }) {
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: CHART.primary }} /> Realizado
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full border-2" style={{ borderColor: CHART.primary }} /> Mês atual, até hoje
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 rounded-full border-t-2 border-dashed" style={{ borderColor: CHART.attention }} /> Projeção
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-4 rounded-xs" style={{ background: CHART.attention, opacity: 0.18 }} /> Faixa provável
        </li>
      </ul>
      <div style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.actual !== undefined ? format(d.actual) : d.partial !== undefined ? `até hoje ${format(d.partial)}` : `projeção ${format(d.projected ?? 0)}`}`).join("; ")}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} />
            <YAxis tickFormatter={compactNumber} tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} width={48} />
            <Tooltip cursor={{ stroke: CHART.axis, strokeWidth: 1 }} content={(props) => <ProjectionTooltip active={props.active} payload={props.payload as ProjTooltipProps["payload"]} label={props.label} format={format} />} />
            <Area dataKey="range" stroke="none" fill={CHART.attention} fillOpacity={0.18} isAnimationActive={false} connectNulls activeDot={false} />
            <Line dataKey="projected" stroke={CHART.attention} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, strokeWidth: 2, fill: "var(--color-surface)" }} isAnimationActive={false} connectNulls />
            <Line dataKey="partial" stroke="none" dot={{ r: 5, strokeWidth: 2, stroke: CHART.primary, fill: "var(--color-surface)" }} activeDot={{ r: 6, strokeWidth: 2, stroke: CHART.primary, fill: "var(--color-surface)" }} isAnimationActive={false} />
            <Line dataKey="actual" stroke={CHART.primary} strokeWidth={2} dot={{ r: 4, strokeWidth: 0, fill: CHART.primary }} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-surface)" }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
