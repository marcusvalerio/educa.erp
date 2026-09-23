"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { AccountsReceivableRow } from "@/lib/database/schema";

export default function ContasReceberPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<AccountsReceivableRow>
      title="Contas a receber"
      description="Títulos a receber de clientes, do lançamento à liquidação."
      apiPath="/api/accounts-receivable"
      searchPlaceholder="Buscar título, descrição ou cliente..."
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
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
