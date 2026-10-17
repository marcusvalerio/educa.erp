"use client";

import { useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Controls";
import { Combobox } from "@/components/ui/Combobox";
import { Alert } from "@/components/ui/Feedback";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { FormDialog, num, opt, type FieldDef, type FormValues } from "@/components/forms/FormDialog";
import { SOURCES } from "@/components/forms/sources";
import { apiGet, apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import { splitInstallments } from "@/lib/finance/installments";

// Contas a pagar e a receber: lançar título (com parcelamento), pagar/receber
// parcela e cancelar. Regras (saldo, status, conta financeira, auditoria) são
// do banco, chamadas pelas rotas /api/accounts-*.

export type TitleKind = "payable" | "receivable";
type Row = Record<string, unknown>;

const CFG = {
  payable: {
    base: "/api/accounts-payable",
    installments: "/api/accounts-payable-installments",
    settlePath: "pay",
    partyKey: "supplierId",
    party: SOURCES.suppliers,
    partyLabel: "Fornecedor",
    categoryType: "EXPENSE",
    perm: "accounts_payable",
    settlePerm: "payments.create",
    settle: "Pagar",
    settled: "Pagamento registrado.",
    paidField: "paid_amount",
    dateKey: "paidAt",
    statusEntity: "accounts_payable",
    open: ["open", "partially_paid", "overdue"],
  },
  receivable: {
    base: "/api/accounts-receivable",
    installments: "/api/accounts-receivable-installments",
    settlePath: "receive",
    partyKey: "customerId",
    party: SOURCES.customers,
    partyLabel: "Cliente",
    categoryType: "INCOME",
    perm: "accounts_receivable",
    settlePerm: "receipts.create",
    settle: "Receber",
    settled: "Recebimento registrado.",
    paidField: "received_amount",
    dateKey: "receivedAt",
    statusEntity: "accounts_receivable",
    open: ["open", "partially_received", "overdue"],
  },
} as const;

const today = () => new Date().toISOString().slice(0, 10);

function titleFields(kind: TitleKind): FieldDef[] {
  const c = CFG[kind];
  return [
    { key: "party", label: c.partyLabel, type: "lookup", source: c.party, required: true },
    { key: "description", label: "Descrição", type: "text", required: true, placeholder: kind === "payable" ? "Ex.: aluguel de outubro" : "Ex.: serviço de consultoria" },
    { key: "total", label: "Valor total (R$)", type: "money", required: true },
    { key: "count", label: "Parcelas", type: "number", default: "1", help: "Divididas em partes iguais." },
    { key: "firstDue", label: "1º vencimento", type: "date", required: true, default: today() },
    { key: "every", label: "Intervalo (dias)", type: "number", default: "30" },
    { key: "categoryId", label: "Categoria", type: "lookup", source: { ...SOURCES.financialCategories, filter: (r: Row) => r.type === c.categoryType && (r.status ?? "active") === "active" } },
    { key: "costCenterId", label: "Centro de custo", type: "lookup", source: SOURCES.costCenters },
    { key: "documentReference", label: "Documento / nota", type: "text" },
    { key: "notes", label: "Observações", type: "textarea" },
  ];
}

function titleBody(kind: TitleKind) {
  return (v: FormValues) => {
    const total = num(v.total);
    return {
      [CFG[kind].partyKey]: v.party,
      description: String(v.description).trim(),
      originalAmount: total,
      installments: splitInstallments(total, num(v.count) || 1, String(v.firstDue), num(v.every) || 30),
      categoryId: opt(v.categoryId),
      costCenterId: opt(v.costCenterId),
      documentReference: opt(v.documentReference),
      notes: opt(v.notes),
    };
  };
}

export function NewTitleDialog({ kind, open, onOpenChange, onCreated }: { kind: TitleKind; open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "payable" ? "Nova conta a pagar" : "Nova conta a receber"}
      description="O título é lançado em aberto. Pague ou receba cada parcela no detalhe do título."
      submitLabel="Lançar título"
      fields={titleFields(kind)}
      path={CFG[kind].base}
      toBody={titleBody(kind)}
      validate={(v) => (num(v.total) > 0 ? null : "Informe um valor maior que zero.")}
      invalidate={[CFG[kind].installments]}
      onCreated={() => {
        toast.success("Título lançado.");
        onCreated();
      }}
    />
  );
}

const METHODS = [
  { value: "PIX", label: "PIX" },
  { value: "BANK_TRANSFER", label: "Transferência" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARD", label: "Cartão" },
  { value: "CASH", label: "Dinheiro" },
  { value: "OTHER", label: "Outro" },
];

const ACCOUNT_FIELDS: FieldDef[] = [
  { key: "code", label: "Código", type: "text", required: true, default: "CAIXA" },
  { key: "name", label: "Nome", type: "text", required: true, default: "Caixa da empresa" },
  {
    key: "type",
    label: "Tipo",
    type: "select",
    required: true,
    default: "CASH",
    options: [
      { value: "CASH", label: "Caixa" },
      { value: "BANK", label: "Banco" },
      { value: "DIGITAL", label: "Conta digital" },
      { value: "OTHER", label: "Outra" },
    ],
  },
  { key: "openingBalance", label: "Saldo inicial (R$)", type: "money", default: "0" },
  { key: "bankName", label: "Banco", type: "text" },
];

function SettleDialog({ kind, installment, onClose, onDone }: { kind: TitleKind; installment: Row; onClose: () => void; onDone: () => void }) {
  const c = CFG[kind];
  const { can } = useSession();
  const remaining = Math.max(0, num(installment.amount) - num(installment[c.paidField]));
  const [accounts, setAccounts] = useState<{ value: string; label: string }[] | null>(null);
  const [form, setForm] = useState({ accountId: "", amount: remaining.toFixed(2), method: "PIX", date: today(), reference: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newAccount, setNewAccount] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    invalidateCache(SOURCES.financialAccounts.path);
    cachedGet<Row[]>(lookupPath(SOURCES.financialAccounts.path))
      .then((rows) => {
        if (cancelled) return;
        const list = (rows ?? []).filter((r) => (r.status ?? "active") === "active").map((r) => ({ value: String(r.id), label: SOURCES.financialAccounts.label!(r) }));
        setAccounts(list);
        setForm((f) => (f.accountId || list.length !== 1 ? f : { ...f, accountId: list[0].value }));
      })
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  async function submit() {
    if (!form.accountId) return setError("Selecione a conta (caixa ou banco).");
    if (num(form.amount) <= 0) return setError("Informe um valor maior que zero.");
    setBusy(true);
    try {
      await apiSend(`${c.installments}/${installment.id}/${c.settlePath}`, "POST", {
        financialAccountId: form.accountId,
        amount: num(form.amount),
        method: form.method,
        [c.dateKey]: form.date || undefined,
        reference: opt(form.reference),
      });
      for (const p of [c.base, c.installments, "/api/financial-accounts"]) invalidateCache(p);
      toast.success(c.settled);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && !busy && onClose()}
        title={`${c.settle} parcela ${String(installment.installment_number)}`}
        description={`Vencimento ${formatDate(String(installment.due_date))} · em aberto ${formatCurrencyBRL(remaining)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={submit} loading={busy}>
              {c.settle}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {error && <Alert tone="danger">{error}</Alert>}
          {accounts && accounts.length === 0 && (
            <Alert tone="info" title="Nenhuma conta de caixa ou banco">
              Cadastre a conta de onde sai (ou entra) o dinheiro.
              {can("financial_accounts.create") && (
                <div className="mt-2">
                  <Button size="sm" variant="secondary" onClick={() => setNewAccount(true)}>
                    <Plus size={14} aria-hidden /> Nova conta
                  </Button>
                </div>
              )}
            </Alert>
          )}
          <FormField label="Conta (caixa ou banco)" required>
            <Combobox value={form.accountId} onValueChange={(v) => setForm((f) => ({ ...f, accountId: v }))} options={accounts ?? []} placeholder="Selecione" searchPlaceholder="Buscar conta..." emptyText="Nenhuma conta." />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Valor (R$)" required>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </FormField>
            <FormField label="Data">
              <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </FormField>
          </div>
          <FormField label="Forma">
            <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v || "PIX" }))} options={METHODS} />
          </FormField>
          <FormField label="Referência">
            <Input value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} maxLength={120} placeholder="Ex.: comprovante, ID do PIX" />
          </FormField>
        </div>
      </Dialog>
      <FormDialog
        open={newAccount}
        onOpenChange={setNewAccount}
        title="Nova conta financeira"
        description="Caixa, banco ou conta digital de onde sai e entra o dinheiro."
        submitLabel="Cadastrar conta"
        fields={ACCOUNT_FIELDS}
        path="/api/financial-accounts"
        toBody={(v) => ({ code: String(v.code).trim(), name: String(v.name).trim(), type: v.type, openingBalance: num(v.openingBalance), bankName: opt(v.bankName) })}
        onCreated={(created) => {
          setNewAccount(false);
          toast.success("Conta cadastrada.");
          if (created?.id) setForm((f) => ({ ...f, accountId: String(created.id) }));
          setReload((n) => n + 1);
        }}
        size="md"
      />
    </>
  );
}

/** Parcelas do título com pagar/receber; usado no detalhe. */
export function TitleInstallments({ kind, id, onChanged }: { kind: TitleKind; id: string; onChanged: () => void }) {
  const c = CFG[kind];
  const { can } = useSession();
  const [data, setData] = useState<Row | null>(null);
  const [settling, setSettling] = useState<Row | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiGet<Row>(`${c.base}/${id}`)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData({ installments: [] }));
    return () => {
      cancelled = true;
    };
  }, [c.base, id, reload]);

  const items = (data?.installments as Row[] | undefined) ?? null;
  if (!items) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando parcelas...</p>;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-semibold">Parcelas</h3>
      <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
        {items.map((i) => {
          const open = (c.open as readonly string[]).includes(String(i.status).toLowerCase());
          return (
            <li key={String(i.id)} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="w-8 text-muted-foreground tabular-nums">{String(i.installment_number)}</span>
              <span className="tabular-nums">{formatDate(String(i.due_date))}</span>
              <span className="ml-auto tabular-nums">
                {formatCurrencyBRL(num(i.amount))}
                {num(i[c.paidField]) > 0 && <span className="text-xs text-muted-foreground"> · pago {formatCurrencyBRL(num(i[c.paidField]))}</span>}
              </span>
              <StatusBadge entity={c.statusEntity} status={String(i.status)} />
              {open && can(c.settlePerm) && (
                <Button size="sm" variant="secondary" onClick={() => setSettling(i)}>
                  <Banknote size={14} aria-hidden /> {c.settle}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {settling && (
        <SettleDialog
          kind={kind}
          installment={settling}
          onClose={() => setSettling(null)}
          onDone={() => {
            setSettling(null);
            setReload((n) => n + 1);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export const titleCancelAction = (kind: TitleKind) => ({
  id: "cancel",
  label: "Cancelar título",
  path: "cancel",
  permission: `${CFG[kind].perm}.cancel`,
  statuses: ["open", "overdue"],
  confirm: "O título e as parcelas em aberto são cancelados. Não vale para títulos com pagamento registrado.",
  success: "Título cancelado.",
  tone: "danger" as const,
});

export const titlePerm = (kind: TitleKind) => CFG[kind].perm;
