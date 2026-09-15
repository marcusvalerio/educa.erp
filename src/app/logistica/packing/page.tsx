"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { ShipmentRow } from "@/lib/database/schema";

export default function PackingPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ShipmentRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Packing"
      title="Embalagem (packing)"
      description="Mesma expedição (shipments) sob a etapa de embalagem — volumes e pesagem ficam nos itens da expedição."
      apiPath="/api/shipments"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma expedição em embalagem encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "status", label: "Status", status: true },
        { key: "created_at", label: "Criada em", format: (row) => formatDate(row.created_at) },
      ]}
    />
  );
}
