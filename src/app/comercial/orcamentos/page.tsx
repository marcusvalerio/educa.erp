"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { SalesQuoteRow } from "@/lib/database/schema";

export default function OrcamentosPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<SalesQuoteRow>
      breadcrumbParent={{ label: "Comercial", href: "/comercial" }}
      pageLabel="Orçamentos"
      title="Orçamentos"
      description="Orçamentos de venda emitidos para clientes, do rascunho à aprovação."
      apiPath="/api/sales-quotes"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum orçamento encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "issued_at", label: "Emitido em", format: (row) => formatDate(row.issued_at) },
        { key: "valid_until", label: "Válido até", format: (row) => formatDate(row.valid_until) },
        { key: "total_amount", label: "Total", align: "right", format: (row) => formatCurrencyBRL(row.total_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
