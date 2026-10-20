"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Wand2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { FormField } from "@/components/ui/FormField";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { DetailSection } from "@/components/resource/DetailLayout";
import { useSession } from "@/components/shell/SessionProvider";
import { apiSend } from "@/lib/api-client";
import { invalidateCache, useCached } from "@/lib/dashboard/client";
import { onlyDigits } from "@/lib/fiscal/nfe/uf";

// Configuração mínima para emitir NF-e no modo ensino: emitente, naturezas
// de venda (CFOP 5xxx e 6xxx) e NCM nos produtos. O resto (número, série,
// cálculo, XML e DANFE) a emissão faz sozinha.

type Row = Record<string, unknown>;
type Form = Record<"name" | "cnpj" | "stateRegistration" | "taxRegime" | "zipCode" | "address" | "addressNumber" | "neighborhood" | "city" | "state", string>;

const REGIMES = [
  { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
  { value: "MEI", label: "MEI" },
  { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
  { value: "LUCRO_REAL", label: "Lucro Real" },
];
const UFS = "AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split(" ").map((uf) => ({ value: uf, label: uf }));

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const formOf = (e: Row | undefined): Form => ({
  name: s(e?.name),
  cnpj: s(e?.cnpj),
  stateRegistration: s(e?.state_registration),
  taxRegime: s(e?.tax_regime) || "SIMPLES_NACIONAL",
  zipCode: s(e?.zip_code),
  address: s(e?.address),
  addressNumber: s(e?.address_number),
  neighborhood: s(e?.neighborhood),
  city: s(e?.city),
  state: s(e?.state),
});

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success-fg" aria-label="Feito" /> : <Circle size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-label="Pendente" />}
      <span className={done ? "text-muted-foreground" : undefined}>{children}</span>
    </li>
  );
}

