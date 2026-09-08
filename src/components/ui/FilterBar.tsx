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
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-end gap-3">
        {filters.map((filter) => (
          <div key={filter.key} className="flex min-w-[160px] flex-1 flex-col gap-1.5">
            <label htmlFor={filter.key} className="text-[11.5px] font-medium text-ink-muted">
              {filter.label}
            </label>
            {filter.type === "text" ? (
              <div className="relative">
                <Search
                  size={14}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  id={filter.key}
                  type="text"
                  value={values[filter.key] ?? ""}
                  onChange={(e) => onChange(filter.key, e.target.value)}
                  placeholder={filter.placeholder ?? "Buscar..."}
                  className="w-full rounded-lg border border-border-strong bg-surface py-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/12"
                />
              </div>
            ) : (
              <select
                id={filter.key}
                value={values[filter.key] ?? "Todos"}
                onChange={(e) => onChange(filter.key, e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/12"
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
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
          >
            <X size={13} strokeWidth={2} />
            Limpar filtros
          </button>
        )}
      </div>
      <p className="text-[12px] text-ink-subtle">
        {resultCount} {resultCount === 1 ? "registro encontrado" : "registros encontrados"}
      </p>
    </div>
  );
}
