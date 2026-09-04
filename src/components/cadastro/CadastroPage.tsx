"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Eye, Pencil, Power, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterBar } from "@/components/ui/FilterBar";
import { DataTable } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EntityDrawer } from "@/components/cadastro/EntityDrawer";
import { RelatedList } from "@/components/cadastro/RelatedList";
import { AuditTrail } from "@/components/cadastro/AuditTrail";
import { listAudit } from "@/lib/cadastros/audit";
import type { BaseEntity } from "@/lib/cadastros/types";
import type { CadastroConfig } from "@/lib/cadastros/config-types";
import type { EntityFormMode } from "@/components/cadastro/EntityForm";

const PAGE_SIZE = 8;

type DrawerState = {
  mode: EntityFormMode;
  editingId?: string;
  values: Record<string, unknown>;
  errors: Record<string, string>;
};

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

  useEffect(() => {
    config.repository.hydrate();
  }, [config.repository]);

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
    setDrawer(null);
  }

  function handleFieldChange(key: string, value: string | number | boolean) {
    setDrawer((prev) => (prev ? { ...prev, values: { ...prev.values, [key]: value } } : prev));
  }

  function handleSave() {
    if (!drawer) return;
    const errors = config.validate(drawer.values as Partial<T>, items, drawer.editingId);
    if (Object.keys(errors).length > 0) {
      setDrawer({ ...drawer, errors });
      return;
    }
    if (drawer.mode === "create") {
      config.repository.create(drawer.values as never);
      showToast(`${config.entityLabel} criado com sucesso.`);
    } else if (drawer.mode === "edit" && drawer.editingId) {
      config.repository.update(drawer.editingId, drawer.values as Partial<T>);
      showToast(`${config.entityLabel} atualizado com sucesso.`);
    }
    closeDrawer();
  }

  function handleToggleStatus(id: string) {
    const updated = config.repository.toggleStatus(id);
    if (updated) {
      showToast(
        `${config.entityLabel} ${updated.status === "Ativo" ? "ativado" : "inativado"} com sucesso.`
      );
    }
  }

  function handleDeleteConfirm() {
    if (!confirmDeleteId) return;
    const result = config.repository.remove(confirmDeleteId);
    setConfirmDeleteId(null);
    if (result.ok) {
      showToast(`${config.entityLabel} excluído com sucesso.`);
    } else {
      showToast(result.reason, "danger");
    }
  }

  const drawerItem = drawer?.editingId ? config.repository.get(drawer.editingId) : undefined;
  const auditEntries = drawerItem
    ? listAudit({ entidade: config.entityLabel, registro: config.labelOf(drawerItem) })
    : [];
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
                aria-label={status === "Ativo" ? "Inativar" : "Ativar"}
                title={status === "Ativo" ? "Inativar" : "Ativar"}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink transition-colors"
              >
                <Power size={16} />
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

      {drawer && (
        <EntityDrawer
          open
          mode={drawer.mode}
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
              <AuditTrail entries={auditEntries} />
            </>
          }
        />
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={`Excluir ${config.entityNounLower}?`}
        description="Tem certeza que deseja excluir este registro? Essa ação não pode ser desfeita. Registros já vinculados a outros cadastros não podem ser excluídos — utilize a inativação nesses casos."
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {toast && (
        <div
          className={
            toast.tone === "success"
              ? "fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg"
              : "fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg bg-danger px-4 py-3 text-sm font-medium text-white shadow-lg"
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
