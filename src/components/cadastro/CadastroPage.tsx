"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Download, Eye, MoreHorizontal, Pencil, Plus, Power, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Alert, SkeletonRows } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/Menu";
import { DataTable } from "@/components/data-table/DataTable";
import { Pagination } from "@/components/data-table/Pagination";
import { useListState, useTablePrefs } from "@/components/data-table/useListState";
import type { ColumnDef } from "@/components/data-table/types";
import { useSession } from "@/components/shell/SessionProvider";
import { RecordHistory } from "@/components/resource/RecordHistory";
import { applyClientQuery, toCsv } from "@/lib/list/query";
import type { BaseEntity } from "@/lib/cadastros/types";
import type { CadastroConfig, Row } from "@/lib/cadastros/config-types";
import { EntityDrawer } from "./EntityDrawer";
import { RelatedList } from "./RelatedList";
import type { EntityFormMode } from "./EntityForm";
import { lookupCep, maskCep, maskCpfCnpj } from "@/lib/cadastros/masks";

// Cadastros com CRUD completo (produtos, clientes, fornecedores, frota,
// locais). Mesmo padrão visual das listas (DataTable + estado na URL),
// com ações habilitadas conforme as permissões reais do usuário.

type DrawerState = {
  mode: EntityFormMode;
  editingId?: string;
  values: Record<string, unknown>;
  initial: string;
  errors: Record<string, string>;
};

