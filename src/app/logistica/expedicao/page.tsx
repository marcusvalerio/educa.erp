"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { ShipmentRow } from "@/lib/database/schema";

export default function ExpedicaoPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ShipmentRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Expedição"
      title="Expedições"
      description="Expedições de pedidos de venda, da separação ao despacho para transporte."
      apiPath="/api/shipments"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma expedição encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "delivery_city", label: "Cidade de entrega" },
        { key: "status", label: "Status", status: true },
        { key: "created_at", label: "Criada em", format: (row) => formatDate(row.created_at) },
      ]}
    />
  );
}
