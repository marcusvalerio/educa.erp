"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { SalesQuoteRow } from "@/lib/database/schema";

export default function OrcamentosPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<SalesQuoteRow>
      title="Orçamentos"
      description="Propostas de venda enviadas a clientes, do rascunho à aprovação ou expiração."
      apiPath="/api/sales-quotes"
      searchPlaceholder="Buscar orçamento ou cliente..."
      columns={[
        codeCol<SalesQuoteRow>("code", "Orçamento"),
        refCol<SalesQuoteRow>("customer_id", "Cliente", customers, { mobile: "meta" }),
        dateCol<SalesQuoteRow>("issued_at", "Emissão"),
        dateCol<SalesQuoteRow>("valid_until", "Validade", { overdueWhen: (row) => isRowOverdue(row, "valid_until", ["draft", "sent"]), mobile: "meta" }),
        moneyCol<SalesQuoteRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<SalesQuoteRow>("sales_quotes"),
      ]}
      filters={[
        combineViews<SalesQuoteRow>(
          overdueView<SalesQuoteRow>("valid_until", ["draft", "sent"], "Validade vencida"),
          statusViews<SalesQuoteRow>([{ value: "enviados", label: "Aguardando cliente", statuses: ["sent"] }])
        ),
        statusFilter<SalesQuoteRow>("sales_quotes", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => customers.get(row.customer_id) ?? undefined,
        badges: (row) => <StatusBadge entity="sales_quotes" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
