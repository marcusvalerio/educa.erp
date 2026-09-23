"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Checkbox } from "@/components/ui/Controls";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import type { ColumnDef, Density } from "./types";

// Tabela de ERP: densa, cabeçalho fixo dentro da área rolável, ordenação
// por coluna, seleção de linhas, ações por linha e estados completos. No
// mobile (< md) vira uma lista de cartões — mesma informação, sem rolagem
// horizontal.

export function defaultCellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

type DataTableProps<T> = {
  columns: ColumnDef<T>[];
  rows: T[];
  rowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /** Há filtro/busca ativos (vazio vira "sem resultados"). */
  filtered?: boolean;
  onClearFilters?: () => void;
  sort?: { id: string | null; dir: "asc" | "desc" };
  onSortChange?: (id: string) => void;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  onRowOpen?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  density?: Density;
  caption?: string;
  maxHeight?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowId,
  loading,
  error,
  onRetry,
  emptyTitle = "Nenhum registro ainda",
  emptyDescription,
  emptyAction,
  filtered,
  onClearFilters,
  sort,
  onSortChange,
  selectable,
  selected,
  onSelectedChange,
  onRowOpen,
  rowActions,
  density = "compact",
  caption,
  maxHeight = "calc(100dvh - 300px)",
}: DataTableProps<T>) {
  const rowH = density === "compact" ? "h-8" : "h-10";
  const allIds = rows.map(rowId);
  const selectedCount = selected ? allIds.filter((id) => selected.has(id)).length : 0;
  const allChecked = rows.length > 0 && selectedCount === rows.length ? true : selectedCount > 0 ? "indeterminate" : false;

  function toggleAll() {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (allChecked === true) allIds.forEach((id) => next.delete(id));
    else allIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  }

  function toggleOne(id: string) {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  }

  if (error) {
    return <EmptyState kind="error" title="Não foi possível carregar os dados" description={error} onRetry={onRetry} />;
  }
  if (loading && rows.length === 0) return <SkeletonRows columns={Math.min(columns.length, 6)} />;
  if (!loading && rows.length === 0) {
    return filtered ? (
      <EmptyState
        kind="no-results"
        title="Nenhum resultado para os filtros atuais"
        description="Ajuste a busca ou remova filtros para ver mais registros."
        action={
          onClearFilters ? (
            <button type="button" onClick={onClearFilters} className="text-sm font-medium underline-offset-4 hover:underline">
              Limpar filtros
            </button>
          ) : undefined
        }
      />
    ) : (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const titleCol = columns.find((c) => c.mobile === "title") ?? columns[0];
  const badgeCols = columns.filter((c) => c.mobile === "badge");
  const metaCols = columns.filter((c) => c.mobile === "meta").slice(0, 3);

  return (
    <div className={cn("relative", loading && "opacity-60 transition-opacity")} aria-busy={loading || undefined}>
      {/* Desktop / tablet */}
      <div className="hidden overflow-auto md:block" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="sticky top-0 z-10 w-9 border-b border-border bg-surface-muted pl-3">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Selecionar todos desta página" />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.id === col.id;
                const sortable = col.sortable !== false && !!onSortChange;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
                    style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                    className={cn(
                      "sticky top-0 z-10 h-8 border-b border-border bg-surface-muted px-3 text-left text-2xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center"
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(col.id)}
                        className={cn(
                          "inline-flex items-center gap-1 uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                          col.align === "right" && "flex-row-reverse",
                          active && "text-foreground"
                        )}
                      >
                        {col.header}
                        {active ? sort?.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="opacity-40" />}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
              {(rowActions || onRowOpen) && (
                <th scope="col" className="sticky top-0 z-10 w-12 border-b border-border bg-surface-muted pr-2">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const id = rowId(row);
              const isSelected = selected?.has(id) ?? false;
              return (
                <tr
                  key={id}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={onRowOpen ? (event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button,a,input,[role=checkbox],[role=menuitem]")) return;
                    onRowOpen(row);
                  } : undefined}
                  className={cn(
                    "group transition-colors hover:bg-surface-hover data-[state=selected]:bg-accent-soft/60",
                    onRowOpen && "cursor-pointer"
                  )}
                >
                  {selectable && (
                    <td className={cn("border-b border-border pl-3", rowH)}>
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(id)} aria-label="Selecionar linha" />
                    </td>
                  )}
                  {columns.map((col, index) => {
                    const content = col.cell ? col.cell(row) : defaultCellText(col.value?.(row));
                    return (
                      <td
                        key={col.id}
                        className={cn(
                          "border-b border-border px-3 whitespace-nowrap text-foreground",
                          rowH,
                          col.align === "right" && "text-right tabular-nums",
                          col.align === "center" && "text-center",
                          col.mono && "code text-xs",
                          index === 0 && "font-medium"
                        )}
                      >
                        {index === 0 && onRowOpen ? (
                          <button type="button" onClick={() => onRowOpen(row)} className="max-w-[28ch] truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                            {content}
                          </button>
                        ) : (
                          <span className="block max-w-[36ch] truncate">{content}</span>
                        )}
                      </td>
                    );
                  })}
                  {(rowActions || onRowOpen) && (
                    <td className={cn("border-b border-border pr-2 text-right", rowH)}>
                      <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {rowActions?.(row)}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões */}
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => {
          const id = rowId(row);
          return (
            <li key={id} className="flex items-start gap-3 px-3 py-3">
              {selectable && (
                <Checkbox className="mt-0.5" checked={selected?.has(id) ?? false} onCheckedChange={() => toggleOne(id)} aria-label="Selecionar" />
              )}
              <button type="button" disabled={!onRowOpen} onClick={() => onRowOpen?.(row)} className="min-w-0 flex-1 text-left disabled:cursor-default">
                <div className="flex items-start justify-between gap-2">
                  <span className={cn("truncate text-sm font-medium text-foreground", titleCol.mono && "code")}>
                    {titleCol.cell ? titleCol.cell(row) : defaultCellText(titleCol.value?.(row))}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {badgeCols.map((col) => (
                      <span key={col.id}>{col.cell ? col.cell(row) : defaultCellText(col.value?.(row))}</span>
                    ))}
                  </span>
                </div>
                {metaCols.length > 0 && (
                  <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {metaCols.map((col) => (
                      <div key={col.id} className="flex gap-1">
                        <dt className="text-subtle-foreground">{col.header}:</dt>
                        <dd className={cn("text-foreground", col.align === "right" && "tabular-nums")}>
                          {col.cell ? col.cell(row) : defaultCellText(col.value?.(row))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </button>
              <div className="flex shrink-0 items-center">
                {rowActions?.(row)}
                {onRowOpen && !rowActions && <ChevronRight size={16} className="text-subtle-foreground" aria-hidden />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
