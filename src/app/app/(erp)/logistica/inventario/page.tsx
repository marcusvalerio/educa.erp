"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateTimeCol, statusCol, refCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockCountRow } from "@/lib/database/schema";

export default function InventarioPage() {
  const warehouses = useIdNameLookup("/api/warehouses");

  return (
    <ResourceListPage<StockCountRow>
      title="Contagens de inventário"
      description="Contagens físicas por armazém, da abertura ao fechamento com ajuste."
      apiPath="/api/stock-counts"
      searchPlaceholder="Buscar contagem ou armazém..."
      columns={[
        codeCol<StockCountRow>("code", "Contagem"),
        refCol<StockCountRow>("warehouse_id", "Armazém", warehouses, { mobile: "meta" }),
        dateTimeCol<StockCountRow>("closed_at", "Fechada em"),
        statusCol<StockCountRow>("stock_counts"),
      ]}
      filters={[statusFilter<StockCountRow>("stock_counts", "status", { server: true })]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="stock_counts" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
