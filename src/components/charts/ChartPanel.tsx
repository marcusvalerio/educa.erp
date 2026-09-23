"use client";

import { useState, type ReactNode } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { Segmented } from "@/components/ui/Controls";

// Moldura de toda visualização do EDUCA: título que diz O QUE é medido,
// descrição curta com o recorte, alternância gráfico/tabela (nenhum valor
// fica preso num tooltip), e estados de carregando/vazio/erro/sem acesso.

export type ChartTable = {
  columns: Array<{ label: string; align?: "left" | "right" }>;
  rows: Array<Array<ReactNode>>;
};

type ChartPanelProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  legend?: ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  table?: ChartTable;
  height?: number;
  className?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function ChartPanel({
  title,
  description,
  actions,
  legend,
  loading,
  error,
  onRetry,
  empty,
  emptyTitle = "Sem dados no período",
  emptyDescription = "O gráfico aparece quando houver registros para o recorte selecionado.",
  table,
  height = 220,
  className,
  children,
  footer,
}: ChartPanelProps) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const showToggle = !!table && !loading && !error && !empty;
  return (
    <Panel className={cn("flex min-w-0 flex-col", className)}>
      <PanelHeader
        title={title}
        description={description}
        actions={
          <>
            {actions}
            {showToggle && (
              <Segmented
                label="Visualização"
                size="xs"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "chart", label: <span className="sr-only sm:not-sr-only">Gráfico</span>, icon: <BarChart3 size={12} /> },
                  { value: "table", label: <span className="sr-only sm:not-sr-only">Tabela</span>, icon: <Table2 size={12} /> },
                ]}
              />
            )}
          </>
        }
      />
      <div className="min-w-0 flex-1 px-4 py-3">
        {loading ? (
          <div className="flex flex-col justify-end gap-2" style={{ height }}>
            <Skeleton className="h-full w-full" />
          </div>
        ) : error ? (
          <EmptyState compact kind="error" title="Não foi possível carregar" description={error} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState compact title={emptyTitle} description={emptyDescription} />
        ) : mode === "table" && table ? (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs tracking-wide text-muted-foreground uppercase">
                  {table.columns.map((col) => (
                    <th key={col.label} scope="col" className={cn("border-b border-border py-1.5 pr-3 font-medium", col.align === "right" && "text-right")}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className={cn("py-1.5 pr-3", table.columns[j]?.align === "right" && "text-right tabular-nums")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {legend && <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
            {children}
          </>
        )}
      </div>
      {footer && <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{footer}</div>}
    </Panel>
  );
}

export function LegendItem({ color, label, kind = "rect" }: { color: string; label: ReactNode; kind?: "rect" | "line" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={kind === "line" ? "h-0.5 w-3 rounded-full" : "h-2.5 w-2.5 rounded-xs"} style={{ background: color }} />
      {label}
    </span>
  );
}
