"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { MaterialRequestRow } from "@/lib/database/schema";

// Fase 19 — Almoxarifado Operacional é explicitamente diferente de
// Estoque de produtos (material_requests, 0013): requisição interna de
// material entre locais, nunca o saldo de produto à venda.
export default function AlmoxarifadoPage() {
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<MaterialRequestRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Almoxarifado"
      title="Almoxarifado operacional"
      description="Requisições internas de material entre locais — diferente do estoque de produtos para venda."
      apiPath="/api/material-requests"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma requisição de material encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "from_location", label: "De", format: (row) => locations.get(row.from_location_id) ?? row.from_location_id },
        { key: "to_location", label: "Para", format: (row) => locations.get(row.to_location_id) ?? row.to_location_id },
        { key: "delivered_at", label: "Entregue em", format: (row) => formatDate(row.delivered_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
