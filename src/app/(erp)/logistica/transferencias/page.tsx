"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateTimeCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockTransferRow } from "@/lib/database/schema";

export default function TransferenciasPage() {
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockTransferRow>
      title="Transferências entre locais"
      description="Transferências de estoque entre locais, do envio à confirmação de recebimento."
      apiPath="/api/stock-transfers"
      searchPlaceholder="Buscar transferência ou local..."
      columns={[
        codeCol<StockTransferRow>("code", "Transferência"),
        refCol<StockTransferRow>("from_location_id", "Origem", locations, { mobile: "meta" }),
        refCol<StockTransferRow>("to_location_id", "Destino", locations, { mobile: "meta" }),
        dateTimeCol<StockTransferRow>("shipped_at", "Envio"),
        dateTimeCol<StockTransferRow>("received_at", "Recebimento", { defaultHidden: true }),
        statusCol<StockTransferRow>("stock_transfers"),
      ]}
      filters={[
        statusViews<StockTransferRow>([{ value: "transito", label: "Em trânsito", statuses: ["in_transit"] }]),
        statusFilter<StockTransferRow>("stock_transfers", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="stock_transfers" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
