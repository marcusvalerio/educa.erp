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
import type { AccountsReceivableRow } from "@/lib/database/schema";

export default function ContasReceberPage() {
  const customers = useIdNameLookup("/api/customers");
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/accounts-receivable");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<AccountsReceivableRow>
      title="Contas a receber"
      description="Títulos a receber de clientes, do lançamento à liquidação."
      apiPath="/api/accounts-receivable"
      searchPlaceholder="Buscar título, descrição ou cliente..."
      refreshToken={refresh}
      actions={
        can(`${titlePerm("receivable")}.create`) ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo título
          </Button>
        ) : undefined
      }
      columns={[
        codeCol<AccountsReceivableRow>("code", "Título"),
        textCol<AccountsReceivableRow>("description", "Descrição"),
        refCol<AccountsReceivableRow>("customer_id", "Cliente", customers, { mobile: "meta" }),
        dateCol<AccountsReceivableRow>("due_date", "Vencimento", { overdueWhen: (row) => isRowOverdue(row, "due_date", ["OPEN","PARTIALLY_RECEIVED","OVERDUE"]), mobile: "meta" }),
        moneyCol<AccountsReceivableRow>("updated_amount", "Valor", { mobile: "meta" }),
        statusCol<AccountsReceivableRow>("accounts_receivable"),
      ]}
      filters={[
        combineViews<AccountsReceivableRow>(
          overdueView<AccountsReceivableRow>("due_date", ["OPEN","PARTIALLY_RECEIVED","OVERDUE"], "Vencidos"),
          statusViews<AccountsReceivableRow>([{ value: "abertos", label: "Em aberto", statuses: ["OPEN", "PARTIALLY_RECEIVED"] }])
        ),
        statusFilter<AccountsReceivableRow>("accounts_receivable", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => customers.get(row.customer_id) ?? row.description ?? undefined,
        badges: (row) => <StatusBadge entity="accounts_receivable" status={row.status} />,
        render: (row) => <TitleInstallments key={`${row.id}-${refresh}`} kind="receivable" id={row.id} onChanged={reload} />,
        actions: (row) => <WorkflowActions base="/api/accounts-receivable" id={row.id} status={String(row.status ?? "")} actions={[titleCancelAction("receivable")]} onDone={reload} />,
      }}
      emptyDescription="Lance o primeiro título pelo botão Novo título."
    />
    <NewTitleDialog kind="receivable" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
