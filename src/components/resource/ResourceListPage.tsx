"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, RefreshCcw, Search, XCircle } from "lucide-react";
import { Breadcrumb, type Crumb } from "@/components/ui/Breadcrumb";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import type { ColumnConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import { apiGet } from "@/lib/api-client";

// Fase 19 — Conclusão da UI: substitui o par ModulePage+mock (Row
// fabricado em src/lib/mock/generators.ts) por uma tela real que busca
// dados de uma rota /api/* já existente, reaproveitando DataTable/
// TableSkeleton/Pagination/Drawer (nenhum componente novo e paralelo).
// Escopo desta tela: LISTAGEM + VISUALIZAÇÃO reais. Criar/editar/excluir
// por aqui não está incluído nesta rodada (ver docs/UI.md) — os únicos
// cadastros com CRUD completo continuam sendo os 8 já convertidos nas
// fases anteriores (src/components/cadastro/CadastroPage.tsx).

const PAGE_SIZE = 10;

export type ResourceColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  status?: boolean;
  format?: (row: T) => string;
};

export type DetailField<T> = {
  label: string;
  format: (row: T) => string;
};

type ResourceListPageProps<T extends Record<string, unknown>> = {
  breadcrumbParent: Crumb;
  pageLabel: string;
  title: string;
  description: string;
  apiPath: string;
  columns: ResourceColumn<T>[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  emptyHint?: string;
  detailTitle?: (row: T) => string;
  detailFields?: DetailField<T>[];
  rowIdKey?: string;
  // Quando informado, a ação "visualizar" navega para uma rota de
  // detalhe dedicada (workspace rico) em vez de abrir o Drawer genérico
  // — usado por entidades com histórico/abas próprias (ex.: Ativos).
  detailHref?: (row: T) => string;
};

function defaultFormat(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

export function ResourceListPage<T extends Record<string, unknown>>({
  breadcrumbParent,
  pageLabel,
  title,
  description,
  apiPath,
  columns,
  searchKeys,
  searchPlaceholder = "Buscar...",
  emptyHint,
  detailTitle,
  detailFields,
  rowIdKey = "id",
  detailHref,
}: ResourceListPageProps<T>) {
  const [items, setItems] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<T | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<T[]>(apiPath);
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar os dados.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [apiPath, reloadToken]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (!search.trim() || !searchKeys || searchKeys.length === 0) return items;
    const term = search.trim().toLowerCase();
    return items.filter((item) => searchKeys.some((key) => String(item[key] ?? "").toLowerCase().includes(term)));
  }, [items, search, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const tableColumns: ColumnConfig[] = columns.map((col) => ({
    key: col.key,
    label: col.label,
    align: col.align,
    render: col.status ? "status" : "text",
  }));

  const tableRows: Row[] = paged.map((item, i) => {
    const row: Row = { id: String(item[rowIdKey] ?? i) };
    for (const col of columns) {
      row[col.key] = col.format ? col.format(item) : defaultFormat(item[col.key]);
    }
    return row;
  });

  function findItem(rowId: string): T | undefined {
    return paged.find((item) => String(item[rowIdKey] ?? "") === rowId);
  }

  function retry() {
    setReloadToken((n) => n + 1);
  }

  const fields: DetailField<T>[] =
    detailFields ?? columns.map((col) => ({ label: col.label, format: col.format ?? ((row: T) => defaultFormat(row[col.key])) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[breadcrumbParent, { label: pageLabel }]} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">{title}</h1>
            <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">{description}</p>
          </div>
          {searchKeys && searchKeys.length > 0 && (
            <div className="relative w-full max-w-xs shrink-0">
              <Search size={15} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-border bg-surface py-2 pr-3 pl-9 text-[13px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand/40 focus:outline-none focus:ring-[3px] focus:ring-brand/12"
              />
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-danger/40 bg-danger-soft/40 py-16 text-center">
          <XCircle size={28} className="text-danger" />
          <div>
            <p className="text-sm font-medium text-ink">Não foi possível carregar os dados</p>
            <p className="mt-1 text-sm text-ink-subtle">{error}</p>
          </div>
          <Button variant="secondary" onClick={retry}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <TableSkeleton columns={columns.length} />
      ) : (
        <>
          <DataTable
            columns={tableColumns}
            rows={tableRows}
            emptyHint={emptyHint}
            renderActions={(row) => {
              const item = findItem(String(row.id));
              if (!item) return null;
              if (detailHref) {
                return (
                  <Link
                    href={detailHref(item)}
                    aria-label="Abrir"
                    title="Abrir"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
                  >
                    <Eye size={16} strokeWidth={1.75} />
                  </Link>
                );
              }
              return (
                <button
                  onClick={() => setViewing(item)}
                  aria-label="Visualizar"
                  title="Visualizar"
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle transition-colors duration-100 hover:bg-surface-hover hover:text-ink"
                >
                  <Eye size={16} strokeWidth={1.75} />
                </button>
              );
            }}
          />
          <Pagination page={currentPage} pageCount={pageCount} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      <Drawer
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing && detailTitle ? detailTitle(viewing) : "Detalhes"}
        subtitle="Visualização de detalhes"
      >
        {viewing && (
          <dl className="flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field.label}>
                <dt className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">{field.label}</dt>
                <dd className="mt-1 text-[13.5px] text-ink">{field.format(viewing)}</dd>
              </div>
            ))}
          </dl>
        )}
      </Drawer>
    </div>
  );
}
