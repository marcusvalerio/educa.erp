"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { AccountsReceivableRow } from "@/lib/database/schema";

export default function ContasReceberPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<AccountsReceivableRow>
      breadcrumbParent={{ label: "Financeiro", href: "/financeiro" }}
      pageLabel="Contas a receber"
      title="Contas a receber"
      description="Títulos a receber de clientes, do lançamento à liquidação."
      apiPath="/api/accounts-receivable"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhuma conta a receber encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "due_date", label: "Vencimento", format: (row) => formatDate(row.due_date) },
        { key: "updated_amount", label: "Valor", align: "right", format: (row) => formatCurrencyBRL(row.updated_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
