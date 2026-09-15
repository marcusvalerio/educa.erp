"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDateTime, formatInteger } from "@/lib/format";
import type { StockMovementRow } from "@/lib/database/schema";

export default function DevolucoesPage() {
  const products = useIdNameLookup("/api/products");

  return (
    <ResourceListPage<StockMovementRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Devoluções"
      title="Devoluções"
      description="Mesmo ledger de estoque (stock_movements) — devoluções aparecem como RETURN_IN/RETURN_OUT; use a busca para filtrar por tipo."
      apiPath="/api/stock-movements"
      searchKeys={["movement_type", "reference_type"]}
      searchPlaceholder="Buscar por RETURN_IN, RETURN_OUT..."
      emptyHint="Nenhuma movimentação de devolução encontrada."
      detailTitle={() => "Movimentação de devolução"}
      columns={[
        { key: "movement_type", label: "Tipo", status: true },
        { key: "product", label: "Produto", format: (row) => products.get(row.product_id) ?? row.product_id },
        { key: "quantity", label: "Quantidade", align: "right", format: (row) => formatInteger(row.quantity) },
        { key: "reference_type", label: "Origem" },
        { key: "created_at", label: "Data", format: (row) => formatDateTime(row.created_at) },
      ]}
    />
  );
}
