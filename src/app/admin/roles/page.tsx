"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Plus, Search, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelFooter, PanelHeader } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Checkbox, Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";
import { adminSend, useAdminCollections, type AdminRole, type PermissionCatalog } from "@/components/admin/data";

// Papéis e permissões da empresa. A matriz mostra o catálogo real
// (permissions × platform_module_permission_map) e grava o conjunto
// exato via fn_set_role_permissions — o banco recusa códigos fora do
// catálogo e protege o papel administrador de sistema.

type RoleForm = { code: string; name: string; description: string; departmentId: string; status: "active" | "inactive" };

function humanize(code: string) {
  const text = code.replace(/[_.]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function RolesInner() {
  const { can } = useSession();
  const canManage = can("roles.manage");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { roles, departments } = useAdminCollections();
  const catalog = useCached<PermissionCatalog>("/api/admin/permissions");
  const selectedId = params.get("papel") ?? roles.data?.[0]?.id ?? null;
  const role = roles.data?.find((r) => r.id === selectedId) ?? null;
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; form: RoleForm } | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof RoleForm, string>>>({});
  const [savingRole, setSavingRole] = useState(false);

  function select(id: string) {
    const q = new URLSearchParams(params.toString());
    q.set("papel", id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  async function submitRole() {
    if (!dialog) return;
    const f = dialog.form;
    const errors: Partial<Record<keyof RoleForm, string>> = {};
    if (dialog.mode === "create" && !/^[A-Za-z0-9_.-]{1,64}$/.test(f.code.trim())) errors.code = "Use letras, números, ponto, hífen ou underscore (até 64).";
    if (!f.name.trim()) errors.name = "Informe o nome do papel.";
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingRole(true);
    try {
      if (dialog.mode === "create") {
        const created = await adminSend<{ id?: string } | string>("/api/admin/roles", "POST", { code: f.code.trim(), name: f.name.trim(), description: f.description.trim() || undefined, departmentId: f.departmentId || undefined });
        toast.success(`Papel ${f.name} criado.`);
        roles.reload();
        const id = typeof created === "string" ? created : created?.id;
        if (id) select(id);
      } else if (role) {
        await adminSend(`/api/admin/roles/${role.id}`, "PATCH", { name: f.name.trim(), description: f.description.trim(), departmentId: f.departmentId || undefined, status: f.status });
        toast.success("Papel atualizado.");
        roles.reload();
      }
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o papel.");
    } finally {
      setSavingRole(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Papéis e permissões"
        description="Cada papel reúne permissões do catálogo. O acesso de um usuário é a soma dos papéis atribuídos a ele."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => { setFormErrors({}); setDialog({ mode: "create", form: { code: "", name: "", description: "", departmentId: "", status: "active" } }); }}>
              <Plus size={14} aria-hidden /> Novo papel
            </Button>
          ) : undefined
        }
      />

      {roles.error ? (
        <EmptyState kind="error" title="Papéis indisponíveis" description={roles.error} onRetry={roles.reload} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Panel className="self-start">
            <PanelHeader title="Papéis" description={roles.data ? `${roles.data.length} cadastrado(s)` : undefined} />
            {roles.loading ? (
              <div className="flex flex-col gap-2 p-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ul role="listbox" aria-label="Papéis" className="max-h-[70vh] overflow-y-auto p-1">
                {(roles.data ?? []).map((r) => (
                  <li key={r.id} role="option" aria-selected={r.id === selectedId}>
                    <button
                      type="button"
                      onClick={() => select(r.id)}
                      className={cn("flex w-full flex-col gap-0.5 rounded-sm px-3 py-2 text-left hover:bg-surface-hover", r.id === selectedId && "bg-surface-muted")}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className="truncate">{r.name}</span>
                        {r.is_system && <Badge>Sistema</Badge>}
                        {r.status !== "active" && <Badge tone="neutral">Inativo</Badge>}
                      </span>
                      <span className="flex gap-3 text-2xs text-subtle-foreground tabular-nums">
                        <span className="inline-flex items-center gap-1"><Users size={11} aria-hidden /> {r.user_count}</span>
                        <span className="inline-flex items-center gap-1"><ShieldCheck size={11} aria-hidden /> {r.permission_codes.length}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {role ? (
            <RoleMatrix
              key={role.id + role.permission_codes.join(",")}
              role={role}
              catalog={catalog.data}
              catalogLoading={catalog.loading}
              catalogError={catalog.error}
              canManage={canManage}
              departmentName={role.department_id ? departments.data?.find((d) => d.id === role.department_id)?.name : undefined}
              onEdit={() => { setFormErrors({}); setDialog({ mode: "edit", form: { code: role.code, name: role.name, description: role.description ?? "", departmentId: role.department_id ?? "", status: role.status } }); }}
              onSaved={roles.reload}
            />
          ) : (
            !roles.loading && <EmptyState title="Nenhum papel cadastrado" description="Crie o primeiro papel para organizar as permissões da empresa." />
          )}
        </div>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && !savingRole && setDialog(null)}
        title={dialog?.mode === "create" ? "Novo papel" : "Editar papel"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={savingRole}>Cancelar</Button>
            <Button onClick={submitRole} loading={savingRole}>{dialog?.mode === "create" ? "Criar papel" : "Salvar"}</Button>
          </>
        }
      >
        {dialog && (
          <div className="flex flex-col gap-3">
            <FormField label="Código" required error={formErrors.code} help={dialog.mode === "edit" ? "O código não pode ser alterado." : "Identificador único na empresa, ex.: COMPRADOR."}>
              <Input className="code" value={dialog.form.code} readOnly={dialog.mode === "edit"} onChange={(e) => setDialog({ ...dialog, form: { ...dialog.form, code: e.target.value } })} />
            </FormField>
            <FormField label="Nome" required error={formErrors.name}>
              <Input value={dialog.form.name} onChange={(e) => setDialog({ ...dialog, form: { ...dialog.form, name: e.target.value } })} />
            </FormField>
            <FormField label="Descrição">
              <Textarea rows={2} value={dialog.form.description} onChange={(e) => setDialog({ ...dialog, form: { ...dialog.form, description: e.target.value } })} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Setor" help="Opcional: papel típico de um setor.">
                <Select value={dialog.form.departmentId} onValueChange={(v) => setDialog({ ...dialog, form: { ...dialog.form, departmentId: v } })} options={[{ value: "", label: "Nenhum" }, ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
              </FormField>
              {dialog.mode === "edit" && (
                <FormField label="Situação">
                  <Select value={dialog.form.status} onValueChange={(v) => setDialog({ ...dialog, form: { ...dialog.form, status: v as "active" | "inactive" } })} options={[{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }]} />
                </FormField>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function RoleMatrix({
  role,
  catalog,
  catalogLoading,
  catalogError,
  canManage,
  departmentName,
  onEdit,
  onSaved,
}: {
  role: AdminRole;
  catalog: PermissionCatalog | null;
  catalogLoading: boolean;
  catalogError: string | null;
  canManage: boolean;
  departmentName?: string;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(role.permission_codes));
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = role.is_system && role.code === "admin";
  const editable = canManage && !locked;
  const original = useMemo(() => new Set(role.permission_codes), [role.permission_codes]);
  const added = [...draft].filter((c) => !original.has(c));
  const removed = [...original].filter((c) => !draft.has(c));
  const dirty = added.length + removed.length > 0;
  useUnsavedChanges(dirty);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const actionOrder = new Map(catalog.actions.map((a) => [String(a.code), Number(a.sort_order ?? 100)]));
    const actionName = new Map(catalog.actions.map((a) => [String(a.code), String(a.name ?? a.code)]));
    const moduleName = new Map(catalog.modules.map((m) => [m.code, m.name]));
    const moduleOrder = new Map(catalog.modules.map((m) => [m.code, m.sort_order]));
    const q = query.trim().toLowerCase();
    const byModule = new Map<string, typeof catalog.permissions>();
    for (const p of catalog.permissions) {
      if (q && !`${p.code} ${p.description ?? ""}`.toLowerCase().includes(q)) continue;
      const key = p.module_code ?? "outros";
      byModule.set(key, [...(byModule.get(key) ?? []), p]);
    }
    return [...byModule.entries()]
      .sort((a, b) => (moduleOrder.get(a[0]) ?? 999) - (moduleOrder.get(b[0]) ?? 999))
      .map(([code, perms]) => {
        const actions = [...new Set(perms.map((p) => p.action))].sort((a, b) => (actionOrder.get(a) ?? 100) - (actionOrder.get(b) ?? 100));
        const resources = [...new Set(perms.map((p) => p.resource ?? p.module))].sort();
        const cell = new Map(perms.map((p) => [`${p.resource ?? p.module}|${p.action}`, p]));
        return { code, name: moduleName.get(code) ?? "Outros", actions: actions.map((a) => ({ code: a, name: actionName.get(a) ?? humanize(a) })), resources, cell, codes: perms.map((p) => p.code) };
      });
  }, [catalog, query]);

  function toggle(code: string, on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function toggleMany(codes: string[], on: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const c of codes) {
        if (on) next.add(c);
        else next.delete(c);
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await adminSend(`/api/admin/roles/${role.id}/permissions`, "PUT", { permissionCodes: [...draft].sort() });
      toast.success(`Permissões de ${role.name} salvas.`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as permissões.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="min-w-0">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            {role.name}
            <span className="code text-xs font-normal text-subtle-foreground">{role.code}</span>
            {role.is_system && <Badge>Sistema</Badge>}
          </span>
        }
        description={[role.description, departmentName && `Setor: ${departmentName}`, `${role.user_count} usuário(s)`].filter(Boolean).join(" · ")}
        actions={canManage ? <Button size="sm" variant="ghost" onClick={onEdit}><Pencil size={14} aria-hidden /> Editar</Button> : undefined}
      />
      <div className="flex flex-col gap-3 p-4">
        {locked && <Alert tone="info" title="Papel protegido">As permissões do administrador de sistema não podem ser redefinidas — isso evita perder o acesso administrativo.</Alert>}
        {!canManage && !locked && <Alert tone="info" title="Somente leitura">O seu perfil pode consultar, mas não alterar, as permissões.</Alert>}
        <div className="relative max-w-sm">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input aria-label="Filtrar permissões" placeholder="Filtrar permissões..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
        </div>
        {catalogError ? (
          <EmptyState compact kind="error" title="Catálogo indisponível" description={catalogError} />
        ) : catalogLoading || !catalog ? (
          <Skeleton className="h-64 w-full" />
        ) : groups.length === 0 ? (
          <EmptyState compact kind="no-results" title="Nenhuma permissão encontrada" />
        ) : (
          groups.map((group) => {
            const checked = group.codes.filter((c) => draft.has(c)).length;
            const state = checked === 0 ? false : checked === group.codes.length ? true : "indeterminate";
            return (
              <section key={group.code} className="overflow-hidden rounded-md border border-border">
                <header className="flex items-center gap-2 border-b border-border bg-surface-muted px-3 py-2">
                  <Checkbox checked={state} disabled={!editable} onCheckedChange={() => toggleMany(group.codes, state !== true)} aria-label={`Todas as permissões de ${group.name}`} />
                  <h3 className="flex-1 text-sm font-semibold">{group.name}</h3>
                  <span className="text-2xs text-subtle-foreground tabular-nums">{checked}/{group.codes.length}</span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th scope="col" className="h-8 px-3 text-left text-2xs font-medium tracking-wide text-muted-foreground uppercase">Recurso</th>
                        {group.actions.map((a) => (
                          <th key={a.code} scope="col" className="h-8 w-20 px-2 text-center text-2xs font-medium tracking-wide text-muted-foreground uppercase">{a.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.resources.map((resource) => (
                        <tr key={resource} className="h-9 border-b border-border last:border-0 hover:bg-surface-hover">
                          <th scope="row" className="px-3 text-left font-normal">{humanize(resource)}</th>
                          {group.actions.map((a) => {
                            const perm = group.cell.get(`${resource}|${a.code}`);
                            if (!perm) return <td key={a.code} className="text-center text-subtle-foreground" aria-hidden>·</td>;
                            const on = draft.has(perm.code);
                            const changed = on !== original.has(perm.code);
                            return (
                              <td key={a.code} className={cn("text-center", changed && "bg-accent-soft")}>
                                <span className="inline-flex" title={perm.description ?? perm.code}>
                                  <Checkbox checked={on} disabled={!editable} onCheckedChange={(v) => toggle(perm.code, v === true)} aria-label={`${humanize(resource)}: ${a.name}`} />
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
      {editable && (
        <PanelFooter className="sticky bottom-0 bg-surface">
          <span className="text-xs text-muted-foreground tabular-nums">
            {dirty ? `${added.length} adicionada(s) · ${removed.length} removida(s)` : `${draft.size} permissão(ões) no papel`}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={() => setDraft(new Set(role.permission_codes))}>Descartar</Button>
            <Button size="sm" disabled={!dirty} loading={saving} onClick={save}>Salvar permissões</Button>
          </div>
        </PanelFooter>
      )}
    </Panel>
  );
}

export default function AdminRolesPage() {
  return (
    <Suspense>
      <RolesInner />
    </Suspense>
  );
}
