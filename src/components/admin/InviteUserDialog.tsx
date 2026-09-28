"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/format";
import { inviteCompanyUserSchema } from "@/lib/onboarding/invitations";
import { adminSend, type AdminRole } from "./data";

// Convidar usuário da empresa num passo só: nome, e-mail e papel.
// O banco (fn_invite_company_user, 0075) decide tudo — empresa do próprio
// Administrador, users.create + roles.manage e nenhuma permissão além das
// que quem convida já tem. Esta tela não escolhe empresa nem login.

type InviteResult = { email: string; expiresAt: string; inviteUrl: string; emailSent: boolean; deliveryNote: string | null };

// Papéis de sistema primeiro, na ordem da hierarquia da empresa.
const SYSTEM_ORDER = ["admin", "gerente", "operador", "vendedor", "leitura"];
const rank = (role: AdminRole) => {
  const i = role.is_system ? SYSTEM_ORDER.indexOf(role.code) : -1;
  return i === -1 ? SYSTEM_ORDER.length : i;
};

export function InviteUserDialog({ open, onOpenChange, roles, onInvited }: { open: boolean; onOpenChange: (open: boolean) => void; roles: AdminRole[]; onInvited: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", roleId: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const options = roles
    .filter((r) => r.status === "active")
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .map((r) => ({ value: r.id, label: r.name }));

  function close(next: boolean) {
    if (saving) return;
    if (!next) {
      setForm({ name: "", email: "", roleId: "" });
      setErrors({});
      setResult(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    const parsed = inviteCompanyUserSchema.safeParse({ name: form.name, email: form.email, roleId: form.roleId });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message])));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await adminSend<InviteResult>("/api/admin/users/invite", "POST", parsed.data);
      setResult(res);
      toast.success(res.emailSent ? `Convite enviado para ${res.email}.` : "Convite criado.");
      onInvited();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o convite.");
    } finally {
      setSaving(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Convidar usuário"
      description="A pessoa recebe um convite para criar a senha e passa a acessar somente o que o papel permite, nesta empresa."
      footer={
        result ? (
          <Button onClick={() => close(false)}>Concluir</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={submit} loading={saving}>Enviar convite</Button>
          </>
        )
      }
    >
      {result ? (
        <Alert tone={result.emailSent ? "success" : "warning"} title={result.emailSent ? "Convite enviado" : "Convite criado — envie o link"}>
          <p>{result.emailSent ? `A pessoa recebe o link em ${result.email}. Ele vale até ${formatDateTime(result.expiresAt)} e só pode ser usado uma vez.` : result.deliveryNote}</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={result.inviteUrl} aria-label="Link do convite" className="code text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="secondary" onClick={() => copy(result.inviteUrl)}>
              <Copy size={14} aria-hidden /> Copiar
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          <FormField label="Nome" required error={errors.name}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="E-mail" required error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Papel" required error={errors.roleId} help="Administrador, Gerente, Operador, Vendedor, Somente leitura ou um papel criado em Papéis.">
            <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v })} options={options} placeholder="Escolha o papel" aria-label="Papel" />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}
