"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { useCached, reportPath } from "@/lib/dashboard/client";
import { biggestChanges, formatMetric, type ReportDef } from "@/lib/dashboard/metrics";
import { percentChange } from "@/lib/format";
import type { DateRange } from "@/lib/dashboard/periods";

// Blocos de relatório: RESUMO (faixa de métricas com variação real) e
// MUDANÇAS (o que mais se moveu entre os períodos). Um relatório só é
// consultado se o usuário tiver a permissão dele.

export function useReportPair(report: ReportDef, range: DateRange, previous: DateRange, enabled: boolean) {
  const current = useCached<Record<string, unknown> | null>(reportPath(report.endpoint, range), enabled);
  const prior = useCached<Record<string, unknown> | null>(reportPath(report.endpoint, previous), enabled);
  return { current, prior };
}

export function SummaryStrip({
  report,
  range,
  previous,
  enabled,
  keys,
  columns = 4,
}: {
  report: ReportDef;
  range: DateRange;
  previous: DateRange;
  enabled: boolean;
  keys?: string[];
  columns?: 2 | 3 | 4 | 5 | 6;
}) {
  const { current, prior } = useReportPair(report, range, previous, enabled);
  const metrics = keys ? report.metrics.filter((m) => keys.includes(m.key)) : report.metrics.slice(0, 8);
  if (!enabled) return null;
  if (current.error) {
    return (
      <Panel>
        <EmptyState compact kind="error" title={`Não foi possível carregar o relatório ${report.label.toLowerCase()}`} description={current.error} onRetry={current.reload} />
      </Panel>
    );
  }
  return (
    <StatStrip columns={columns}>
      {metrics.map((metric) => {
        const c = current.data?.[metric.key];
        const p = prior.data?.[metric.key];
        const pct = c !== undefined && p !== undefined && c !== null && p !== null ? percentChange(Number(c), Number(p)) : null;
        return (
          <Stat
            key={metric.key}
            label={metric.label}
            value={formatMetric(c, metric.format)}
            loading={current.loading}
            href={metric.href}
            delta={prior.data ? { pct, goodWhen: metric.goodWhen ?? "up", label: metric.position ? "vs. posição anterior" : "vs. período anterior" } : undefined}
          />
        );
      })}
    </StatStrip>
  );
}

export function ChangesPanel({ report, range, previous, enabled }: { report: ReportDef; range: DateRange; previous: DateRange; enabled: boolean }) {
  const { current, prior } = useReportPair(report, range, previous, enabled);
  if (!enabled) return null;
  const changes = biggestChanges(report.metrics, current.data ?? null, prior.data ?? null);
  return (
    <Panel>
      <PanelHeader title="O que mudou" description="Maiores variações em relação ao período anterior de mesma duração." />
      {current.loading || prior.loading ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : current.error || prior.error ? (
        <EmptyState compact kind="error" title="Comparação indisponível" description={current.error ?? prior.error} onRetry={() => { current.reload(); prior.reload(); }} />
      ) : changes.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">Sem variações entre os períodos comparados.</p>
      ) : (
        <ul className="divide-y divide-border">
          {changes.map((change) => {
            const up = change.current > change.previous;
            const Icon = up ? ArrowUpRight : ArrowDownRight;
            const tone = change.good === null ? "text-muted-foreground" : change.good ? "text-success-fg" : "text-danger-fg";
            const row = (
              <div className="flex items-center gap-3 px-4 py-2">
                <Icon size={15} className={cn("shrink-0", tone)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{change.metric.label}</span>
                <span className="hidden text-xs text-subtle-foreground tabular-nums sm:inline">
                  {formatMetric(change.previous, change.metric.format)} →
                </span>
                <span className="text-sm font-medium tabular-nums">{formatMetric(change.current, change.metric.format)}</span>
                <span className={cn("w-16 text-right text-xs font-medium tabular-nums", tone)}>
                  {change.pct === null ? "novo" : `${change.pct > 0 ? "+" : ""}${change.pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </span>
                {change.metric.href && <ChevronRight size={14} className="shrink-0 text-subtle-foreground" aria-hidden />}
              </div>
            );
            return <li key={change.metric.key}>{change.metric.href ? <Link href={change.metric.href} className="block hover:bg-surface-hover">{row}</Link> : row}</li>;
          })}
        </ul>
      )}
    </Panel>
  );
}
