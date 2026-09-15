"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { StockTransferRow } from "@/lib/database/schema";

export default function TransferenciasPage() {
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockTransferRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Transferências"
      title="Transferências entre locais"
      description="Transferências de estoque entre locais, do envio à confirmação de recebimento."
      apiPath="/api/stock-transfers"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma transferência encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "from_location", label: "Origem", format: (row) => locations.get(row.from_location_id) ?? row.from_location_id },
        { key: "to_location", label: "Destino", format: (row) => locations.get(row.to_location_id) ?? row.to_location_id },
        { key: "shipped_at", label: "Enviada em", format: (row) => formatDate(row.shipped_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
