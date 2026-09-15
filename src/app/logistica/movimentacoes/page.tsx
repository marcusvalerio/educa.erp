"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDateTime, formatInteger } from "@/lib/format";
import type { StockMovementRow } from "@/lib/database/schema";

export default function MovimentacoesPage() {
  const products = useIdNameLookup("/api/products");
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockMovementRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Movimentações"
      title="Movimentações de estoque"
      description="Ledger completo de estoque (fn_post_stock_movement) — imutável, nunca editado por esta tela."
      apiPath="/api/stock-movements"
      searchKeys={["movement_type", "reference_type"]}
      searchPlaceholder="Buscar por tipo de movimento..."
      emptyHint="Nenhuma movimentação encontrada."
      detailTitle={() => "Movimentação de estoque"}
      columns={[
        { key: "movement_type", label: "Tipo", status: true },
        { key: "product", label: "Produto", format: (row) => products.get(row.product_id) ?? row.product_id },
        { key: "location", label: "Local", format: (row) => locations.get(row.location_id) ?? row.location_id },
        { key: "quantity", label: "Quantidade", align: "right", format: (row) => formatInteger(row.quantity) },
        { key: "reference_type", label: "Origem" },
        { key: "created_at", label: "Data", format: (row) => formatDateTime(row.created_at) },
      ]}
    />
  );
}
