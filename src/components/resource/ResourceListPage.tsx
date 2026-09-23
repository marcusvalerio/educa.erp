"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3, Download, ExternalLink, Eye, Filter, MoreHorizontal, Rows3, Rows4, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { Drawer } from "@/components/ui/Drawer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Tooltip } from "@/components/ui/Tooltip";
import { SkeletonRows } from "@/components/ui/Feedback";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/Menu";
import { DataTable, defaultCellText } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { useListState, useTablePrefs } from "@/components/data-table/useListState";
import { useResource } from "@/components/data-table/useResource";
import type { ColumnDef, FilterDef } from "@/components/data-table/types";
import { applyClientQuery, toCsv } from "@/lib/list/query";
import { RecordHistory } from "./RecordHistory";

// Padrão de LISTA do EDUCA (List Report): cabeçalho, visões de trabalho,
// busca, filtros, tabela densa, seleção + ações em lote, colunas
// configuráveis, densidade, exportação e detalhe — com estado na URL
// (o drill-down do dashboard chega aqui já filtrado).

export type DetailField<T> = { label: string; value: (row: T) => ReactNode; span?: 1 | 2 };
export type DetailSection<T> = { title: string; fields: DetailField<T>[] };

export type DetailConfig<T> = {
  title: (row: T) => ReactNode;
  subtitle?: (row: T) => ReactNode;
  badges?: (row: T) => ReactNode;
  sections?: DetailSection<T>[];
  /** Conteúdo extra (itens, relacionamentos...) carregado pela própria tela. */
  render?: (row: T) => ReactNode;
  actions?: (row: T) => ReactNode;
  /** Rota dedicada do registro (quando existir). */
  href?: (row: T) => string;
  history?: boolean;
};

export type ResourceListPageProps<T> = {
  title: string;
  description?: string;
  apiPath: string;
  columns: ColumnDef<T>[];
  filters?: FilterDef<T>[];
  searchPlaceholder?: string;
  rowId?: (row: T) => string;
  detail?: DetailConfig<T>;
  /** Linha abre uma rota dedicada em vez do painel de detalhe. */
  rowHref?: (row: T) => string;
  /** Recorte fixo da tela sobre a coleção da API (ex.: só devoluções). */
  baseFilter?: (row: T) => boolean;
  actions?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  tableId?: string;
  bulkActions?: (rows: T[], clear: () => void) => ReactNode;
  rowActions?: (row: T) => ReactNode;
  /** Conteúdo acima da tabela (resumo da lista, alertas). */
  summary?: ReactNode;
  exportName?: string;
};

