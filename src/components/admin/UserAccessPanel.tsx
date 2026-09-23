"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Select } from "@/components/ui/Controls";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { adminSend, useAdminCollections, type AdminUser } from "./data";

// Vínculos de acesso de um usuário. Cada alteração chama a função do
// banco correspondente (fn_set_user_org_context, fn_assign/revoke_user_role,
// fn_grant/revoke_user_branch_access), que valida permissão e auditoria.

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function UserAccessPanel({ user, onChanged }: { user: AdminUser; onChanged: () => void }) {
  const { can, data: session } = useSession();
  const { departments, positions, roles, branches } = useAdminCollections();
  const canAssignOrg = can("org.assign");
  const canManageRoles = can("roles.manage");
  const isSelf = session?.tenant?.user.id === user.id;

  const [org, setOrg] = useState({ branchId: user.branch_id ?? "", departmentId: user.department_id ?? "", positionId: user.position_id ?? "" });
  const [savingOrg, setSavingOrg] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const orgDirty = org.branchId !== (user.branch_id ?? "") || org.departmentId !== (user.department_id ?? "") || org.positionId !== (user.position_id ?? "");

  async function saveOrg() {
    setSavingOrg(true);
    try {
      await adminSend(`/api/admin/users/${user.id}/org`, "PATCH", {
        branchId: org.branchId || null,
        departmentId: org.departmentId || null,
        positionId: org.positionId || null,
      });
      toast.success("Contexto organizacional atualizado.");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSavingOrg(false);
    }
  }

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusyKey(key);
    try {
      await action();
      toast.success(success);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir.");
    } finally {
      setBusyKey(null);
    }
  }

  const activeDepartments = (departments.data ?? []).filter((d) => d.status === "active" || d.id === org.departmentId);
  const activePositions = (positions.data ?? []).filter((p) => (p.status === "active" || p.id === org.positionId) && (!org.departmentId || !p.department_id || p.department_id === org.departmentId));
  const branchAccess = new Map(user.branch_access.map((b) => [b.branchId, b]));

  return (
    <div className="flex flex-col gap-5">
      {isSelf && <Alert tone="warning" title="Este é o seu usuário">Remover os próprios papéis ou unidades pode encerrar o seu acesso a esta administração.</Alert>}

      <Section title="Contexto organizacional" description="Unidade principal, setor e cargo — usados nos painéis e no foco do usuário.">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Unidade principal">
            <Select
              value={org.branchId}
              onValueChange={(v) => setOrg((o) => ({ ...o, branchId: v }))}
              disabled={!canAssignOrg}
              placeholder="Sem unidade"
              options={[{ value: "", label: "Sem unidade" }, ...(branches.data ?? []).filter((b) => b.status === "active").map((b) => ({ value: b.id, label: b.name }))]}
            />
          </FormField>
          <FormField label="Setor">
            <Select
              value={org.departmentId}
              onValueChange={(v) => setOrg((o) => ({ ...o, departmentId: v }))}
              disabled={!canAssignOrg}
              placeholder="Sem setor"
              options={[{ value: "", label: "Sem setor" }, ...activeDepartments.map((d) => ({ value: d.id, label: d.name }))]}
            />
          </FormField>
          <FormField label="Cargo">
            <Select
              value={org.positionId}
              onValueChange={(v) => setOrg((o) => ({ ...o, positionId: v }))}
              disabled={!canAssignOrg}
              placeholder="Sem cargo"
              options={[{ value: "", label: "Sem cargo" }, ...activePositions.map((p) => ({ value: p.id, label: p.name }))]}
            />
          </FormField>
        </div>
        {canAssignOrg ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={!orgDirty || savingOrg} onClick={() => setOrg({ branchId: user.branch_id ?? "", departmentId: user.department_id ?? "", positionId: user.position_id ?? "" })}>
              Descartar
            </Button>
            <Button size="sm" disabled={!orgDirty} loading={savingOrg} onClick={saveOrg}>
              Salvar contexto
            </Button>
          </div>
        ) : (
          <p className="text-xs text-subtle-foreground">Alterar o contexto exige a permissão de atribuição organizacional.</p>
        )}
      </Section>

      <Section title="Papéis" description="O conjunto de permissões do usuário é a soma dos papéis atribuídos.">
        {!user.links_visible ? (
          <p className="text-sm text-muted-foreground">O seu perfil não pode ver os papéis atribuídos.</p>
        ) : (roles.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{roles.loading ? "Carregando…" : "Nenhum papel cadastrado."}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(roles.data ?? []).map((role) => {
              const has = user.role_ids.includes(role.id);
              const key = `role:${role.id}`;
              const disabled = !canManageRoles || busyKey !== null || (role.status !== "active" && !has);
              return (
                <li key={role.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={key}
                    checked={has}
                    disabled={disabled}
                    aria-label={`${has ? "Remover" : "Atribuir"} papel ${role.name}`}
                    onCheckedChange={() =>
                      run(
                        key,
                        () => (has ? adminSend(`/api/admin/users/${user.id}/roles?roleId=${role.id}`, "DELETE") : adminSend(`/api/admin/users/${user.id}/roles`, "POST", { roleId: role.id })),
                        has ? `Papel ${role.name} removido.` : `Papel ${role.name} atribuído.`
                      )
                    }
                  />
                  <label htmlFor={key} className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{role.name}</span>
                    {role.description && <span className="block truncate text-xs text-muted-foreground">{role.description}</span>}
                  </label>
                  {role.is_system && <Badge>Sistema</Badge>}
                  {role.status !== "active" && <Badge tone="neutral">Inativo</Badge>}
                  <span className="text-2xs text-subtle-foreground tabular-nums">{role.permission_codes.length} permissões</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Unidades com acesso" description="Os dados operacionais visíveis ao usuário ficam limitados a estas unidades.">
        {!user.links_visible ? (
          <p className="text-sm text-muted-foreground">O seu perfil não pode ver os acessos por unidade.</p>
        ) : (branches.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{branches.loading ? "Carregando…" : "Nenhuma unidade cadastrada."}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(branches.data ?? []).map((branch) => {
              const access = branchAccess.get(branch.id);
              const key = `branch:${branch.id}`;
              const disabled = !canAssignOrg || busyKey !== null || (branch.status !== "active" && !access);
              return (
                <li key={branch.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={key}
                    checked={!!access}
                    disabled={disabled}
                    aria-label={`${access ? "Revogar" : "Liberar"} acesso à unidade ${branch.name}`}
                    onCheckedChange={() =>
                      run(
                        key,
                        () => (access ? adminSend(`/api/admin/users/${user.id}/branches?branchId=${branch.id}`, "DELETE") : adminSend(`/api/admin/users/${user.id}/branches`, "POST", { branchId: branch.id })),
                        access ? `Acesso a ${branch.name} revogado.` : `Acesso a ${branch.name} liberado.`
                      )
                    }
                  />
                  <label htmlFor={key} className="min-w-0 flex-1 text-sm">
                    {branch.name} <span className="code text-xs text-subtle-foreground">{branch.code}</span>
                  </label>
                  {access?.isPrimary ? (
                    <Badge tone="accent" icon={<Star size={11} aria-hidden />}>
                      Principal
                    </Badge>
                  ) : (
                    access &&
                    canAssignOrg && (
                      <Button
                        size="xs"
                        variant="ghost"
                        disabled={busyKey !== null}
                        onClick={() => run(`${key}:primary`, () => adminSend(`/api/admin/users/${user.id}/branches`, "POST", { branchId: branch.id, isPrimary: true }), `${branch.name} definida como principal.`)}
                      >
                        Tornar principal
                      </Button>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