type Item = { item: BaseEntity; row: Row };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CadastroInner<T extends BaseEntity>({ config }: { config: CadastroConfig<T> }) {
  const { can } = useSession();
  const pm = config.permissionModule;
  const canCreate = can(`${pm}.create`);
  const canUpdate = can(`${pm}.update`);
  const canDelete = can(`${pm}.delete`);

  const items = useSyncExternalStore(config.repository.subscribe, config.repository.getSnapshot, config.repository.getSnapshot);
  const filterIds = useMemo(() => config.filters.map((f) => f.key), [config.filters]);
  const { state, update, clear } = useListState(filterIds);
  const prefs = useTablePrefs(`cadastro:${pm}`, []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dependencyWarning, setDependencyWarning] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchDraft, setSearchDraft] = useState<string | null>(null);

  // Carrega a entidade e os cadastros dos quais ela depende (ex.: nome da
  // transportadora na lista de motoristas) antes de mostrar a tela. Só a
  // falha da própria entidade bloqueia a lista; a de um cadastro auxiliar
  // (ex.: unidades na tela de produtos) vira aviso e a lista aparece mesmo
  // assim — antes, uma permissão faltando num auxiliar escondia tudo.
  useEffect(() => {
    let cancelled = false;
    Promise.all([config.repository.hydrate(), Promise.allSettled((config.dependsOn ?? []).map((repo) => repo.hydrate()))])
      .then(([, deps]) => {
        if (cancelled) return;
        setLoadError(null);
        setDependencyWarning(deps.some((d) => d.status === "rejected"));
      })
      .catch((error: unknown) => !cancelled && setLoadError(errorMessage(error, "Não foi possível carregar os dados.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [config, reloadToken]);

  const all: Item[] = useMemo(() => items.map((item) => ({ item, row: config.toRow(item) })), [items, config]);

  const columns: ColumnDef<Item>[] = useMemo(
    () =>
      config.columns.map((col, index) => ({
        id: col.key,
        header: col.label,
        align: col.align,
        value: (it: Item) => it.row[col.key],
        cell: col.render === "status" ? (it: Item) => <StatusBadge status={String(it.row[col.key] ?? "")} /> : undefined,
        mobile: index === 0 ? ("title" as const) : col.render === "status" ? ("badge" as const) : index < 4 ? ("meta" as const) : undefined,
        mono: index === 0,
      })),
    [config.columns]
  );

  // Inativos ficam escondidos por padrão (continuam no histórico): o botão
  // "Mostrar inativos" ou um filtro de status os traz de volta.
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = useMemo(() => all.filter((it) => it.item.status !== "Ativo").length, [all]);
  const visible = useMemo(
    () => (showInactive || state.filters.status ? all : all.filter((it) => it.item.status === "Ativo")),
    [all, showInactive, state.filters.status]
  );

  const view = useMemo(
    () =>
      applyClientQuery(visible, state, {
        searchText: (it) => Object.values(it.row).join(" "),
        sortValue: (it, id) => it.row[id],
        predicates: Object.fromEntries(
          config.filters.map((f) => [
            f.key,
            (it: Item, value: string) =>
              f.type === "select"
                ? String(it.row[f.key] ?? "").toLowerCase() === value.toLowerCase()
                : String(it.row[f.key] ?? "").toLowerCase().includes(value.toLowerCase()),
          ])
        ),
      }),
    [visible, state, config.filters]
  );

  const visibleColumns = columns.filter((c) => !prefs.hidden.has(c.id));
  const selectedItems = view.filtered.filter((it) => selected.has(it.item.id));
  const hasFilters = !!state.q || Object.keys(state.filters).length > 0;
  const selectFilters = config.filters.filter((f) => f.type === "select");

  function openCreate() {
    const values = config.defaultValues(items) as Record<string, unknown>;
    setDrawer({ mode: "create", values, initial: JSON.stringify(values), errors: {} });
  }

  // CEP completo: busca na ViaCEP e preenche UF/cidade/logradouro/bairro
  // (só os campos que o formulário tem). Sem resposta, nada muda.
  const formKeys = useMemo(() => new Set(config.formSections.flatMap((sec) => sec.fields.map((f) => f.key))), [config.formSections]);
  function fillFromCep(cep: string) {
    void lookupCep(cep).then((addr) => {
      if (!addr) return;
      setDrawer((prev) => {
        if (!prev || String(prev.values.cep ?? "").replace(/\D/g, "") !== cep.replace(/\D/g, "")) return prev;
        const values: Record<string, unknown> = { ...prev.values };
        const errors = { ...prev.errors };
        for (const [k, v] of Object.entries(addr)) {
          if (v && formKeys.has(k)) {
            values[k] = v;
            errors[k] = "";
          }
        }
        return { ...prev, values: values as typeof prev.values, errors };
      });
    });
  }

  function openItem(id: string, mode: EntityFormMode) {
    const item = config.repository.get(id);
    if (!item) return;
    const values = { ...item } as Record<string, unknown>;
    setDrawer({ mode, editingId: id, values, initial: JSON.stringify(values), errors: {} });
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
        toast.success(`${config.entityLabel} criado.`);
      } else if (drawer.editingId) {
        await config.repository.update(drawer.editingId, drawer.values as Partial<T>);
        toast.success(`${config.entityLabel} atualizado.`);
      }
      setDrawer(null);
    } catch (error) {
      toast.error(`Não foi possível salvar o ${config.entityNounLower}.`, errorMessage(error, "Tente novamente."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(id: string) {
    setBusy(true);
    try {
      const updated = await config.repository.toggleStatus(id);
      toast.success(`${config.entityLabel} ${updated.status === "Ativo" ? "ativado" : "inativado"}.`);
    } catch (error) {
      toast.error("Não foi possível alterar o status.", errorMessage(error, ""));
    } finally {
      setBusy(false);
    }
  }

  async function bulkInactivate() {
    setBusy(true);
    let done = 0;
    let failed = 0;
    for (const it of selectedItems) {
      if (it.item.status !== "Ativo") continue;
      try {
        await config.repository.toggleStatus(it.item.id);
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setConfirmBulk(false);
    setSelected(new Set());
    if (failed > 0) toast.warning(`${done} inativado(s), ${failed} com falha.`);
    else toast.success(`${done} registro(s) inativado(s).`);
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      const result = await config.repository.remove(confirmDelete);
      if (result.ok) toast.success(`${config.entityLabel} excluído.`);
      else toast.error("Exclusão não permitida.", result.reason);
    } catch (error) {
      toast.error("Não foi possível excluir o registro.", errorMessage(error, ""));
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  function exportRows(rows: Item[], suffix: string) {
    const csv = toCsv(
      visibleColumns.map((c) => c.header),
      rows.map((it) => visibleColumns.map((c) => it.row[c.id] ?? ""))
    );
    download(`${pm}-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const drawerItem = drawer?.editingId ? config.repository.get(drawer.editingId) : undefined;
  const related = drawerItem && config.relatedLists ? config.relatedLists(drawerItem) : [];
  const searchValue = searchDraft ?? state.q;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="pb-1"
        title={config.title}
        description={config.description}
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus size={15} /> {config.primaryActionLabel}
            </Button>
          ) : undefined
        }
      />

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
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
              aria-label={`Buscar ${config.entityNounLower}`}
              placeholder={`Buscar ${config.entityNounLower}...`}
              value={searchValue}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() => {
                if (searchDraft !== null && searchDraft !== state.q) update({ q: searchDraft });
                setSearchDraft(null);
              }}
              className="pl-8"
            />
          </form>
          {selectFilters.map((filter) =>
            filter.type === "select" ? (
              <Select
                key={filter.key}
                size="sm"
                aria-label={filter.label}
                value={state.filters[filter.key] ?? ""}
                onValueChange={(value) => update({ filters: { [filter.key]: value } })}
                placeholder={filter.label}
                options={[{ value: "", label: `${filter.label}: todos` }, ...filter.options.map((o) => ({ value: o, label: o }))]}
                className="w-40"
              />
            ) : null
          )}
          {inactiveCount > 0 && !state.filters.status && (
            <Button variant="ghost" size="sm" aria-pressed={showInactive} onClick={() => setShowInactive((v) => !v)}>
              {showInactive ? "Esconder inativos" : `Mostrar inativos (${inactiveCount})`}
            </Button>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clear}>
              <X size={14} /> Limpar
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Exportar CSV" disabled={view.filtered.length === 0} onClick={() => exportRows(view.filtered, "lista")}>
            <Download size={15} />
          </Button>
        </div>

        {selectedItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-accent-soft/60 px-4 py-2 text-sm animate-fade-in" role="region" aria-label="Ações em lote">
            <span className="font-medium tabular-nums">{selectedItems.length} selecionado(s)</span>
            <Button variant="secondary" size="xs" onClick={() => exportRows(selectedItems, "selecao")}>
              <Download size={13} /> Exportar seleção
            </Button>
            {canUpdate && (
              <Button variant="secondary" size="xs" onClick={() => setConfirmBulk(true)}>
                <Power size={13} /> Inativar selecionados
              </Button>
            )}
            <Button variant="ghost" size="xs" className="ml-auto" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        )}

        {dependencyWarning && !loadError && (
          <Alert tone="warning" title="Algumas informações complementares não foram carregadas">
            A lista está completa, mas nomes vinculados (como categoria, marca ou unidade) e as opções desses campos no formulário podem aparecer em branco.
            Se o problema continuar, peça ao administrador da empresa para revisar as permissões do seu papel.
          </Alert>
        )}

        {loading && all.length === 0 ? (
          <SkeletonRows columns={Math.min(columns.length, 6)} />
        ) : (
          <DataTable
            columns={visibleColumns}
            rows={view.rows}
            rowId={(it) => it.item.id}
            error={loadError}
            onRetry={() => {
              setLoading(true);
              setReloadToken((n) => n + 1);
            }}
            emptyTitle={`Nenhum ${config.entityNounLower} cadastrado`}
            emptyDescription={canCreate ? `Cadastre o primeiro ${config.entityNounLower} para começar.` : undefined}
            emptyAction={canCreate ? <Button size="sm" onClick={openCreate}><Plus size={14} /> {config.primaryActionLabel}</Button> : undefined}
            filtered={hasFilters}
            onClearFilters={clear}
            sort={{ id: state.sort, dir: state.dir }}
            onSortChange={(id) =>
              state.sort !== id ? update({ sort: id, dir: "asc" }) : state.dir === "asc" ? update({ sort: id, dir: "desc" }) : update({ sort: null })
            }
            selectable
            selected={selected}
            onSelectedChange={setSelected}
            onRowOpen={(it) => openItem(it.item.id, "view")}
            density={prefs.density}
            caption={config.title}
            rowActions={(it) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Ações do registro">
                    <MoreHorizontal size={15} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  <DropdownMenuItem onSelect={() => openItem(it.item.id, "view")}>
                    <Eye size={14} /> Visualizar
                  </DropdownMenuItem>
                  {canUpdate && (
                    <>
                      <DropdownMenuItem onSelect={() => openItem(it.item.id, "edit")}>
                        <Pencil size={14} /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={busy} onSelect={() => toggleStatus(it.item.id)}>
                        <Power size={14} /> {it.item.status === "Ativo" ? "Inativar" : "Ativar"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem tone="danger" onSelect={() => setConfirmDelete(it.item.id)}>
                        <Trash2 size={14} /> Excluir
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        )}

        {!loadError && view.total > 0 && (
          <Pagination
            page={state.page}
            pageSize={state.pageSize}
            total={view.total}
            onPageChange={(page) => update({ page })}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        )}
      </Panel>

      {drawer && (
        <EntityDrawer
          open
          mode={drawer.mode}
          saving={saving}
          canEdit={canUpdate}
          dirty={JSON.stringify(drawer.values) !== drawer.initial}
          title={drawer.mode === "create" ? `Novo ${config.entityNounLower}` : drawerItem ? config.labelOf(drawerItem) : config.entityLabel}
          subtitle={drawer.mode === "create" ? `Preencha os dados do novo ${config.entityNounLower}.` : drawer.mode === "edit" ? `Editando ${config.entityNounLower}` : config.entityLabel}
          meta={drawerItem ? <StatusBadge status={drawerItem.status} /> : undefined}
          sections={config.formSections}
          values={drawer.values}
          errors={drawer.errors}
          onChange={(key, value) => {
            setDrawer((prev) => {
              if (!prev) return prev;
              const values = { ...prev.values, [key]: value };
              // Estrangeiro não pode ficar com país "BR": obriga escolher o país.
              if (key === "tipo" && value === "Estrangeiro" && "pais" in prev.values && (!prev.values.pais || prev.values.pais === "BR")) values.pais = "";
              // Trocar o tipo de pessoa limpa o documento (CPF ≠ CNPJ ≠ Tax ID).
              if (key === "tipo" && value !== prev.values.tipo && "documento" in prev.values) values.documento = "";
              // Máscara enquanto digita (estrangeiro digita o Tax ID livre).
              if (key === "documento" && typeof value === "string" && prev.values.tipo !== "Estrangeiro") values.documento = maskCpfCnpj(value);
              if (key === "cep" && typeof value === "string" && prev.values.tipo !== "Estrangeiro") values.cep = maskCep(value);
              return { ...prev, values, errors: { ...prev.errors, [key]: "" } };
            });
            if (key === "cep" && typeof value === "string" && value.replace(/\D/g, "").length === 8 && drawer.values.tipo !== "Estrangeiro") fillFromCep(value);
          }}
          onClose={() => setDrawer(null)}
          onSave={handleSave}
          onEdit={() => setDrawer((prev) => (prev ? { ...prev, mode: "edit" } : prev))}
          extras={
            drawer.editingId ? (
              <>
                {related.map((group) => (
                  <RelatedList key={group.title} title={group.title} items={group.items} />
                ))}
                <section>
                  <h3 className="mb-2 text-2xs font-medium tracking-label text-subtle-foreground uppercase">Histórico</h3>
                  <RecordHistory entityId={drawer.editingId} />
                </section>
              </>
            ) : undefined
          }
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Excluir ${config.entityNounLower}?`}
        description="A exclusão não pode ser desfeita. Registros vinculados a outros cadastros não podem ser excluídos — use a inativação nesses casos."
        confirmLabel="Excluir"
        tone="danger"
        loading={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmDialog
        open={confirmBulk}
        title="Inativar registros selecionados?"
        description={`${selectedItems.filter((it) => it.item.status === "Ativo").length} registro(s) ativo(s) serão inativados. Eles continuam disponíveis para consulta.`}
        confirmLabel="Inativar"
        loading={busy}
        onConfirm={bulkInactivate}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}

export function CadastroPage<T extends BaseEntity>({ config }: { config: CadastroConfig<T> }) {
  return (
    <Suspense fallback={<SkeletonRows />}>
      <CadastroInner config={config} />
    </Suspense>
  );
}
