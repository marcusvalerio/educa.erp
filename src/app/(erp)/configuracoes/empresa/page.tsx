"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelFooter } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Alert, EmptyState, Skeleton } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useCached, invalidateCache } from "@/lib/dashboard/client";
import { apiSend } from "@/lib/api-client";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

type CompanyProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: string;
};

type FormState = Record<"name" | "legal_name" | "document" | "email" | "phone" | "address" | "city" | "state" | "zip_code", string>;

const EMPTY: FormState = { name: "", legal_name: "", document: "", email: "", phone: "", address: "", city: "", state: "", zip_code: "" };

function toForm(c: CompanyProfile): FormState {
  return { name: c.name ?? "", legal_name: c.legal_name ?? "", document: c.document ?? "", email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", city: c.city ?? "", state: c.state ?? "", zip_code: c.zip_code ?? "" };
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!form.name.trim()) errors.name = "Informe o nome da empresa.";
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "E-mail inválido.";
  if (form.state.trim() && form.state.trim().length !== 2) errors.state = "Use a sigla da UF (2 letras).";
  return errors;
}

// Dados cadastrais da própria empresa (/api/companies/me). A leitura
// exige companies.read e a edição companies.update — verificadas no
// servidor; aqui só escondemos o que o perfil não pode fazer.
export default function EmpresaPage() {
  const { can, data: session } = useSession();
  const profile = useCached<CompanyProfile>("/api/companies/me");
  const canEdit = can("companies.update");
  const [form, setForm] = useState<FormState>(EMPTY);
  const [initial, setInitial] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    const next = toForm(profile.data);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(next);
    setInitial(next);
  }, [profile.data]);

  const dirty = (Object.keys(form) as Array<keyof FormState>).some((k) => form[k] !== initial[k]);
  useUnsavedChanges(dirty);

  function set(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiSend<CompanyProfile>("/api/companies/me", "PATCH", {
        name: form.name.trim(),
        legalName: form.legal_name,
        document: form.document,
        email: form.email,
        phone: form.phone,
        address: form.address,
        city: form.city,
        state: form.state.toUpperCase(),
        zipCode: form.zip_code,
      });
      const next = toForm(updated);
      setForm(next);
      setInitial(next);
      invalidateCache("/api/companies/me");
      toast.success("Dados da empresa atualizados.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof FormState, label: string, extra?: { help?: string; required?: boolean; type?: string; mono?: boolean; className?: string }) => (
    <FormField label={label} required={extra?.required} help={extra?.help} error={errors[key]} className={extra?.className}>
      <Input value={form[key]} onChange={(e) => set(key, e.target.value)} readOnly={!canEdit} type={extra?.type} className={extra?.mono ? "code" : undefined} />
    </FormField>
  );

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Dados da empresa" description="Informações cadastrais usadas em documentos, integrações e comunicação." />

      {profile.loading ? (
        <Panel className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Panel>
      ) : profile.error ? (
        <Panel>
          <EmptyState
            kind={/permiss/i.test(profile.error) ? "no-permission" : "error"}
            title="Dados cadastrais indisponíveis"
            description={
              /permiss/i.test(profile.error)
                ? `O seu perfil não tem a permissão de leitura dos dados cadastrais${session?.tenant ? ` de ${session.tenant.company.name}` : ""}.`
                : profile.error
            }
            onRetry={/permiss/i.test(profile.error) ? undefined : profile.reload}
          />
        </Panel>
      ) : (
        <form onSubmit={submit} noValidate>
          <Panel>
            {!canEdit && (
              <div className="border-b border-border p-4">
                <Alert tone="info" title="Somente leitura">O seu perfil pode consultar, mas não alterar, os dados da empresa.</Alert>
              </div>
            )}
            {saveError && (
              <div className="border-b border-border p-4">
                <Alert tone="danger" title="Não foi possível salvar">{saveError}</Alert>
              </div>
            )}
            <div className="flex flex-col gap-6 p-4">
              <FormSection title="Identificação">
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("name", "Nome", { required: true, help: "Nome exibido no sistema." })}
                  {field("legal_name", "Razão social")}
                  {field("document", "CNPJ", { mono: true })}
                </div>
              </FormSection>
              <FormSection title="Contato">
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("email", "E-mail", { type: "email" })}
                  {field("phone", "Telefone")}
                </div>
              </FormSection>
              <FormSection title="Endereço">
                <div className="grid gap-4 sm:grid-cols-6">
                  {field("address", "Logradouro", { className: "sm:col-span-6" })}
                  {field("city", "Cidade", { className: "sm:col-span-3" })}
                  {field("state", "UF", { className: "sm:col-span-1" })}
                  {field("zip_code", "CEP", { mono: true, className: "sm:col-span-2" })}
                </div>
              </FormSection>
            </div>
            {canEdit && (
              <PanelFooter className="justify-between">
                <span className="text-xs text-muted-foreground">{dirty ? "Alterações não salvas" : "Tudo salvo"}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => { setForm(initial); setErrors({}); }}>
                    Descartar
                  </Button>
                  <Button type="submit" loading={saving} disabled={!dirty}>
                    Salvar alterações
                  </Button>
                </div>
              </PanelFooter>
            )}
          </Panel>
        </form>
      )}
    </div>
  );
}