function EmitterForm({ current, onSaved }: { current: Row | undefined; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(() => formOf(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };

  async function lookupCep() {
    const cep = onlyDigits(form.zipCode);
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const body = (await res.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (body.erro) return setError("CEP não encontrado.");
      setForm((f) => ({ ...f, address: f.address || (body.logradouro ?? ""), neighborhood: f.neighborhood || (body.bairro ?? ""), city: body.localidade ?? f.city, state: body.uf ?? f.state }));
    } catch {
      /* sem internet: preenche à mão */
    }
  }

  async function save() {
    if (form.name.trim().length < 2) return setError("Informe a razão social.");
    if (onlyDigits(form.cnpj).length !== 14) return setError("O CNPJ precisa ter 14 números.");
    if (onlyDigits(form.zipCode).length !== 8) return setError("Informe o CEP com 8 dígitos.");
    if (!form.address.trim() || !form.neighborhood.trim() || !form.city.trim() || !form.state) return setError("Preencha endereço, bairro, cidade e UF.");
    setBusy(true);
    try {
      const body = { ...form, cnpj: onlyDigits(form.cnpj), zipCode: onlyDigits(form.zipCode), stateRegistration: onlyDigits(form.stateRegistration) || undefined };
      if (current?.id) await apiSend(`/api/fiscal-establishments/${s(current.id)}`, "PATCH", body);
      else await apiSend("/api/fiscal-establishments", "POST", { ...body, code: "MATRIZ" });
      invalidateCache("/api/fiscal-establishments");
      toast.success("Emitente salvo.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
      {error && (
        <div className="sm:col-span-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="sm:col-span-2">
        <FormField label="Razão social" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} />
        </FormField>
      </div>
      <FormField label="CNPJ" required>
        <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} inputMode="numeric" placeholder="00.000.000/0000-00" />
      </FormField>
      <FormField label="Inscrição estadual" help="Em branco = ISENTO">
        <Input value={form.stateRegistration} onChange={(e) => set("stateRegistration", e.target.value)} inputMode="numeric" />
      </FormField>
      <FormField label="Regime tributário" required help="Simples/MEI usam CSOSN; Lucro Presumido/Real usam CST.">
        <Select value={form.taxRegime} onValueChange={(v) => set("taxRegime", v)} options={REGIMES} />
      </FormField>
      <FormField label="CEP" required help="Ao sair do campo, o endereço é preenchido.">
        <Input value={form.zipCode} onChange={(e) => set("zipCode", e.target.value)} onBlur={lookupCep} inputMode="numeric" placeholder="00000-000" />
      </FormField>
      <div className="sm:col-span-2">
        <FormField label="Endereço" required>
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={60} />
        </FormField>
      </div>
      <FormField label="Número">
        <Input value={form.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} placeholder="S/N" />
      </FormField>
      <FormField label="Bairro" required>
        <Input value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} maxLength={60} />
      </FormField>
      <FormField label="Cidade" required>
        <Input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={60} />
      </FormField>
      <FormField label="UF" required>
        <Select value={form.state} onValueChange={(v) => set("state", v)} options={UFS} />
      </FormField>
      <div className="sm:col-span-2">
        <Button onClick={save} loading={busy}>
          {current?.id ? "Salvar emitente" : "Cadastrar emitente"}
        </Button>
      </div>
    </div>
  );
}

function ProductNcmRow({ product, onSaved }: { product: Row; onSaved: () => void }) {
  const [ncm, setNcm] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    const digits = onlyDigits(ncm);
    if (digits.length !== 8) return toast.error("O NCM tem 8 dígitos (ex.: 4820.20.00).");
    setBusy(true);
    try {
      await apiSend(`/api/products/${s(product.id)}`, "PATCH", { ncm: digits });
      invalidateCache("/api/products");
      toast.success(`NCM salvo em ${s(product.descricao)}.`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-mono text-xs text-muted-foreground">{s(product.codigo)}</span> {s(product.descricao)}
      </span>
      <Input className="w-32" value={ncm} onChange={(e) => setNcm(e.target.value)} inputMode="numeric" placeholder="NCM" aria-label={`NCM de ${s(product.descricao)}`} />
      <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={!ncm}>
        Salvar
      </Button>
    </li>
  );
}

export default function FiscalConfiguracaoPage() {
  const { can } = useSession();
  const establishments = useCached<Row[]>("/api/fiscal-establishments");
  const natures = useCached<Row[]>("/api/fiscal-operation-natures");
  const cfops = useCached<Row[]>("/api/fiscal-cfops");
  const products = useCached<Row[]>("/api/products");
  const [settingUp, setSettingUp] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const emitter = (establishments.data ?? []).find((e) => e.status === "active");
  const cfopCode = new Map((cfops.data ?? []).map((c) => [s(c.id), s(c.code)]));
  const saleNatures = (natures.data ?? []).filter((n) => n.direction === "SAIDA" && n.status === "active");
  const hasInternal = saleNatures.some((n) => cfopCode.get(s(n.default_cfop_id))?.startsWith("5"));
  const hasInterstate = saleNatures.some((n) => cfopCode.get(s(n.default_cfop_id))?.startsWith("6"));
  const activeProducts = (products.data ?? []).filter((p) => p.status === "Ativo");
  const withoutNcm = activeProducts.filter((p) => onlyDigits(p.ncm).length !== 8);

  async function quickSetup() {
    setSettingUp(true);
    try {
      const r = await apiSend<{ cfopsCreated: number; naturesCreated: number }>("/api/fiscal-documents/education-setup", "POST", {});
      for (const p of ["/api/fiscal-cfops", "/api/fiscal-operation-natures"]) invalidateCache(p);
      cfops.reload();
      natures.reload();
      toast.success("Naturezas de venda prontas.", `${r?.cfopsCreated ?? 0} CFOP(s) e ${r?.naturesCreated ?? 0} natureza(s) criadas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível configurar.");
    } finally {
      setSettingUp(false);
    }
  }

  const loading = establishments.loading && !establishments.data;
  const allReady = !!emitter && hasInternal && hasInterstate && withoutNcm.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Configuração NF-e"
        description="O mínimo para emitir NF-e no modo ensino: fiel ao leiaute oficial 4.00, em ambiente de homologação, sem valor fiscal."
      />

      <DetailSection title="Passo a passo">
        <div className="flex flex-col gap-3 p-4">
          <ol className="flex flex-col gap-2">
            <Step done={!!emitter}>Cadastre o emitente (razão social, CNPJ, endereço completo e regime tributário).</Step>
            <Step done={hasInternal && hasInterstate}>Tenha naturezas de venda com CFOP 5102 (dentro do estado) e 6102 (fora do estado).</Step>
            <Step done={activeProducts.length > 0 && withoutNcm.length === 0}>Informe o NCM (8 dígitos) em cada produto vendido.</Step>
            <Step done={false}>
              No pedido de venda aprovado, toque em <strong>Emitir NF-e</strong>. A nota sai numerada, com chave de acesso, XML e DANFE.
            </Step>
          </ol>
          {allReady && <Alert tone="success">Tudo pronto para emitir. Abra um pedido aprovado em Comercial › Pedidos de venda.</Alert>}
          <p className="text-xs text-muted-foreground">
            Impostos: no Simples Nacional a nota sai com CSOSN 102 (sem destaque). Para destacar ICMS, IPI, PIS e COFINS, cadastre{" "}
            <Link className="underline" href="/app/fiscal/impostos">
              regras tributárias
            </Link>
            .
          </p>
        </div>
      </DetailSection>

      <div className="grid gap-4 xl:grid-cols-2">
        <DetailSection title="1. Emitente" description="Quem emite a nota. O código IBGE do município vem do CEP.">
          {loading ? <p className="p-4 text-sm text-muted-foreground">Carregando...</p> : can(emitter ? "fiscal_establishments.update" : "fiscal_establishments.create") ? (
            <EmitterForm
              key={`${s(emitter?.id)}-${formKey}`}
              current={emitter}
              onSaved={() => {
                establishments.reload();
                setFormKey((k) => k + 1);
              }}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{emitter ? s(emitter.name) : "Sem permissão para cadastrar o emitente."}</p>
          )}
        </DetailSection>

        <div className="flex flex-col gap-4">
          <DetailSection
            title="2. Naturezas de venda"
            description="CFOP 5102 para cliente do mesmo estado; 6102 para outro estado. A emissão escolhe sozinha."
            actions={
              can("fiscal_cfops.create") && can("fiscal_operation_natures.create") && !(hasInternal && hasInterstate) ? (
                <Button size="sm" onClick={quickSetup} loading={settingUp}>
                  <Wand2 size={14} aria-hidden /> Criar automaticamente
                </Button>
              ) : undefined
            }
          >
            <ul className="divide-y divide-border-subtle text-sm">
              {saleNatures.length === 0 && <li className="px-4 py-3 text-muted-foreground">Nenhuma natureza de venda ainda.</li>}
              {saleNatures.map((n) => (
                <li key={s(n.id)} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1">{s(n.name)}</span>
                  <span className="font-mono text-xs text-muted-foreground">CFOP {cfopCode.get(s(n.default_cfop_id)) ?? "—"}</span>
                </li>
              ))}
            </ul>
          </DetailSection>

          <DetailSection title="3. NCM dos produtos" description={withoutNcm.length ? `${withoutNcm.length} produto(s) ativo(s) sem NCM.` : "Todos os produtos ativos têm NCM."}>
            {withoutNcm.length > 0 && can("products.update") ? (
              <ul className="max-h-96 divide-y divide-border-subtle overflow-y-auto">
                {withoutNcm.slice(0, 50).map((p) => (
                  <ProductNcmRow key={s(p.id)} product={p} onSaved={products.reload} />
                ))}
              </ul>
            ) : (
              <p className="px-4 py-3 text-sm text-muted-foreground">O NCM também pode ser editado no cadastro do produto.</p>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
