"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DataTable, type SortDir } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PageConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";

const PAGE_SIZE = 8;

export function ModulePage({ config }: { config: PageConfig }) {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [viewingRow, setViewingRow] = useState<Row | null>(null);
  const [unavailableAction, setUnavailableAction] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const filtered = config.rows.filter((row) =>
      config.filters.every((filter) => {
        const value = filterValues[filter.key];
        if (!value || value === "Todos") return true;
        const cell = String(row[filter.key] ?? "").toLowerCase();
        if (filter.type === "select") return cell === value.toLowerCase();
        return cell.includes(value.toLowerCase());
      })
    );
    if (!sort) return filtered;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "pt-BR");
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [config.rows, config.filters, filterValues, sort]);

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

  function handleSortChange(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
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
        onPrimaryAction={() => setUnavailableAction(config.primaryActionLabel)}
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

      <DataTable
        columns={config.columns}
        rows={pagedRows}
        emptyHint={config.emptyHint}
        sort={sort ?? undefined}
        onSortChange={handleSortChange}
        onRowClick={setViewingRow}
        renderActions={(row) => (
          <button
            onClick={() => setViewingRow(row)}
            aria-label="Visualizar"
            title="Visualizar"
            className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
          >
            <Eye size={16} />
          </button>
        )}
      />

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        totalItems={filteredRows.length}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <Drawer
        open={viewingRow !== null}
        onClose={() => setViewingRow(null)}
        title={viewingRow ? String(viewingRow[config.columns[0].key]) : ""}
        subtitle="Visualização de detalhes (dados simulados)"
      >
        {viewingRow && (
          <dl className="flex flex-col gap-4">
            {config.columns.map((col) => (
              <div key={col.key}>
                <dt className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">{col.label}</dt>
                <dd className="mt-1 text-[13.5px] text-ink">
                  {col.render === "status" ? (
                    <StatusBadge status={String(viewingRow[col.key])} />
                  ) : (
                    String(viewingRow[col.key])
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Drawer>

      <ConfirmDialog
        open={unavailableAction !== null}
        tone="info"
        title={unavailableAction ?? ""}
        description="Este módulo ainda não está conectado a um banco de dados real — apenas a visualização e a análise dos dados simulados estão disponíveis nesta etapa do ASTRA.ERP. A criação e edição de registros serão habilitadas quando este módulo receber uma implementação completa, como já existe hoje em Cadastros."
        cancelLabel="Entendi"
        onCancel={() => setUnavailableAction(null)}
      />
    </div>
  );
}
