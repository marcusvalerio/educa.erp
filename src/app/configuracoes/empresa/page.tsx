"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CheckCircle2, RefreshCcw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiGet, apiSend } from "@/lib/api-client";

// Campo de texto simples — o Field genérico de src/components/ui/Field.tsx
// é modelado em torno de FormField (src/lib/cadastros/form-types.ts),
// usado pelos 8 cadastros legados; este formulário é pequeno o
// suficiente para não justificar montar aquele objeto de configuração.
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-ink-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/12"
      />
    </div>
  );
}

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

// Fase 19 — primeira tela a usar /api/companies/me (rota nova, mas
// reaproveitando companies.read/update já semeadas em 0005). Dados
// reais da própria empresa — nunca um formulário decorativo.
export default function EmpresaPage() {
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState<Partial<CompanyProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiGet<CompanyProfile>("/api/companies/me");
        if (cancelled) return;
        setCompany(data);
        setForm(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar os dados da empresa.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function update(key: keyof CompanyProfile, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiSend<CompanyProfile>("/api/companies/me", "PATCH", {
        name: form.name,
        legalName: form.legal_name ?? "",
        document: form.document ?? "",
        email: form.email ?? "",
        phone: form.phone ?? "",
        address: form.address ?? "",
        city: form.city ?? "",
        state: form.state ?? "",
        zipCode: form.zip_code ?? "",
      });
      setCompany(updated);
      setForm(updated);
      setToast("Dados da empresa atualizados com sucesso.");
      setTimeout(() => setToast(null), 3200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar os dados da empresa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Configurações", href: "/configuracoes" }, { label: "Empresa" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Empresa</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">Dados cadastrais da própria empresa, usados em documentos e integrações.</p>
        </div>
      </div>

      {error ? (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar os dados da empresa</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </Card>
      ) : loading ? (
        <Card className="p-6">
          <span className="animate-skeleton block h-4 w-40 rounded bg-border-strong/60" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="animate-skeleton block h-10 rounded bg-border-strong/50" />
            ))}
          </div>
        </Card>
      ) : (
        company && (
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-brand-soft text-brand-ink">
                <Building2 size={18} strokeWidth={1.75} />
              </span>
              <p className="text-[13.5px] font-medium text-ink">{company.name}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nome" value={form.name ?? ""} onChange={(v) => update("name", v)} />
              <TextField label="Razão social" value={form.legal_name ?? ""} onChange={(v) => update("legal_name", v)} />
              <TextField label="Documento" value={form.document ?? ""} onChange={(v) => update("document", v)} />
              <TextField label="E-mail" value={form.email ?? ""} onChange={(v) => update("email", v)} />
              <TextField label="Telefone" value={form.phone ?? ""} onChange={(v) => update("phone", v)} />
              <TextField label="Endereço" value={form.address ?? ""} onChange={(v) => update("address", v)} />
              <TextField label="Cidade" value={form.city ?? ""} onChange={(v) => update("city", v)} />
              <TextField label="Estado" value={form.state ?? ""} onChange={(v) => update("state", v)} />
              <TextField label="CEP" value={form.zip_code ?? ""} onChange={(v) => update("zip_code", v)} />
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </Card>
        )
      )}

      {toast && (
        <div className="fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-lg bg-ink px-4 py-3 text-sm font-medium text-white shadow-lg">
          <CheckCircle2 size={16} className="text-success" />
          {toast}
        </div>
      )}
    </div>
  );
}
