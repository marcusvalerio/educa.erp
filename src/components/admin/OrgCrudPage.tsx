"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Pencil, Plus, Power, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { Dialog, ConfirmDialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { EmptyState, SkeletonRows } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { NoAccess } from "@/components/shell/ShellFrame";
import { adminSend } from "./data";

// Tela de estrutura organizacional (setores, cargos, unidades): lista,
// formulário em diálogo e ativar/desativar. Escrita pelas rotas
// /api/admin/*, sob RLS — a UI só reflete o que o banco permite.

type Row = { id: string; code: string; name: string; status: string } & Record<string, unknown>;

export type OrgField = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "select" | "number";
  required?: boolean;
  help?: string;
  createOnly?: boolean;
  mono?: boolean;
  options?: (form: Record<string, string>, editing: Row | null) => Array<{ value: string; label: string }>;
  validate?: (value: string) => string | undefined;
};

export type OrgColumn = { header: string; cell: (row: Row) => ReactNode; align?: "right"; className?: string };

export type OrgCrudConfig = {
  title: string;
  description: string;
  apiPath: string;
  viewPermission: string;
  createPermission: string;
  updatePermission: string;
  noun: string;
  fields: OrgField[];
  columns: OrgColumn[];
  toBody: (form: Record<string, string>, mode: "create" | "edit") => Record<string, unknown>;
  fromRow: (row: Row) => Record<string, string>;
  /** Hierarquia (setores): ordena em árvore e indenta pelo pai. */
  parentKey?: string;
  emptyDescription: string;
};

const CODE_RE = /^[A-Za-z0-9_.-]+$/;