const defaultRowId = (row: unknown) => String((row as { id?: unknown }).id ?? "");

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ResourceListInner<T>({
  title,
  description,
  apiPath,
  columns,
  filters = [],
  searchPlaceholder = "Buscar...",
  rowId = defaultRowId,
  detail,
  rowHref,
  baseFilter,
  actions,
  emptyTitle,
  emptyDescription,
  emptyAction,
  tableId,
  bulkActions,
  rowActions,
  summary,
  exportName,
}: ResourceListPageProps<T>) {
  const router = useRouter();
  const filterIds = useMemo(() => filters.map((f) => f.id), [filters]);
  const { state, update, clear } = useListState(filterIds);
  const prefs = useTablePrefs(tableId ?? apiPath, columns.filter((c) => c.defaultHidden).map((c) => c.id));
  const resource = useResource<T>(apiPath, state, filters, columns);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<T | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState<string | null>(null);

  const visibleColumns = columns.filter((c) => !prefs.hidden.has(c.id));
  const views = filters.filter((f) => f.kind === "view");
  const selectFilters = filters.filter((f) => f.kind !== "view");

  // Modo cliente: a API devolveu tudo — busca/filtro/ordenação/página locais.
  const view = useMemo(() => {
    const base = baseFilter ? resource.rows.filter(baseFilter) : resource.rows;
    if (resource.mode !== "client") return { rows: base, total: resource.total, filtered: base };
    const byId = new Map(columns.map((c) => [c.id, c]));
    const predicates: Record<string, (row: T, value: string) => boolean> = {};
    for (const f of filters) if (f.predicate && !f.serverParam) predicates[f.id] = f.predicate;
    return applyClientQuery(base, state, {
      searchText: (row) => columns.map((c) => defaultCellText(c.exportValue?.(row) ?? c.value?.(row))).join(" "),
      sortValue: (row, id) => byId.get(id)?.value?.(row),
      predicates,
    });
  }, [resource.mode, resource.rows, resource.total, state, columns, filters, baseFilter]);

  const hasFilters = !!state.q || Object.keys(state.filters).length > 0;
  const selectedRows = view.filtered.filter((row) => selected.has(rowId(row)));

  function onSort(id: string) {
    if (state.sort !== id) update({ sort: id, dir: "asc" });
    else if (state.dir === "asc") update({ sort: id, dir: "desc" });
    else update({ sort: null, dir: "asc" });
  }

  function exportCsv(rows: T[], suffix: string) {
    const cols = visibleColumns;
    const csv = toCsv(
      cols.map((c) => c.header),
      rows.map((row) =>
        cols.map((c) => {
          const v = c.exportValue ? c.exportValue(row) : c.value?.(row);
          return v === null || v === undefined ? "" : typeof v === "number" ? v : String(v);
        })
      )
    );
    const date = new Date().toISOString().slice(0, 10);
    download(`${exportName ?? title.toLowerCase().replace(/\s+/g, "-")}-${suffix}-${date}.csv`, csv);
  }

  function openRow(row: T) {
    if (rowHref) router.push(rowHref(row));
    else if (detail) setViewing(row);
  }

  const searchValue = searchDraft ?? state.q;

  const filterControls = (layout: "inline" | "stacked") =>
    selectFilters.map((filter) => (
      <label key={filter.id} className={cn(layout === "stacked" ? "flex flex-col gap-1.5" : "flex items-center")}>
        <span className={cn("text-xs font-medium text-muted-foreground", layout === "inline" && "sr-only")}>{filter.label}</span>
        <Select
          size={layout === "inline" ? "sm" : "md"}
          aria-label={filter.label}
          value={state.filters[filter.id] ?? ""}
          onValueChange={(value) => update({ filters: { [filter.id]: value } })}
          placeholder={filter.label}
          options={[{ value: "", label: `${filter.label}: todos` }, ...filter.options]}
          className={layout === "inline" ? "w-44" : undefined}
        />
      </label>
    ));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} description={description} actions={actions} />

      {summary}

      <Panel className="overflow-hidden">
        {views.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 pt-1" role="toolbar" aria-label="Visões">
            <ViewTab active={!views.some((v) => state.filters[v.id])} onClick={() => update({ filters: Object.fromEntries(views.map((v) => [v.id, ""])) })}>
              Todos
            </ViewTab>
            {views.flatMap((v) =>
              v.options.map((option) => (
                <ViewTab key={`${v.id}-${option.value}`} active={state.filters[v.id] === option.value} onClick={() => update({ filters: { [v.id]: option.value } })}>
                  {option.label}
                </ViewTab>
              ))
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          <form
            role="search"
            className="relative min-w-0 flex-1 sm:max-w-xs"
            onSubmit={(event) => {
              event.preventDefault();
              update({ q: searchValue });
              setSearchDraft(null);
            }}
          >
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
            <Input
              type="search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(event) => setSearchDraft(event.target.value)}
              onBlur={() => {
                if (searchDraft !== null && searchDraft !== state.q) update({ q: searchDraft });
                setSearchDraft(null);
              }}
              className="pl-8"
            />
          </form>
          <div className="hidden items-center gap-2 lg:flex">{filterControls("inline")}</div>
          {selectFilters.length > 0 && (
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <Filter size={14} /> Filtros
              {selectFilters.some((f) => state.filters[f.id]) && (
                <span className="rounded-xs bg-foreground px-1 text-2xs text-background tabular-nums">
                  {selectFilters.filter((f) => state.filters[f.id]).length}
                </span>
              )}
            </Button>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X size={14} /> Limpar
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Tooltip content={prefs.density === "compact" ? "Linhas confortáveis" : "Linhas compactas"}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Alternar densidade"
                onClick={() => prefs.setDensity(prefs.density === "compact" ? "comfortable" : "compact")}
                className="hidden md:inline-flex"
              >
                {prefs.density === "compact" ? <Rows4 size={15} /> : <Rows3 size={15} />}
              </Button>
            </Tooltip>
            <DropdownMenu>
              <Tooltip content="Colunas">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Configurar colunas" className="hidden md:inline-flex">
                    <Columns3 size={15} />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
                {columns.map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={!prefs.hidden.has(col.id)}
                    disabled={col.hideable === false || (visibleColumns.length === 1 && !prefs.hidden.has(col.id))}
                    onCheckedChange={() => prefs.toggleColumn(col.id)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip content={resource.mode === "server" ? "Exportar página atual (CSV)" : "Exportar resultado filtrado (CSV)"}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Exportar CSV"
                disabled={view.filtered.length === 0}
                onClick={() => exportCsv(view.filtered, resource.mode === "server" ? "pagina" : "lista")}
              >
                <Download size={15} />
              </Button>
            </Tooltip>
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/60 px-3 py-1.5 text-sm" role="region" aria-label="Ações em lote">
            <span className="font-medium tabular-nums">
              {selectedRows.length} {selectedRows.length === 1 ? "selecionado" : "selecionados"}
            </span>
            <Button variant="secondary" size="xs" onClick={() => exportCsv(selectedRows, "selecao")}>
              <Download size={13} /> Exportar seleção
            </Button>
            {bulkActions?.(selectedRows, () => setSelected(new Set()))}
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        )}

        <DataTable
          columns={visibleColumns}
          rows={view.rows}
          rowId={rowId}
          loading={resource.loading}
          error={resource.error}
          onRetry={resource.reload}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyAction={emptyAction}
          filtered={hasFilters}
          onClearFilters={clear}
          sort={{ id: state.sort, dir: state.dir }}
          onSortChange={(id) => {
            const col = columns.find((c) => c.id === id);
            // Em modo servidor só ordena pelo que a API sabe ordenar.
            if (resource.mode === "server" && !col?.serverSortKey) return;
            onSort(id);
          }}
          selectable
          selected={selected}
          onSelectedChange={setSelected}
          onRowOpen={detail || rowHref ? openRow : undefined}
          density={prefs.density}
          caption={title}
          rowActions={
            detail || rowHref || rowActions
              ? (row) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Ações da linha">
                        <MoreHorizontal size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-52">
                      {(detail || rowHref) && (
                        <DropdownMenuItem onSelect={() => openRow(row)}>
                          <Eye size={14} /> Abrir
                        </DropdownMenuItem>
                      )}
                      {detail?.href && (
                        <DropdownMenuItem asChild>
                          <Link href={detail.href(row)}>
                            <ExternalLink size={14} /> Abrir página do registro
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {rowActions?.(row)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              : undefined
          }
        />

        {!resource.error && view.total > 0 && (
          <Pagination
            page={state.page}
            pageSize={state.pageSize}
            total={view.total}
            onPageChange={(page) => update({ page })}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        )}
      </Panel>

      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtros"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                clear();
                setFiltersOpen(false);
              }}
            >
              Limpar
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Ver resultados</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">{filterControls("stacked")}</div>
      </Drawer>

      {detail && (
        <Drawer
          open={viewing !== null}
          onClose={() => setViewing(null)}
          size="lg"
          title={viewing ? detail.title(viewing) : ""}
          subtitle={viewing && detail.subtitle ? detail.subtitle(viewing) : undefined}
          meta={viewing && detail.badges ? detail.badges(viewing) : undefined}
          footer={
            viewing && (detail.actions || detail.href) ? (
              <>
                {detail.actions?.(viewing)}
                {detail.href && (
                  <Button asChild variant="secondary">
                    <Link href={detail.href(viewing)}>
                      <ExternalLink size={14} /> Abrir página
                    </Link>
                  </Button>
                )}
              </>
            ) : undefined
          }
        >
          {viewing && <RecordDetail row={viewing} detail={detail} columns={columns} rowId={rowId} />}
        </Drawer>
      )}
    </div>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "-mb-px h-9 shrink-0 border-b-2 px-2 text-sm whitespace-nowrap transition-colors",
        active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export function RecordDetail<T>({ row, detail, columns, rowId }: { row: T; detail: DetailConfig<T>; columns: ColumnDef<T>[]; rowId: (row: T) => string }) {
  const sections: DetailSection<T>[] = detail.sections ?? [
    {
      title: "Informações principais",
      fields: columns.map((col) => ({ label: col.header, value: (r: T) => (col.cell ? col.cell(r) : defaultCellText(col.value?.(r))) })),
    },
  ];
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="mb-2 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">{section.title}</h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-md border border-border p-3 sm:grid-cols-2">
            {section.fields.map((field) => (
              <div key={field.label} className={cn("min-w-0", field.span === 2 && "sm:col-span-2")}>
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="mt-0.5 text-sm break-words text-foreground">{field.value(row) ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {detail.render?.(row)}
      {detail.history !== false && (
        <section>
          <h3 className="mb-2 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">Histórico</h3>
          <RecordHistory entityId={rowId(row)} />
        </section>
      )}
    </div>
  );
}

export function ResourceListPage<T>(props: ResourceListPageProps<T>) {
  return (
    <Suspense
      fallback={
        <div className="rounded-md border border-border bg-surface">
          <SkeletonRows />
        </div>
      }
    >
      <ResourceListInner {...props} />
    </Suspense>
  );
}
