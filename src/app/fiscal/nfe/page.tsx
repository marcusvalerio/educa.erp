"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { FiscalDocumentRow } from "@/lib/database/schema";

export default function NfePage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<FiscalDocumentRow>
      breadcrumbParent={{ label: "Fiscal", href: "/fiscal" }}
      pageLabel="NF-e"
      title="Notas fiscais eletrônicas (NF-e)"
      description="Mesma base de documentos fiscais, filtrada para o tipo NF-e."
      apiPath="/api/fiscal-documents?type=NFE"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma NF-e encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "number", label: "Número", align: "right" },
        { key: "customer", label: "Cliente", format: (row) => (row.customer_id ? customers.get(row.customer_id) ?? row.customer_id : "—") },
        { key: "issue_date", label: "Emissão", format: (row) => formatDate(row.issue_date) },
        { key: "total_amount", label: "Total", align: "right", format: (row) => formatCurrencyBRL(row.total_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
