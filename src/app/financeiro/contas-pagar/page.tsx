"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { AccountsPayableRow } from "@/lib/database/schema";

export default function ContasPagarPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<AccountsPayableRow>
      breadcrumbParent={{ label: "Financeiro", href: "/financeiro" }}
      pageLabel="Contas a pagar"
      title="Contas a pagar"
      description="Títulos a pagar a fornecedores, do lançamento à liquidação."
      apiPath="/api/accounts-payable"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhuma conta a pagar encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "supplier", label: "Fornecedor", format: (row) => suppliers.get(row.supplier_id) ?? row.supplier_id },
        { key: "due_date", label: "Vencimento", format: (row) => formatDate(row.due_date) },
        { key: "updated_amount", label: "Valor", align: "right", format: (row) => formatCurrencyBRL(row.updated_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
