"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { FiscalDocumentRow } from "@/lib/database/schema";

export default function NotasFiscaisPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<FiscalDocumentRow>
      breadcrumbParent={{ label: "Fiscal", href: "/fiscal" }}
      pageLabel="Notas fiscais"
      title="Documentos fiscais"
      description="Documentos fiscais emitidos pela empresa (NF-e, NFC-e, NFS-e, CT-e, MDF-e), do rascunho à autorização."
      apiPath="/api/fiscal-documents"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum documento fiscal encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "type", label: "Tipo" },
        { key: "number", label: "Número", align: "right" },
        { key: "customer", label: "Cliente", format: (row) => (row.customer_id ? customers.get(row.customer_id) ?? row.customer_id : "—") },
        { key: "issue_date", label: "Emissão", format: (row) => formatDate(row.issue_date) },
        { key: "total_amount", label: "Total", align: "right", format: (row) => formatCurrencyBRL(row.total_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
