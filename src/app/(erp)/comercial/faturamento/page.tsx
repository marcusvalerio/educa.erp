"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { FiscalDocumentRow } from "@/lib/database/schema";

export default function FaturamentoPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<FiscalDocumentRow>
      title="Faturamento"
      description="Documentos fiscais emitidos a partir das vendas (mesma base do módulo Fiscal)."
      apiPath="/api/fiscal-documents"
      searchPlaceholder="Buscar documento, número ou cliente..."
      columns={[
        codeCol<FiscalDocumentRow>("code", "Documento"),
        textCol<FiscalDocumentRow>("type", "Tipo", { width: "5rem" }),
        textCol<FiscalDocumentRow>("number", "Número", { align: "right", mono: true }),
        refCol<FiscalDocumentRow>("customer_id", "Cliente", customers, { mobile: "meta" }),
        dateCol<FiscalDocumentRow>("issue_date", "Emissão", { mobile: "meta" }),
        moneyCol<FiscalDocumentRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<FiscalDocumentRow>("fiscal_documents"),
      ]}
      filters={[
        statusViews<FiscalDocumentRow>([
          { value: "pendentes", label: "Pendentes de autorização", statuses: ["DRAFT", "CALCULATED", "READY", "AUTHORIZING", "CONTINGENCY"] },
          { value: "rejeitadas", label: "Rejeitadas / denegadas", statuses: ["REJECTED", "DENIED"] },
        ]),
        statusFilter<FiscalDocumentRow>("fiscal_documents", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.customer_id ? customers.get(row.customer_id) : undefined,
        badges: (row) => <StatusBadge entity="fiscal_documents" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
