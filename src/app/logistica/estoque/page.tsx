"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate, formatInteger } from "@/lib/format";
import type { StockBalanceRow } from "@/lib/database/schema";

export default function EstoquePage() {
  const products = useIdNameLookup("/api/products");
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockBalanceRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Estoque"
      title="Saldo de estoque"
      description="Saldo derivado do ledger de movimentações (stock_movements) — nunca alterado diretamente por esta tela."
      apiPath="/api/stock-balances"
      searchKeys={[]}
      emptyHint="Nenhum saldo de estoque encontrado."
      detailTitle={() => "Saldo de estoque"}
      columns={[
        { key: "product", label: "Produto", format: (row) => products.get(row.product_id) ?? row.product_id },
        { key: "location", label: "Local", format: (row) => locations.get(row.location_id) ?? row.location_id },
        { key: "on_hand", label: "Em estoque", align: "right", format: (row) => formatInteger(row.on_hand) },
        { key: "reserved", label: "Reservado", align: "right", format: (row) => formatInteger(row.reserved) },
        { key: "available", label: "Disponível", align: "right", format: (row) => formatInteger(row.available) },
        { key: "updated_at", label: "Atualizado em", format: (row) => formatDate(row.updated_at) },
      ]}
    />
  );
}
