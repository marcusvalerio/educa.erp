"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Copy, MailPlus, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, Switch } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached } from "@/lib/dashboard/client";
import { formatDateTime } from "@/lib/format";
import { createCompanySchema, inviteCompanyAdminSchema } from "@/lib/onboarding/invitations";
import { platformSend } from "./data";

// Onboarding de empresa pela plataforma:
//   1. criar a empresa (fn_platform_create_company — só campos que existem
//      no modelo; papéis, módulos essenciais e perfil SaaS são semeados
//      pelos gatilhos do banco);
//   2. convidar o PRIMEIRO administrador (fn_platform_invite_company_admin).
// Depois disso, a empresa se administra em /admin — a plataforma não
// cria usuários comuns, não lê dados operacionais e não entra na empresa.

type InviteResult = { email: string; userName: string; expiresAt: string; inviteUrl: string; emailSent: boolean; deliveryNote: string | null };
type Onboarding = { admin_with_access: boolean; pending_admin_invitation: { email_hint: string | null; expires_at: string; expired: boolean } | null };

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Link copiado.");
  } catch {
    toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
  }
}

function InviteResultCard({ result }: { result: InviteResult }) {
  return (
    <Alert tone={result.emailSent ? "success" : "warning"} title={result.emailSent ? "Convite enviado" : "Convite criado — envie o link"}>
      <p>
        {result.emailSent
          ? `${result.userName} recebe o link em ${result.email}. Válido até ${formatDateTime(result.expiresAt)}, uso único.`
          : result.deliveryNote}
      </p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={result.inviteUrl} aria-label="Link do convite" className="code text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" variant="secondary" onClick={() => copyText(result.inviteUrl)}>
          <Copy size={14} aria-hidden /> Copiar
        </Button>
      </div>
    </Alert>
  );
}

export function CompanyAdminInviteForm({ companyId, onInvited }: { companyId: string; onInvited?: (result: InviteResult) => void }) {
  const [form, setForm] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = inviteCompanyAdminSchema.safeParse(form);
    if (!parsed.success) {
      const found: typeof errors = {};
      for (const issue of parsed.error.issues) found[issue.path[0] as "name" | "email"] ??= issue.message;
      setErrors(found);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await platformSend<InviteResult>(`/api/platform/companies/${companyId}/admin-invitation`, "POST", parsed.data);
      setResult(res);
      toast.success(res.emailSent ? "Convite enviado ao administrador." : "Convite criado.");
      onInvited?.(res);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível convidar o administrador.");
    } finally {
      setBusy(false);
    }
  }

  if (result) return <InviteResultCard result={result} />;

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nome do administrador" required error={errors.name}>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
        </FormField>
        <FormField label="E-mail" required error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" placeholder="nome@empresa.com.br" />
        </FormField>
      </div>
      <p className="text-xs text-subtle-foreground">
        Recebe o papel de administrador da empresa. Só a pessoa com este e-mail consegue aceitar o convite. Depois do primeiro acesso, novos usuários são convidados pela própria empresa.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={busy}>
          <MailPlus size={14} aria-hidden /> Convidar administrador
        </Button>
      </div>
    </form>
  );
}

/** Situação do administrador da empresa (no detalhe da empresa). */
export function CompanyAdminSection({ companyId }: { companyId: string }) {
  const { canPlatform } = useSession();
  const status = useCached<Onboarding>(`/api/platform/companies/${companyId}/onboarding`, canPlatform("platform.companies.view"));
  const canInvite = canPlatform("platform.companies.create");
  const pending = status.data?.pending_admin_invitation ?? null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Administrador da empresa</h3>
          <p className="text-xs text-muted-foreground">Primeiro acesso da empresa. A plataforma não vê nem gerencia os demais usuários.</p>
        </div>
        {status.data &&
          (status.data.admin_with_access ? (
            <Badge tone="success" dot>Configurado</Badge>
          ) : pending && !pending.expired ? (
            <Badge tone="info" dot>Convite pendente</Badge>
          ) : (
            <Badge tone="warning" dot>Pendente</Badge>
          ))}
      </div>
      {status.error ? (
        <p className="text-sm text-danger-fg">{status.error}</p>
      ) : status.loading || !status.data ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : status.data.admin_with_access ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 size={15} className="text-success-fg" aria-hidden /> A empresa já tem um administrador com acesso e gerencia os próprios usuários.
        </p>
      ) : (
        <>
          {pending && (
            <Alert tone={pending.expired ? "warning" : "info"}>
              {pending.expired
                ? `O convite enviado para ${pending.email_hint} expirou em ${formatDateTime(pending.expires_at)}. Envie um novo.`
                : `Convite enviado para ${pending.email_hint}, válido até ${formatDateTime(pending.expires_at)}. Um novo convite substitui o anterior.`}
            </Alert>
          )}
          {canInvite ? (
            <CompanyAdminInviteForm companyId={companyId} onInvited={() => status.reload()} />
          ) : (
            <p className="text-sm text-muted-foreground">O seu papel na plataforma não convida administradores.</p>
          )}
        </>
      )}
    </section>
  );
}

