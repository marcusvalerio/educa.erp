"use client";

import { useState } from "react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { invalidateCache } from "@/lib/dashboard/client";
import { IssueNfeButton, NfeOutputLinks } from "@/components/fiscal/NfeActions";
import type { FiscalDocumentRow } from "@/lib/database/schema";

export default function NfePage() {
  const customers = useIdNameLookup("/api/customers");
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/fiscal-documents");
    setRefresh((n) => n + 1);
  };

  return (
    <ResourceListPage<FiscalDocumentRow>
      title="Notas fiscais eletrônicas (NF-e)"
      description="Documentos fiscais do tipo NF-e."
      apiPath="/api/fiscal-documents?type=NFE"
      refreshToken={refresh}
      searchPlaceholder="Buscar NF-e, número ou cliente..."
      columns={[
        codeCol<FiscalDocumentRow>("code", "Documento"),
        
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
        actions: (row) => {
          const st = String(row.status ?? "").toUpperCase();
          if (st === "AUTHORIZED") return <div className="flex flex-wrap gap-2"><NfeOutputLinks documentId={row.id} /></div>;
          if (row.type === "NFE" && row.direction === "SAIDA" && ["DRAFT", "CALCULATED", "READY"].includes(st)) return <IssueNfeButton documentId={row.id} onDone={reload} />;
          return null;
        },
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
