"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { NewTitleDialog, TitleInstallments, titleCancelAction, titlePerm } from "@/components/finance/FinanceTitles";
import { invalidateCache } from "@/lib/dashboard/client";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { AccountsPayableRow } from "@/lib/database/schema";

export default function ContasPagarPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/accounts-payable");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<AccountsPayableRow>
      title="Contas a pagar"
      description="Títulos a pagar a fornecedores, do lançamento à liquidação."
      apiPath="/api/accounts-payable"
      searchPlaceholder="Buscar título, descrição ou fornecedor..."
      refreshToken={refresh}
      actions={
        can(`${titlePerm("payable")}.create`) ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo título
          </Button>
        ) : undefined
      }
      columns={[
        codeCol<AccountsPayableRow>("code", "Título"),
        textCol<AccountsPayableRow>("description", "Descrição"),
        refCol<AccountsPayableRow>("supplier_id", "Fornecedor", suppliers, { mobile: "meta" }),
        dateCol<AccountsPayableRow>("due_date", "Vencimento", { overdueWhen: (row) => isRowOverdue(row, "due_date", ["OPEN","PARTIALLY_PAID","OVERDUE"]), mobile: "meta" }),
        moneyCol<AccountsPayableRow>("updated_amount", "Valor", { mobile: "meta" }),
        statusCol<AccountsPayableRow>("accounts_payable"),
      ]}
      filters={[
        combineViews<AccountsPayableRow>(
          overdueView<AccountsPayableRow>("due_date", ["OPEN","PARTIALLY_PAID","OVERDUE"], "Vencidos"),
          statusViews<AccountsPayableRow>([{ value: "abertos", label: "Em aberto", statuses: ["OPEN", "PARTIALLY_PAID"] }])
        ),
        statusFilter<AccountsPayableRow>("accounts_payable", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => suppliers.get(row.supplier_id) ?? row.description ?? undefined,
        badges: (row) => <StatusBadge entity="accounts_payable" status={row.status} />,
        render: (row) => <TitleInstallments key={`${row.id}-${refresh}`} kind="payable" id={row.id} onChanged={reload} />,
        actions: (row) => <WorkflowActions base="/api/accounts-payable" id={row.id} status={String(row.status ?? "")} actions={[titleCancelAction("payable")]} onDone={reload} />,
      }}
      emptyDescription="Lance o primeiro título pelo botão Novo título."
    />
    <NewTitleDialog kind="payable" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
