"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, XCircle, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DataTable, type SortDir } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState } from "@/components/ui/ErrorState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Plus, Eye, Pencil, Power, Trash2, Loader2 } from "lucide-react";
import type { ColumnConfig, FilterConfig } from "@/lib/pages/types";
import type { Row } from "@/lib/mock/generators";
import type { Produto, Categoria, Marca, Fornecedor } from "@/lib/cadastros/types";
import {
  fetchProducts,
  fetchCategories,
  fetchBrands,
  fetchUnits,
  fetchSuppliers,
  updateProduct,
  deleteProduct,
  fetchMe,
  ApiRequestError,
  type ProductListParams,
  type MePermissions,
} from "@/lib/produtos/api";
import { ProdutoDrawer, type ProdutoDrawerMode } from "./ProdutoDrawer";

const PAGE_SIZE = 20;
const DEFAULT_COMPANY_ID = "00000000-0000-0000-0000-000000000001";

// Colunas exibidas -> coluna real do banco usada para ORDER BY. Colunas
// resolvidas via lookup (categoria/marca/fornecedor) não têm uma coluna
// simples em products para ordenar — não são sortable.
const SORT_COLUMN: Record<string, string> = {
  codigo: "code",
  produto: "name",
  unidade: "unit",
  status: "status",
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ProdutosPage() {
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: SortDir }>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [categories, setCategories] = useState<Categoria[]>([]);
  const [brands, setBrands] = useState<Marca[]>([]);
  const [units, setUnits] = useState<{ code: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<Fornecedor[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  const [me, setMe] = useState<MePermissions | null>(null);

  const [drawer, setDrawer] = useState<{ mode: ProdutoDrawerMode; editingId?: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  function showToast(text: string, tone: "success" | "danger" = "success") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3200);
  }

  // Busca com debounce — texto digitado não dispara uma requisição por
  // tecla; espera 350ms de silêncio antes de ir ao servidor. O guard
  // contra "nada mudou de verdade" é necessário: sem ele, este efeito
  // roda no mount (filterValues.search parte undefined -> "", igual ao
  // valor inicial de debouncedSearch) e ainda assim chamaria
  // setLoading(true) 350ms depois — como debouncedSearch não muda de
  // valor, listParams não ganha uma referência nova, loadProducts não é
  // re-executado, e loading fica preso em true para sempre (bug real
  // encontrado via QA visual, não só um artefato do Strict Mode).
  const lastDebouncedSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = filterValues.search ?? "";
      if (next === lastDebouncedSearchRef.current) return;
      lastDebouncedSearchRef.current = next;
      setLoading(true);
      setDebouncedSearch(next);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [filterValues.search]);

  // Lookups (categorias/marcas/unidades/fornecedores) — carregados uma vez;
  // alimentam os filtros e o formulário. RBAC (/api/me) também aqui: sem
  // sessão (ainda não existe UI de login — ver docs/AUTH_ARCHITECTURE.md),
  // fetchMe() resolve para null e a UI libera as ações, igual ao restante
  // do app hoje; quando existir login, os botões passam a respeitar as
  // permissões reais devolvidas por /api/me.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCategories(), fetchBrands(), fetchUnits(), fetchSuppliers(), fetchMe()])
      .then(([cat, brand, unit, sup, meResult]) => {
        if (cancelled) return;
        setCategories(cat.data);
        setBrands(brand.data);
        setUnits(unit.data);
        setSuppliers(sup.data);
        setMe(meResult);
        setLookupsError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLookupsError(errorMessage(error, "Não foi possível carregar categorias/marcas/unidades."));
      })
      .finally(() => {
        if (!cancelled) setLookupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const listParams: ProductListParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: (filterValues.status as "Ativo" | "Inativo") || undefined,
      categoryId: filterValues.categoryId || undefined,
      brandId: filterValues.brandId || undefined,
      unit: filterValues.unit || undefined,
      sort: SORT_COLUMN[sort.key] ?? "created_at",
      order: sort.dir,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, filterValues.status, filterValues.categoryId, filterValues.brandId, filterValues.unit, sort, page]
  );

  const loadProducts = useCallback(() => {
    let cancelled = false;
    fetchProducts(listParams)
      .then(({ data, meta }) => {
        if (cancelled) return;
        setProducts(data);
        setTotal(meta?.total ?? data.length);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error, "Não foi possível carregar os produtos."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listParams, reloadToken]);

  useEffect(() => loadProducts(), [loadProducts]);

  function retryLoad() {
    setLoading(true);
    setReloadToken((n) => n + 1);
  }

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.nome])), [categories]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b.nome])), [brands]);
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s.razaoSocial])), [suppliers]);

  const rows: Row[] = useMemo(
    () =>
      products.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        produto: p.descricao,
        categoria: (p.categoriaId && categoryById.get(p.categoriaId)) || p.categoria || "—",
        marca: (p.marcaId && brandById.get(p.marcaId)) || "—",
        unidade: p.unidade,
        fornecedor: (p.fornecedorId && supplierById.get(p.fornecedorId)) || "—",
        status: p.status,
      })),
    [products, categoryById, brandById, supplierById]
  );

  const columns: ColumnConfig[] = [
    { key: "codigo", label: "Código" },
    { key: "produto", label: "Produto" },
    { key: "categoria", label: "Categoria", sortable: false },
    { key: "marca", label: "Marca", sortable: false },
    { key: "unidade", label: "Unidade", align: "center" },
    { key: "fornecedor", label: "Fornecedor preferencial", sortable: false },
    { key: "status", label: "Status", render: "status" },
  ];

  const filters: FilterConfig[] = [
    { key: "search", label: "Buscar", type: "text", placeholder: "Código, SKU, código de barras ou nome" },
    { key: "categoryId", label: "Categoria", type: "select", options: categories.map((c) => ({ value: c.id, label: c.nome })) },
    { key: "brandId", label: "Marca", type: "select", options: brands.map((b) => ({ value: b.id, label: b.nome })) },
    { key: "unit", label: "Unidade", type: "select", options: units.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` })) },
    { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo"] },
  ];

  function handleFilterChange(key: string, value: string) {
    if (key !== "search") setLoading(true);
    setFilterValues((prev) => ({ ...prev, [key]: value === "Todos" ? "" : value }));
    if (key !== "search") setPage(1);
  }

  function handleReset() {
    setLoading(true);
    setFilterValues({});
    setPage(1);
  }

  function handleSortChange(key: string) {
    if (!SORT_COLUMN[key]) return;
    setLoading(true);
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    setLoading(true);
    setPage(nextPage);
  }

  const hasActiveFilters = Object.values(filterValues).some((v) => v);
  const genuinelyEmpty = !loading && total === 0 && !hasActiveFilters;

  const emptyState = genuinelyEmpty
    ? {
        icon: Package,
        title: "Nenhum produto cadastrado ainda",
        description: "Comece cadastrando o primeiro produto do catálogo.",
        action: (
          <Button onClick={() => setDrawer({ mode: "create" })}>
            <Plus size={15} strokeWidth={2} />
            Cadastrar produto
          </Button>
        ),
      }
    : {
        title: "Nenhum resultado para os filtros aplicados",
        description: "Ajuste ou limpe os filtros para encontrar o que você procura.",
        action: (
          <Button variant="secondary" onClick={handleReset}>
            Limpar filtros
          </Button>
        ),
      };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Sem sessão real (sem UI de login), /api/me não retorna permissões —
  // o app libera as ações, consistente com o restante do ERP hoje. Com
  // sessão, passa a respeitar de verdade o que a empresa autorizou.
  const permissions = me?.companies.find((c) => c.companyId === DEFAULT_COMPANY_ID)?.permissions ?? null;
  const canCreate = permissions ? permissions.includes("products.create") : true;
  const canUpdate = permissions ? permissions.includes("products.update") : true;
  const canDelete = permissions ? permissions.includes("products.delete") : true;

  async function handleToggleStatus(product: Produto) {
    setPendingActionId(product.id);
    try {
      const nextStatus = product.status === "Ativo" ? "Inativo" : "Ativo";
      await updateProduct(product.id, { status: nextStatus });
      showToast(`Produto ${nextStatus === "Ativo" ? "ativado" : "inativado"} com sucesso.`);
      retryLoad();
    } catch (error) {
      showToast(errorMessage(error, "Não foi possível atualizar o status."), "danger");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(confirmDeleteId);
      showToast("Produto excluído com sucesso.");
      setConfirmDeleteId(null);
      retryLoad();
    } catch (error) {
      setDeleteError(errorMessage(error, "Não foi possível excluir o produto."));
    } finally {
      setDeleting(false);
    }
  }

  const isLoadingInitial = loading && products.length === 0 && !loadError;
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Cadastros", href: "/cadastros" }, { label: "Produtos" }]}
        title="Produtos"
        description={`Catálogo de produtos da empresa${!loading ? ` — ${total} ${total === 1 ? "registro" : "registros"}` : ""}.`}
        primaryActionLabel="Novo produto"
        onPrimaryAction={canCreate ? () => setDrawer({ mode: "create" }) : undefined}
      />

      {loadError ? (
        <ErrorState description={loadError} onRetry={retryLoad} />
      ) : lookupsError ? (
        <ErrorState description={lookupsError} onRetry={() => window.location.reload()} />
      ) : isLoadingInitial || lookupsLoading ? (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="h-[86px] animate-skeleton rounded-xl border border-border bg-surface-sunken/40" />
          <TableSkeleton columns={columns.length} />
        </div>
      ) : (
        <>
          <FilterBar filters={filters} values={filterValues} onChange={handleFilterChange} onReset={handleReset} resultCount={total} />

          <DataTable
            columns={columns}
            rows={rows}
            emptyState={emptyState}
            sort={sort}
            onSortChange={handleSortChange}
            onRowClick={(row) => setDrawer({ mode: "view", editingId: String(row.id) })}
            renderActions={(row) => {
              const id = String(row.id);
              const product = productsById.get(id);
              if (!product) return null;
              const isPending = pendingActionId === id;
              return (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => setDrawer({ mode: "view", editingId: id })}
                    aria-label="Visualizar"
                    title="Visualizar"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
                  >
                    <Eye size={16} />
                  </button>
                  {canUpdate && (
                    <button
                      onClick={() => setDrawer({ mode: "edit", editingId: id })}
                      aria-label="Editar"
                      title="Editar"
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                  {canUpdate && (
                    <button
                      onClick={() => handleToggleStatus(product)}
                      disabled={isPending}
                      aria-label={product.status === "Ativo" ? "Inativar" : "Ativar"}
                      title={product.status === "Ativo" ? "Inativar" : "Ativar"}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors disabled:opacity-40"
                    >
                      {isPending ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDeleteId(id);
                      }}
                      aria-label="Excluir"
                      title="Excluir"
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            }}
          />

          <Pagination page={page} pageCount={pageCount} totalItems={total} pageSize={PAGE_SIZE} onPageChange={handlePageChange} />
        </>
      )}

      {drawer && (
        <ProdutoDrawer
          mode={drawer.mode}
          productId={drawer.editingId}
          categories={categories}
          brands={brands}
          units={units}
          suppliers={suppliers}
          canUpdate={canUpdate}
          onClose={() => setDrawer(null)}
          onSaved={(action) => {
            setDrawer(null);
            showToast(action === "create" ? "Produto criado com sucesso." : "Produto atualizado com sucesso.");
            retryLoad();
          }}
          onSwitchToEdit={() => setDrawer((prev) => (prev ? { ...prev, mode: "edit" } : prev))}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir produto?"
        description="Tem certeza que deseja excluir este produto? Essa ação não pode ser desfeita. Vínculos deste produto (fornecedores, preços, embalagens) são removidos junto. Para manter o histórico, prefira inativar."
        confirmLabel="Excluir"
        loadingLabel="Excluindo..."
        loading={deleting}
        error={deleteError}
        tone="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setConfirmDeleteId(null);
          setDeleteError(null);
        }}
      />

      {toast && (
        <div
          className={
            toast.tone === "success"
              ? "fixed right-6 bottom-6 z-[80] flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
              : "fixed right-6 bottom-6 z-[80] flex items-center gap-2 rounded-lg bg-danger px-4 py-3 text-sm font-medium text-white shadow-lg"
          }
        >
          {toast.tone === "success" ? <CheckCircle2 size={16} className="text-success" /> : <XCircle size={16} className="text-white" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
