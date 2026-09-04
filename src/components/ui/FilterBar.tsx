import { Search, X } from "lucide-react";
import type { FilterConfig } from "@/lib/pages/types";

type FilterBarProps = {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
  resultCount: number;
};

export function FilterBar({ filters, values, onChange, onReset, resultCount }: FilterBarProps) {
  const hasActiveFilters = Object.values(values).some((v) => v && v !== "Todos");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        {filters.map((filter) => (
          <div key={filter.key} className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <label htmlFor={filter.key} className="text-xs font-medium text-ink-muted">
              {filter.label}
            </label>
            {filter.type === "text" ? (
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  id={filter.key}
                  type="text"
                  value={values[filter.key] ?? ""}
                  onChange={(e) => onChange(filter.key, e.target.value)}
                  placeholder={filter.placeholder ?? "Buscar..."}
                  className="w-full rounded-lg border border-border-strong bg-surface py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
                />
              </div>
            ) : (
              <select
                id={filter.key}
                value={values[filter.key] ?? "Todos"}
                onChange={(e) => onChange(filter.key, e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15"
              >
                <option value="Todos">Todos</option>
                {filter.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
          </div>
        ))}
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
          >
            <X size={14} />
            Limpar filtros
          </button>
        )}
      </div>
      <p className="text-xs text-ink-subtle">
        {resultCount} {resultCount === 1 ? "registro encontrado" : "registros encontrados"}
      </p>
    </div>
  );
}
