"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import type { PageConfig } from "@/lib/pages/types";

const PAGE_SIZE = 8;

export function ModulePage({ config }: { config: PageConfig }) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    return config.rows.filter((row) =>
      config.filters.every((filter) => {
        const value = filterValues[filter.key];
        if (!value || value === "Todos") return true;
        const cell = String(row[filter.key] ?? "").toLowerCase();
        if (filter.type === "select") return cell === value.toLowerCase();
        return cell.includes(value.toLowerCase());
      })
    );
  }, [config.rows, config.filters, filterValues]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function handleFilterChange(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleReset() {
    setFilterValues({});
    setPage(1);
  }

  function handlePrimaryAction() {
    setToast(`"${config.primaryActionLabel}" estará disponível em uma próxima fase do projeto.`);
    setTimeout(() => setToast(null), 3200);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: config.moduleLabel, href: config.moduleHref },
          { label: config.pageLabel },
        ]}
        title={config.title}
        description={config.description}
        primaryActionLabel={config.primaryActionLabel}
        onPrimaryAction={handlePrimaryAction}
      />

      {config.filters.length > 0 && (
        <FilterBar
          filters={config.filters}
          values={filterValues}
          onChange={handleFilterChange}
          onReset={handleReset}
          resultCount={filteredRows.length}
        />
      )}

      <DataTable columns={config.columns} rows={pagedRows} emptyHint={config.emptyHint} />

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        totalItems={filteredRows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          <CheckCircle2 size={16} className="text-success" />
          {toast}
        </div>
      )}
    </div>
  );
}