type CompanyForm = {
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zipCode: string;
  address: string;
  planCode: string;
  lifecycleStatus: "TRIAL" | "ACTIVE";
  withBranch: boolean;
  branchCode: string;
  branchName: string;
};

const EMPTY_COMPANY: CompanyForm = {
  name: "",
  legalName: "",
  document: "",
  email: "",
  phone: "",
  city: "",
  state: "",
  zipCode: "",
  address: "",
  planCode: "",
  lifecycleStatus: "TRIAL",
  withBranch: true,
  branchCode: "MATRIZ",
  branchName: "Matriz",
};

export function NewCompanyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [errors, setErrors] = useState<Partial<Record<keyof CompanyForm, string>>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ company_id: string; name: string; lifecycle_status: string; branch_id: string | null } | null>(null);
  const set = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  function close() {
    if (busy) return;
    setForm(EMPTY_COMPANY);
    setErrors({});
    setCreated(null);
    onClose();
  }

  async function submit() {
    const { withBranch, branchCode, branchName, ...rest } = form;
    const payload = { ...rest, state: rest.state.toUpperCase(), ...(withBranch ? { branchCode, branchName } : {}) };
    const parsed = createCompanySchema.safeParse(payload);
    if (!parsed.success) {
      const found: typeof errors = {};
      for (const issue of parsed.error.issues) found[issue.path[0] as keyof CompanyForm] ??= issue.message;
      setErrors(found);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await platformSend<{ company_id: string; name: string; lifecycle_status: string; branch_id: string | null }>("/api/platform/companies", "POST", parsed.data);
      setCreated(res);
      toast.success("Empresa criada.");
      onCreated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a empresa.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof CompanyForm) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      size="lg"
      title={created ? "Empresa criada" : "Nova empresa"}
      description={created ? undefined : "Cadastro da empresa cliente. Papéis padrão, módulos essenciais e perfil na plataforma são criados automaticamente."}
      footer={
        created ? (
          <Button variant="secondary" onClick={close}>
            Configurar depois
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={busy}>
              Criar empresa
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-4">
          <Alert tone="success" title={created.name}>
            {created.lifecycle_status === "TRIAL" ? "Em avaliação" : "Ativa"}, com os papéis padrão e os módulos essenciais{created.branch_id ? " e a unidade inicial" : ""}.
          </Alert>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-muted-foreground">
              <UserCog size={16} aria-hidden />
            </span>
            <div>
              <h3 className="text-sm font-semibold">Próximo passo: configurar administrador da empresa</h3>
              <p className="text-xs text-muted-foreground">Convide quem vai administrar a empresa. É essa pessoa que convida os demais usuários.</p>
            </div>
          </div>
          <CompanyAdminInviteForm companyId={created.company_id} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Nome da empresa" required error={errors.name} className="sm:col-span-2">
              <Input {...field("name")} autoFocus />
            </FormField>
            <FormField label="Razão social" error={errors.legalName}>
              <Input {...field("legalName")} />
            </FormField>
            <FormField label="CNPJ / documento" error={errors.document}>
              <Input {...field("document")} inputMode="numeric" />
            </FormField>
            <FormField label="E-mail" error={errors.email}>
              <Input type="email" {...field("email")} />
            </FormField>
            <FormField label="Telefone" error={errors.phone}>
              <Input type="tel" {...field("phone")} />
            </FormField>
            <FormField label="Endereço" error={errors.address} className="sm:col-span-2">
              <Input {...field("address")} />
            </FormField>
            <FormField label="Cidade" error={errors.city}>
              <Input {...field("city")} />
            </FormField>
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <FormField label="UF" error={errors.state}>
                <Input {...field("state")} maxLength={2} className="uppercase" />
              </FormField>
              <FormField label="CEP" error={errors.zipCode}>
                <Input {...field("zipCode")} inputMode="numeric" />
              </FormField>
            </div>
          </div>
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <FormField label="Situação inicial">
              <Select
                value={form.lifecycleStatus}
                onValueChange={(v) => set("lifecycleStatus", v as CompanyForm["lifecycleStatus"])}
                options={[
                  { value: "TRIAL", label: "Em avaliação" },
                  { value: "ACTIVE", label: "Ativa" },
                ]}
              />
            </FormField>
            <FormField label="Plano" error={errors.planCode} help="Código do plano contratado (opcional).">
              <Input {...field("planCode")} className="code" />
            </FormField>
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">Criar unidade inicial</span>
                <span className="block text-xs text-muted-foreground">Recomendado: usuários trabalham dentro de unidades.</span>
              </span>
              <Switch checked={form.withBranch} onCheckedChange={(v) => set("withBranch", v)} aria-label="Criar unidade inicial" />
            </label>
            {form.withBranch && (
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                <FormField label="Código" required error={errors.branchCode}>
                  <Input {...field("branchCode")} className="code uppercase" />
                </FormField>
                <FormField label="Nome da unidade" required error={errors.branchName}>
                  <Input {...field("branchName")} />
                </FormField>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
