"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { AccountsPayableRow } from "@/lib/database/schema";

export default function ContasPagarPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<AccountsPayableRow>
      title="Contas a pagar"
      description="Títulos a pagar a fornecedores, do lançamento à liquidação."
      apiPath="/api/accounts-payable"
      searchPlaceholder="Buscar título, descrição ou fornecedor..."
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
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
