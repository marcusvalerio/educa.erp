"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { ShipmentRow } from "@/lib/database/schema";

export default function TransportesPage() {
  const carriers = useIdNameLookup("/api/carriers", "legal_name");

  return (
    <ResourceListPage<ShipmentRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Transportes"
      title="Transportes"
      description="Expedições sob a ótica de transporte — transportadora, veículo e status de despacho."
      apiPath="/api/shipments"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum transporte encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "carrier", label: "Transportadora", format: (row) => (row.carrier_id ? carriers.get(row.carrier_id) ?? row.carrier_id : "—") },
        { key: "delivery_city", label: "Cidade de entrega" },
        { key: "status", label: "Status", status: true },
        { key: "created_at", label: "Criada em", format: (row) => formatDate(row.created_at) },
      ]}
    />
  );
}
