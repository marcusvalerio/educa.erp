"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { FormDialog, num, opt, type FieldDef } from "@/components/forms/FormDialog";
import { invalidateCache } from "@/lib/dashboard/client";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, moneyCol, enumFilter } from "@/components/data-table/columns";
import type { FinancialAccountRow } from "@/lib/database/schema";

const TYPES: [string, string][] = [["CASH", "Caixa"], ["BANK", "Banco"], ["DIGITAL", "Conta digital"], ["OTHER", "Outra"]];
const typeLabel = (t: string) => TYPES.find(([v]) => v === t)?.[1] ?? t;

const CREATE_FIELDS: FieldDef[] = [
  { key: "code", label: "Código", type: "text", required: true, placeholder: "Ex.: CX01" },
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "type", label: "Tipo", type: "select", required: true, default: "BANK", options: TYPES.map(([value, label]) => ({ value, label })) },
  { key: "openingBalance", label: "Saldo inicial (R$)", type: "money", default: "0" },
  { key: "bankName", label: "Banco", type: "text" },
  { key: "bankAgency", label: "Agência", type: "text" },
  { key: "bankAccountMasked", label: "Conta", type: "text" },
  { key: "notes", label: "Observações", type: "textarea" },
];

const EDIT_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "bankName", label: "Banco", type: "text" },
  { key: "bankAgency", label: "Agência", type: "text" },
  { key: "bankAccountMasked", label: "Conta", type: "text" },
  { key: "status", label: "Situação", type: "select", required: true, options: [{ value: "active", label: "Ativa" }, { value: "inactive", label: "Inativa" }] },
  { key: "notes", label: "Observações", type: "textarea" },
];

export default function ContasFinanceirasPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FinancialAccountRow | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/financial-accounts");
    setRefresh((n) => n + 1);
  };

  return (
    <>
      <ResourceListPage<FinancialAccountRow>
        title="Contas financeiras"
        description="Caixas e contas bancárias onde as baixas de pagamentos e recebimentos são lançadas."
        apiPath="/api/financial-accounts"
        refreshToken={refresh}
        actions={
          can("financial_accounts.create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> Nova conta
            </Button>
          ) : undefined
        }
        searchPlaceholder="Buscar conta..."
        columns={[
          codeCol<FinancialAccountRow>("code", "Código"),
          textCol<FinancialAccountRow>("name", "Nome", { mobile: "title" }),
          textCol<FinancialAccountRow>("type", "Tipo", { cell: (row) => typeLabel(row.type), mobile: "meta" }),
          moneyCol<FinancialAccountRow>("current_balance", "Saldo atual", { mobile: "meta" }),
          textCol<FinancialAccountRow>("status", "Situação", { cell: (row) => (row.status === "inactive" ? "Inativa" : "Ativa") }),
        ]}
        filters={[enumFilter<FinancialAccountRow>("type", "Tipo", TYPES)]}
        detail={{
          title: (row) => row.name,
          subtitle: (row) => `${row.code} · ${typeLabel(row.type)}`,
          actions: (row) =>
            can("financial_accounts.update") ? (
              <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
                <Pencil size={14} aria-hidden /> Editar
              </Button>
            ) : null,
        }}
        emptyDescription="Cadastre a primeira pelo botão Nova conta."
      />
      {creating && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setCreating(false)}
          title="Nova conta financeira"
          description="O saldo inicial não pode ser alterado depois; o saldo atual muda com as baixas."
          submitLabel="Cadastrar"
          fields={CREATE_FIELDS}
          path="/api/financial-accounts"
          toBody={(v) => ({
            code: String(v.code).trim(),
            name: String(v.name).trim(),
            type: v.type,
            openingBalance: num(v.openingBalance),
            bankName: opt(v.bankName),
            bankAgency: opt(v.bankAgency),
            bankAccountMasked: opt(v.bankAccountMasked),
            notes: opt(v.notes),
          })}
          onCreated={() => {
            toast.success("Conta financeira cadastrada.");
            setCreating(false);
            reload();
          }}
          size="md"
        />
      )}
      {editing && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          title={`Editar ${editing.code}`}
          description="Código, tipo e saldos não são editáveis."
          submitLabel="Salvar"
          method="PATCH"
          fields={EDIT_FIELDS}
          initial={{
            name: editing.name,
            bankName: editing.bank_name ?? "",
            bankAgency: editing.bank_agency ?? "",
            bankAccountMasked: editing.bank_account_masked ?? "",
            status: editing.status,
            notes: editing.notes ?? "",
          }}
          path={`/api/financial-accounts/${editing.id}`}
          toBody={(v) => ({
            name: String(v.name).trim(),
            bankName: String(v.bankName ?? "").trim(),
            bankAgency: String(v.bankAgency ?? "").trim(),
            bankAccountMasked: String(v.bankAccountMasked ?? "").trim(),
            status: v.status,
            notes: String(v.notes ?? "").trim(),
          })}
          invalidate={["/api/financial-accounts"]}
          onCreated={() => {
            toast.success("Conta financeira atualizada.");
            setEditing(null);
            reload();
          }}
          size="md"
        />
      )}
    </>
  );
}
