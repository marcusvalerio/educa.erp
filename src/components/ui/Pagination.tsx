import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ page, pageCount, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1
  );

  return (
    <div className="flex flex-col items-center justify-between gap-3 px-1 py-2 sm:flex-row">
      <p className="text-xs text-ink-subtle">
        Mostrando <span className="font-medium text-ink-muted">{start}–{end}</span> de{" "}
        <span className="font-medium text-ink-muted">{totalItems}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong text-ink-muted hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} />
        </button>
        {pages.map((p, i) => {
          const prev = pages[i - 1];
          const gap = prev !== undefined && p - prev > 1;
          return (
            <span key={p} className="flex items-center gap-1">
              {gap && <span className="px-1 text-ink-subtle">…</span>}
              <button
                onClick={() => onPageChange(p)}
                className={clsx(
                  "flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors",
                  p === page
                    ? "bg-brand text-white"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink"
                )}
              >
                {p}
              </button>
            </span>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong text-ink-muted hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
          aria-label="Próxima página"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
