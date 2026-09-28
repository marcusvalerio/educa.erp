"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, statusCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PurchaseQuoteRow } from "@/lib/database/schema";

export default function CotacoesPage() {

  return (
    <ResourceListPage<PurchaseQuoteRow>
      title="Cotações de compra"
      description="Cotações enviadas a fornecedores a partir de solicitações aprovadas."
      apiPath="/api/purchase-quotes"
      searchPlaceholder="Buscar cotação..."
      columns={[
        codeCol<PurchaseQuoteRow>("code", "Cotação"),
        dateCol<PurchaseQuoteRow>("created_at", "Criada em", { mobile: "meta" }),
        dateCol<PurchaseQuoteRow>("closed_at", "Encerrada em"),
        statusCol<PurchaseQuoteRow>("purchase_quotes"),
      ]}
      filters={[statusFilter<PurchaseQuoteRow>("purchase_quotes", "status", { server: true })]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="purchase_quotes" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
