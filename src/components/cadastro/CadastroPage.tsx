"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Eye, Pencil, Power, Trash2, CheckCircle2, XCircle, Loader2, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DataTable } from "@/components/ui/DataTable";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { EntityDrawer } from "@/components/cadastro/EntityDrawer";
import { RelatedList } from "@/components/cadastro/RelatedList";
import { AuditTrail } from "@/components/cadastro/AuditTrail";
import type { AuditEntry, BaseEntity } from "@/lib/cadastros/types";
import type { CadastroConfig } from "@/lib/cadastros/config-types";
import type { EntityFormMode } from "@/components/cadastro/EntityForm";

const PAGE_SIZE = 8;

type DrawerState = {
  mode: EntityFormMode;
  editingId?: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function CadastroPage<T extends BaseEntity>({ config }: { config: CadastroConfig<T> }) {
  const items = useSyncExternalStore(
    config.repository.subscribe,
    config.repository.getSnapshot,
    config.repository.getSnapshot
  );
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Carregando: busca os dados desta entidade e de qualquer cadastro do
  // qual ela dependa (ex.: nome da transportadora na lista de motoristas)
  // antes de considerar a tela pronta. O estado "carregando" é ligado por
  // quem dispara o efeito (montagem inicial já começa com loading=true;
  // o botão "Tentar novamente" liga antes de incrementar reloadToken) —
  // o efeito em si só reage ao resultado, sem setState síncrono no topo.
  useEffect(() => {
    let cancelled = false;
    Promise.all([config.repository.hydrate(), ...(config.dependsOn ?? []).map((repo) => repo.hydrate())])
      .then(() => {
        if (!cancelled) setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error, "Não foi possível carregar os dados."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config, reloadToken]);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setReloadToken((n) => n + 1);
  }

  // Histórico de auditoria — buscado sob demanda quando o painel de
  // visualização é aberto (openView liga auditLoading antes de montar o
  // drawer; este efeito só reage à conclusão da busca).
  useEffect(() => {
    if (drawer?.mode !== "view" || !drawer.editingId) return;
    let cancelled = false;
    fetch(`/api/audit-logs?entity=${encodeURIComponent(config.entityLabel)}&entityId=${drawer.editingId}`)
      .then((res) => res.json())
      .then((body: { success: boolean; data?: AuditEntry[] }) => {
        if (!cancelled && body.success && body.data) setAuditEntries(body.data);
      })
      .catch(() => {
        // histórico é informativo — uma falha aqui não deve travar a tela
      })
      .finally(() => {
        if (!cancelled) setAuditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawer?.mode, drawer?.editingId, config.entityLabel]);

  function showToast(text: string, tone: "success" | "danger" = "success") {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 3200);
  }

  const rows = useMemo(() => items.map(config.toRow), [items, config]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      config.filters.every((filter) => {
        const value = filterValues[filter.key];
        if (!value || value === "Todos") return true;
        const cell = String(row[filter.key] ?? "").toLowerCase();
        if (filter.type === "select") return cell === value.toLowerCase();
        return cell.includes(value.toLowerCase());
      })
    );
  }, [rows, config.filters, filterValues]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleFilterChange(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function handleReset() {
    setFilterValues({});
    setPage(1);
  }

  function openCreate() {
    setDrawer({ mode: "create", values: config.defaultValues(items), errors: {} });
  }

  function openView(id: string) {
    const item = config.repository.get(id);
    if (!item) return;
    setDrawer({ mode: "view", editingId: id, values: { ...item }, errors: {} });
    setAuditEntries([]);
    setAuditLoading(true);
  }

  function openEdit(id: string) {
    const item = config.repository.get(id);
    if (!item) return;
    setDrawer({ mode: "edit", editingId: id, values: { ...item }, errors: {} });
  }

  function switchToEdit() {
    setDrawer((prev) => (prev ? { ...prev, mode: "edit" } : prev));
  }

  function closeDrawer() {
    if (saving) return;
    setDrawer(null);
  }

  function handleFieldChange(key: string, value: string | number | boolean) {
    setDrawer((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));
  }

  async function handleSave() {
    if (!drawer) return;
    const errors = config.validate(drawer.values as Partial<T>, items, drawer.editingId);
    if (Object.keys(errors).length > 0) {
      setDrawer({ ...drawer, errors });
      return;
    }
    setSaving(true);
    try {
      if (drawer.mode === "create") {
        await config.repository.create(drawer.values as Partial<T>);
        showToast(`${config.entityLabel} criado com sucesso.`);
      } else if (drawer.mode === "edit" && drawer.editingId) {
        await config.repository.update(drawer.editingId, drawer.values as Partial<T>);
        showToast(`${config.entityLabel} atualizado com sucesso.`);
      }
      setDrawer(null);
    } catch (error) {
      // Mantém o drawer aberto com os dados preenchidos para nova tentativa.
      showToast(errorMessage(error, `Não foi possível salvar o ${config.entityNounLower}.`), "danger");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus(id: string) {
    setPendingActionId(id);
    try {
      const updated = await config.repository.toggleStatus(id);
      showToast(`${config.entityLabel} ${updated.status === "Ativo" ? "ativado" : "inativado"} com sucesso.`);
    } catch (error) {
      showToast(errorMessage(error, "Não foi possível atualizar o status."), "danger");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      const result = await config.repository.remove(confirmDeleteId);
      if (result.ok) {
        showToast(`${config.entityLabel} excluído com sucesso.`);
        setConfirmDeleteId(null);
      } else {
        showToast(result.reason, "danger");
        setConfirmDeleteId(null);
      }
    } catch (error) {
      showToast(errorMessage(error, "Não foi possível excluir o registro."), "danger");
      setConfirmDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  const drawerItem = drawer?.editingId ? config.repository.get(drawer.editingId) : undefined;
  const relatedGroups = drawerItem && config.relatedLists ? config.relatedLists(drawerItem) : [];

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
        onPrimaryAction={openCreate}
      />

      {loadError ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-danger/40 bg-danger-soft/40 py-16 text-center">
          <XCircle size={28} className="text-danger" />
          <div>
            <p className="text-sm font-medium text-ink">Não foi possível carregar os dados</p>
            <p className="mt-1 text-sm text-ink-subtle">{loadError}</p>
          </div>
          <Button variant="secondary" onClick={retryLoad}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </div>
      ) : loading ? (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="h-[86px] animate-skeleton rounded-xl border border-border bg-surface-sunken/40" />
          <TableSkeleton columns={config.columns.length} />
        </div>
      ) : (
        <>
          <FilterBar
            filters={config.filters}
            values={filterValues}
            onChange={handleFilterChange}
            onReset={handleReset}
            resultCount={filteredRows.length}
          />

          <DataTable
            columns={config.columns}
            rows={pagedRows}
            renderActions={(row) => {
              const id = String(row.id);
              const status = String(row.status);
              const isPending = pendingActionId === id;
              return (
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => openView(id)}
                    aria-label="Visualizar"
                    title="Visualizar"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => openEdit(id)}
                    aria-label="Editar"
                    title="Editar"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(id)}
                    disabled={isPending}
                    aria-label={status === "Ativo" ? "Inativar" : "Ativar"}
                    title={status === "Ativo" ? "Inativar" : "Ativar"}
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors disabled:opacity-40"
                  >
                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(id)}
                    aria-label="Excluir"
                    title="Excluir"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            }}
          />

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            totalItems={filteredRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}

      {drawer && (
        <EntityDrawer
          open
          mode={drawer.mode}
          saving={saving}
          title={
            drawer.mode === "create"
              ? `Novo ${config.entityNounLower}`
              : drawerItem
                ? config.labelOf(drawerItem)
                : config.entityLabel
          }
          subtitle={
            drawer.mode === "view"
              ? "Visualização de detalhes"
              : drawer.mode === "edit"
                ? `Editando ${config.entityNounLower}`
                : `Preencha os dados do novo ${config.entityNounLower}`
          }
          sections={config.formSections}
          values={drawer.values}
          errors={drawer.errors}
          onChange={handleFieldChange}
          onClose={closeDrawer}
          onSave={handleSave}
          onEdit={switchToEdit}
          extras={
            <>
              {relatedGroups.map((group) => (
                <RelatedList key={group.title} title={group.title} items={group.items} />
              ))}
              <AuditTrail entries={auditEntries} loading={auditLoading} />
            </>
          }
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={`Excluir ${config.entityNounLower}?`}
        description="Tem certeza que deseja excluir este registro? Essa ação não pode ser desfeita. Registros já vinculados a outros cadastros não podem ser excluídos — utilize a inativação nesses casos."
        confirmLabel="Excluir"
        loadingLabel="Excluindo..."
        loading={deleting}
        tone="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* z-[80]: acima do Drawer (z-[60]) e do ConfirmDialog (z-[70]) — o
          toast precisa ficar visível mesmo quando reporta erro de uma ação
          disparada com um desses dois abertos por cima do conteúdo da página. */}
      {toast && (
        <div
          className={
            toast.tone === "success"
              ? "fixed right-6 bottom-6 z-[80] flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
              : "fixed right-6 bottom-6 z-[80] flex items-center gap-2 rounded-lg bg-danger px-4 py-3 text-sm font-medium text-white shadow-lg"
          }
        >
          {toast.tone === "success" ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <XCircle size={16} className="text-white" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}
