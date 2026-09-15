"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { PurchaseQuoteRow } from "@/lib/database/schema";

export default function CotacoesPage() {
  return (
    <ResourceListPage<PurchaseQuoteRow>
      breadcrumbParent={{ label: "Suprimentos", href: "/suprimentos" }}
      pageLabel="Cotações"
      title="Cotações de compra"
      description="Cotações enviadas a fornecedores a partir de solicitações de compra aprovadas."
      apiPath="/api/purchase-quotes"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma cotação encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "created_at", label: "Criada em", format: (row) => formatDate(row.created_at) },
        { key: "closed_at", label: "Encerrada em", format: (row) => formatDate(row.closed_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
