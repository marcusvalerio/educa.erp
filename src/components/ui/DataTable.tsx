import clsx from "clsx";
import type { ReactNode } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ColumnConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

export type SortDir = "asc" | "desc";

type EmptyStateConfig = {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
};

type DataTableProps = {
  columns: ColumnConfig[];
  rows: Row[];
  emptyHint?: string;
  emptyState?: EmptyStateConfig;
  renderActions?: (row: Row) => React.ReactNode;
  /** Chave da coluna ordenada e direção atual — omitir desativa a UI de ordenação. */
  sort?: { key: string; dir: SortDir };
  onSortChange?: (key: string) => void;
  onRowClick?: (row: Row) => void;
};

export function DataTable({
  columns,
  rows,
  emptyHint,
  emptyState,
  renderActions,
  sort,
  onSortChange,
  onRowClick,
}: DataTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyState?.icon}
        title={emptyState?.title}
        description={emptyState?.description ?? emptyHint ?? "Ajuste os filtros para encontrar o que você procura."}
        action={emptyState?.action}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[720px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50">
            {columns.map((col) => {
              const sortable = Boolean(onSortChange) && col.sortable !== false;
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  className={clsx(
                    "px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center"
                  )}
                >
                  {sortable ? (
                    <button
                      onClick={() => onSortChange?.(col.key)}
                      className={clsx(
                        "inline-flex items-center gap-1 transition-colors duration-100 hover:text-ink",
                        col.align === "right" && "flex-row-reverse",
                        active && "text-brand-ink"
                      )}
                    >
                      {col.label}
                      {active ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp size={12} strokeWidth={2} />
                        ) : (
                          <ArrowDown size={12} strokeWidth={2} />
                        )
                      ) : (
                        <ChevronsUpDown size={12} strokeWidth={2} className="text-ink-subtle/60" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
            {renderActions && (
              <th className="px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Ações
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(row);
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              aria-label={onRowClick ? `Ver detalhes: ${row[columns[0].key]}` : undefined}
              className={clsx(
                "group border-b border-border last:border-0 transition-colors duration-100 hover:bg-surface-hover/60",
                onRowClick && "cursor-pointer focus-visible:outline-none focus-visible:bg-surface-hover/60"
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    "px-4 py-3 whitespace-nowrap text-ink",
                    col.align === "right" && "text-right tabular-nums",
                    col.align === "center" && "text-center"
                  )}
                >
                  {col.render === "status" ? (
                    <StatusBadge status={String(row[col.key])} />
                  ) : (
                    <span className={col.key === columns[0].key ? "font-medium" : ""}>
                      {row[col.key]}
                    </span>
                  )}
                </td>
              ))}
              {renderActions && (
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end opacity-70 transition-opacity duration-100 group-hover:opacity-100">
                    {renderActions(row)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
