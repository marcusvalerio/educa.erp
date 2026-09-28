"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DropdownMenuItem } from "@/components/ui/Menu";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { dateCol, enumFilter, statusCol, textCol } from "@/components/data-table/columns";
import { useSession } from "@/components/shell/SessionProvider";
import { platformSend, type PlatformMember } from "@/components/platform/data";

// Membros da operação EDUCA (Owner/Admin). As regras de quem pode gerir
// quem — Admin não mexe em Owner, o último Owner é protegido — estão em
// fn_upsert_platform_member e no trigger guard_last_platform_owner.
// Novo membro entra por e-mail (convite do Auth ou login existente) —
// ninguém digita identificador de autenticação.

type MemberForm = { authUserId: string; name: string; email: string; platformRole: "OWNER" | "ADMIN"; status: "active" | "inactive" };

export default function PlatformMembersPage() {
  const { canPlatform, data } = useSession();
  const canManage = canPlatform("platform.members.manage");
  const myRole = data?.platform?.role;
  const [refresh, setRefresh] = useState(0);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; form: MemberForm } | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof MemberForm, string>>>({});
  const [saving, setSaving] = useState(false);

  function edit(member: PlatformMember) {
    setErrors({});
    setDialog({ mode: "edit", form: { authUserId: member.auth_user_id, name: member.name, email: member.email, platformRole: member.platform_role, status: member.status } });
  }

  async function submit() {
    if (!dialog) return;
    const f = dialog.form;
    const found: Partial<Record<keyof MemberForm, string>> = {};
    if (!f.name.trim()) found.name = "Informe o nome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) found.email = "E-mail inválido.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      if (dialog.mode === "create") {
        const res = await platformSend<{ emailSent: boolean }>("/api/platform/members/invite", "POST", { name: f.name.trim(), email: f.email.trim(), platformRole: f.platformRole });
        toast.success(res.emailSent ? `Convite enviado para ${f.email.trim()}.` : "Membro adicionado: a conta já existia e já pode entrar.");
      } else {
        await platformSend("/api/platform/members", "POST", { authUserId: f.authUserId, name: f.name.trim(), email: f.email.trim(), platformRole: f.platformRole, status: f.status });
        toast.success("Membro atualizado.");
      }
      setDialog(null);
      setRefresh((n) => n + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o membro.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ResourceListPage<PlatformMember>
        title="Membros da plataforma"
        description="Pessoas da operação EDUCA com acesso à Administração Central. Não são usuários de nenhuma empresa."
        apiPath="/api/platform/members"
        tableId="platform-members"
        refreshToken={refresh}
        searchPlaceholder="Buscar por nome ou e-mail..."
        actions={
          canManage ? (
            <Button size="sm" onClick={() => { setErrors({}); setDialog({ mode: "create", form: { authUserId: "", name: "", email: "", platformRole: "ADMIN", status: "active" } }); }}>
              <UserPlus size={14} aria-hidden /> Convidar membro
            </Button>
          ) : undefined
        }
        columns={[
          textCol<PlatformMember>("name", "Nome", { mobile: "title" }),
          textCol<PlatformMember>("email", "E-mail", { mobile: "meta" }),
          statusCol<PlatformMember>("platform_role", "platform_role", "Papel"),
          statusCol<PlatformMember>(undefined, "status", "Status"),
          dateCol<PlatformMember>("created_at", "Desde", { defaultHidden: true }),
        ]}
        filters={[enumFilter<PlatformMember>("platform_role", "Papel", [["OWNER", "Owner"], ["ADMIN", "Admin"]]), enumFilter<PlatformMember>("status", "Status", [["active", "Ativo"], ["inactive", "Inativo"]])]}
        rowActions={
          canManage
            ? (row) => (
                <DropdownMenuItem disabled={myRole === "ADMIN" && row.platform_role === "OWNER"} onSelect={() => edit(row)}>
                  <Pencil size={14} aria-hidden /> Editar membro
                </DropdownMenuItem>
              )
            : undefined
        }
        detail={{
          title: (row) => row.name,
          subtitle: (row) => row.email,
          badges: (row) => <StatusBadge entity="platform_role" status={row.platform_role} />,
          history: false,
          sections: [
            {
              title: "Acesso",
              fields: [
                { label: "Papel", value: (row) => <StatusBadge entity="platform_role" status={row.platform_role} /> },
                { label: "Status", value: (row) => <StatusBadge status={row.status} /> },
                { label: "Login", value: () => "Vinculado" },
              ],
            },
          ],
          actions: canManage ? (row) => (myRole === "ADMIN" && row.platform_role === "OWNER" ? null : <Button variant="secondary" onClick={() => edit(row)}><Pencil size={14} aria-hidden /> Editar</Button>) : undefined,
        }}
        emptyDescription="Nenhum membro cadastrado. A plataforma precisa de ao menos um Owner ativo."
      />

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && !saving && setDialog(null)}
        title={dialog?.mode === "create" ? "Convidar membro da plataforma" : "Editar membro"}
        description={dialog?.mode === "create" ? "A pessoa recebe um e-mail para criar a senha. Se já tiver conta no EDUCA, passa a ver a Administração Central no próximo acesso." : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} loading={saving}>{dialog?.mode === "create" ? "Enviar convite" : "Salvar"}</Button>
          </>
        }
      >
        {dialog && (
          <div className="flex flex-col gap-3">
            {myRole === "ADMIN" && <Alert tone="info" title="Regra de governança">Admins gerenciam apenas outros Admins. Owners são geridos somente por Owners.</Alert>}
            {dialog.mode === "edit" && dialog.form.platformRole === "OWNER" && (
              <Alert tone="warning">O último Owner ativo não pode ser rebaixado nem desativado — a plataforma sempre mantém um Owner.</Alert>
            )}
            <FormField label="Nome" required error={errors.name}>
              <Input value={dialog.form.name} onChange={(e) => setDialog({ ...dialog, form: { ...dialog.form, name: e.target.value } })} />
            </FormField>
            <FormField label="E-mail" required error={errors.email} help={dialog.mode === "edit" ? "O login do membro não muda por aqui." : undefined}>
              <Input type="email" value={dialog.form.email} readOnly={dialog.mode === "edit"} onChange={(e) => setDialog({ ...dialog, form: { ...dialog.form, email: e.target.value } })} />
            </FormField>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Papel">
                <Select
                  value={dialog.form.platformRole}
                  onValueChange={(v) => setDialog({ ...dialog, form: { ...dialog.form, platformRole: v as MemberForm["platformRole"] } })}
                  options={[{ value: "ADMIN", label: "Admin" }, ...(myRole === "OWNER" ? [{ value: "OWNER", label: "Owner" }] : [])]}
                />
              </FormField>
              {dialog.mode === "edit" && <FormField label="Status">
                <Select value={dialog.form.status} onValueChange={(v) => setDialog({ ...dialog, form: { ...dialog.form, status: v as MemberForm["status"] } })} options={[{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }]} />
              </FormField>}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
