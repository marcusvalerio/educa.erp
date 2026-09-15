"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { StockCountRow } from "@/lib/database/schema";

export default function InventarioPage() {
  const warehouses = useIdNameLookup("/api/warehouses");

  return (
    <ResourceListPage<StockCountRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Inventário"
      title="Contagens de inventário"
      description="Contagens físicas de estoque por armazém, da abertura ao fechamento com ajuste."
      apiPath="/api/stock-counts"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhuma contagem de inventário encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "warehouse", label: "Armazém", format: (row) => warehouses.get(row.warehouse_id) ?? row.warehouse_id },
        { key: "closed_at", label: "Fechada em", format: (row) => formatDate(row.closed_at) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
