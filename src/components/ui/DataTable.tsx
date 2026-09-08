import clsx from "clsx";
import { MoreHorizontal, Inbox } from "lucide-react";
import type { ColumnConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import { StatusBadge } from "./StatusBadge";

type DataTableProps = {
  columns: ColumnConfig[];
  rows: Row[];
  emptyHint?: string;
  renderActions?: (row: Row) => React.ReactNode;
};

export function DataTable({ columns, rows, emptyHint, renderActions }: DataTableProps) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface py-16 text-center animate-fade-in">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-hover">
          <Inbox size={20} strokeWidth={1.5} className="text-ink-subtle" />
        </span>
        <div>
          <p className="text-[13.5px] font-medium text-ink">Nenhum registro encontrado</p>
          <p className="mt-1 text-[13px] text-ink-subtle">
            {emptyHint ?? "Ajuste os filtros para encontrar o que você procura."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
      <table className="w-full min-w-[720px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-sunken/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  "px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center"
                )}
              >
                {col.label}
              </th>
            ))}
            <th className="px-4 py-3 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              Ações
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              className="group border-b border-border last:border-0 transition-colors duration-100 hover:bg-surface-hover/60"
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
              <td className="px-4 py-3 text-right">
                {renderActions ? (
                  <div className="flex justify-end opacity-70 transition-opacity duration-100 group-hover:opacity-100">
                    {renderActions(row)}
                  </div>
                ) : (
                  <button
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
                    aria-label="Mais ações"
                  >
                    <MoreHorizontal size={16} strokeWidth={1.75} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
