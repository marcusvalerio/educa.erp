"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { PAGE_SIZES, pageCount } from "@/lib/list/query";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
};

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationProps) {
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);
  const fmt = (n: number) => n.toLocaleString("pt-BR");

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="tabular-nums" aria-live="polite">
          {total === 0 ? "Nenhum registro" : `${fmt(from)}–${fmt(to)} de ${fmt(total)}`}
        </span>
        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span>Por página</span>
            <Select
              size="sm"
              aria-label="Registros por página"
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
              options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
              className="w-16"
            />
          </label>
        )}
      </div>
      <nav aria-label="Paginação" className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Primeira página" disabled={current <= 1} onClick={() => onPageChange(1)} className="hidden sm:inline-flex">
          <ChevronsLeft size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Página anterior" disabled={current <= 1} onClick={() => onPageChange(current - 1)}>
          <ChevronLeft size={15} />
        </Button>
        <span className="px-2 tabular-nums">
          {fmt(current)} / {fmt(pages)}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Próxima página" disabled={current >= pages} onClick={() => onPageChange(current + 1)}>
          <ChevronRight size={15} />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Última página" disabled={current >= pages} onClick={() => onPageChange(pages)} className="hidden sm:inline-flex">
          <ChevronsRight size={15} />
        </Button>
      </nav>
    </div>
  );
}
