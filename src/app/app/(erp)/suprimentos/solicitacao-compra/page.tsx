"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PurchaseRequestRow } from "@/lib/database/schema";

export default function SolicitacaoCompraPage() {

  return (
    <ResourceListPage<PurchaseRequestRow>
      title="Solicitações de compra"
      description="Necessidades internas de compra, da abertura à aprovação para cotação."
      apiPath="/api/purchase-requests"
      searchPlaceholder="Buscar solicitação ou setor..."
      columns={[
        codeCol<PurchaseRequestRow>("code", "Solicitação"),
        textCol<PurchaseRequestRow>("department", "Setor", { mobile: "meta" }),
        statusCol<PurchaseRequestRow>(undefined, "priority", "Prioridade", { width: "7rem", mobile: "meta" }),
        dateCol<PurchaseRequestRow>("requested_at", "Solicitada em"),
        dateCol<PurchaseRequestRow>("needed_by", "Necessária até", { overdueWhen: (row) => isRowOverdue(row, "needed_by", ["requested", "approved", "partially_ordered"]) }),
        statusCol<PurchaseRequestRow>("purchase_requests"),
      ]}
      filters={[
        combineViews<PurchaseRequestRow>(
          statusViews<PurchaseRequestRow>([{ value: "aprovacao", label: "Aguardando aprovação", statuses: ["requested"] }]),
          overdueView<PurchaseRequestRow>("needed_by", ["requested", "approved", "partially_ordered"], "Prazo vencido")
        ),
        statusFilter<PurchaseRequestRow>("purchase_requests", "status", { server: true }),
        enumFilter<PurchaseRequestRow>("priority", "Prioridade", [["low", "Baixa"], ["medium", "Média"], ["high", "Alta"], ["urgent", "Urgente"]]),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.department ?? undefined,
        badges: (row) => <StatusBadge entity="purchase_requests" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