function treeOrder(rows: Row[], parentKey: string): Array<{ row: Row; depth: number }> {
  const children = new Map<string | null, Row[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const row of rows) {
    const parent = (row[parentKey] as string | null) ?? null;
    const key = parent && ids.has(parent) ? parent : null;
    children.set(key, [...(children.get(key) ?? []), row]);
  }
  const out: Array<{ row: Row; depth: number }> = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const row of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push({ row, depth });
      walk(row.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

export function OrgCrudPage({ config }: { config: OrgCrudConfig }) {
  const { can } = useSession();
  const allowed = can(config.viewPermission);
  const res = useCached<Row[]>(config.apiPath, allowed);
  const canCreate = can(config.createPermission);
  const canUpdate = can(config.updatePermission);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("active");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; row: Row | null; form: Record<string, string> } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<Row | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = (res.data ?? []).filter((r) => (!status || r.status === status) && (!q || `${r.code} ${r.name} ${r.description ?? ""}`.toLowerCase().includes(q)));
    return config.parentKey && !q ? treeOrder(all, config.parentKey) : all.map((row) => ({ row, depth: 0 }));
  }, [res.data, query, status, config.parentKey]);

  if (!allowed) return <NoAccess />;

  function open(mode: "create" | "edit", row: Row | null) {
    setErrors({});
    const blank = Object.fromEntries(config.fields.map((f) => [f.key, ""]));
    setDialog({ mode, row, form: row ? { ...blank, ...config.fromRow(row) } : blank });
  }

  async function submit() {
    if (!dialog) return;
    const found: Record<string, string> = {};
    for (const field of config.fields) {
      if (dialog.mode === "edit" && field.createOnly) continue;
      const value = (dialog.form[field.key] ?? "").trim();
      if (field.required && !value) found[field.key] = `Informe ${field.label.toLowerCase()}.`;
      else if (field.key === "code" && value && !CODE_RE.test(value)) found[field.key] = "Use letras, números, ponto, hífen ou underscore.";
      else if (value && field.validate) {
        const message = field.validate(value);
        if (message) found[field.key] = message;
      }
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const body = config.toBody(dialog.form, dialog.mode);
      if (dialog.mode === "create") await adminSend(config.apiPath, "POST", body);
      else await adminSend(`${config.apiPath}/${dialog.row!.id}`, "PATCH", body);
      toast.success(dialog.mode === "create" ? `${config.noun} criado(a).` : `${config.noun} atualizado(a).`);
      setDialog(null);
      res.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!toggling) return;
    setSaving(true);
    try {
      await adminSend(`${config.apiPath}/${toggling.id}`, "PATCH", { status: toggling.status === "active" ? "inactive" : "active" });
      toast.success(toggling.status === "active" ? `${toggling.name} desativado(a).` : `${toggling.name} reativado(a).`);
      setToggling(null);
      res.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a situação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          canCreate ? (
            <Button size="sm" onClick={() => open("create", null)}>
              <Plus size={14} aria-hidden /> Novo(a) {config.noun.toLowerCase()}
            </Button>
          ) : undefined
        }
      />
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative w-full max-w-xs">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
            <Input aria-label="Buscar" placeholder="Buscar por código ou nome..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
          </div>
          <Select
            size="sm"
            aria-label="Situação"
            value={status}
            onValueChange={(v) => setStatus(v as typeof status)}
            options={[{ value: "", label: "Todas as situações" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }]}
            className="w-44"
          />
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{rows.length} registro(s)</span>
        </div>
        {res.loading ? (
          <SkeletonRows rows={5} />
        ) : res.error ? (
          <EmptyState compact kind="error" title="Não foi possível carregar" description={res.error} onRetry={res.reload} />
        ) : rows.length === 0 ? (
          <EmptyState compact kind={query || status ? "no-results" : "empty"} title={query || status ? "Nenhum resultado" : "Nada cadastrado ainda"} description={query || status ? "Ajuste a busca ou a situação." : config.emptyDescription} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted">
                  <th scope="col" className="h-8 w-32 px-4 text-left text-2xs font-medium tracking-wide text-muted-foreground uppercase">Código</th>
                  <th scope="col" className="h-8 px-4 text-left text-2xs font-medium tracking-wide text-muted-foreground uppercase">Nome</th>
                  {config.columns.map((c) => (
                    <th key={c.header} scope="col" className={cn("h-8 px-4 text-2xs font-medium tracking-wide text-muted-foreground uppercase", c.align === "right" ? "text-right" : "text-left")}>{c.header}</th>
                  ))}
                  <th scope="col" className="h-8 w-28 px-4 text-left text-2xs font-medium tracking-wide text-muted-foreground uppercase">Status</th>
                  {canUpdate && <th scope="col" className="w-20"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ row, depth }) => (
                  <tr key={row.id} className="h-10 border-b border-border last:border-0 hover:bg-surface-hover">
                    <td className="code px-4 text-xs">{row.code}</td>
                    <td className="px-4">
                      <span className="flex items-center" style={{ paddingLeft: depth * 16 }}>
                        {depth > 0 && <span aria-hidden className="mr-2 h-px w-2.5 bg-border-strong" />}
                        <span className="font-medium">{row.name}</span>
                      </span>
                      {typeof row.description === "string" && row.description && <span className="block truncate text-xs text-muted-foreground" style={{ paddingLeft: depth * 16 + (depth > 0 ? 18 : 0) }}>{row.description}</span>}
                    </td>
                    {config.columns.map((c) => (
                      <td key={c.header} className={cn("px-4", c.align === "right" && "text-right tabular-nums", c.className)}>{c.cell(row)}</td>
                    ))}
                    <td className="px-4"><StatusBadge status={row.status} /></td>
                    {canUpdate && (
                      <td className="px-2">
                        <span className="flex justify-end gap-0.5">
                          <Tooltip content="Editar">
                            <Button variant="ghost" size="icon-sm" aria-label={`Editar ${row.name}`} onClick={() => open("edit", row)}><Pencil size={14} /></Button>
                          </Tooltip>
                          <Tooltip content={row.status === "active" ? "Desativar" : "Reativar"}>
                            <Button variant="ghost" size="icon-sm" aria-label={`${row.status === "active" ? "Desativar" : "Reativar"} ${row.name}`} onClick={() => setToggling(row)}><Power size={14} /></Button>
                          </Tooltip>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && !saving && setDialog(null)}
        title={dialog?.mode === "create" ? `Novo(a) ${config.noun.toLowerCase()}` : `Editar ${config.noun.toLowerCase()}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} loading={saving}>{dialog?.mode === "create" ? "Criar" : "Salvar"}</Button>
          </>
        }
      >
        {dialog && (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            {config.fields.map((field) => {
              const readOnly = dialog.mode === "edit" && field.createOnly;
              const value = dialog.form[field.key] ?? "";
              const set = (v: string) => { setDialog({ ...dialog, form: { ...dialog.form, [field.key]: v } }); if (errors[field.key]) setErrors((e) => ({ ...e, [field.key]: "" })); };
              return (
                <FormField key={field.key} label={field.label} required={field.required && !readOnly} help={readOnly ? "Não pode ser alterado após a criação." : field.help} error={errors[field.key] || undefined}>
                  {field.type === "textarea" ? (
                    <Textarea rows={2} value={value} onChange={(e) => set(e.target.value)} />
                  ) : field.type === "select" ? (
                    <Select value={value} onValueChange={set} options={field.options?.(dialog.form, dialog.row) ?? []} />
                  ) : (
                    <Input value={value} readOnly={readOnly} inputMode={field.type === "number" ? "numeric" : undefined} className={field.mono ? "code" : undefined} onChange={(e) => set(e.target.value)} />
                  )}
                </FormField>
              );
            })}
            <button type="submit" hidden />
          </form>
        )}
      </Dialog>

      {toggling && (
        <ConfirmDialog
          open
          title={toggling.status === "active" ? `Desativar ${toggling.name}?` : `Reativar ${toggling.name}?`}
          description={toggling.status === "active" ? "O registro deixa de aparecer nas escolhas, mas o histórico e os vínculos existentes são mantidos." : "O registro volta a ficar disponível para uso."}
          confirmLabel={toggling.status === "active" ? "Desativar" : "Reativar"}
          tone={toggling.status === "active" ? "danger" : "default"}
          loading={saving}
          onConfirm={toggleStatus}
          onCancel={() => setToggling(null)}
        />
      )}
    </div>
  );
}
