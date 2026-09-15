"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { PurchaseRequestRow } from "@/lib/database/schema";

export default function SolicitacaoCompraPage() {
  return (
    <ResourceListPage<PurchaseRequestRow>
      breadcrumbParent={{ label: "Suprimentos", href: "/suprimentos" }}
      pageLabel="Solicitação de compra"
      title="Solicitações de compra"
      description="Solicitações internas de compra, da abertura à aprovação para cotação."
      apiPath="/api/purchase-requests"
      searchKeys={["code", "department", "justification"]}
      searchPlaceholder="Buscar por código, departamento..."
      emptyHint="Nenhuma solicitação de compra encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "department", label: "Departamento" },
        { key: "priority", label: "Prioridade" },
        { key: "requested_at", label: "Solicitado em", format: (row) => formatDate(row.requested_at) },
        { key: "needed_by", label: "Necessário até", format: (row) => formatDate(row.needed_by) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
