"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { dateTimeCol, numberCol, refCol } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockBalanceRow } from "@/lib/database/schema";

export default function EstoquePage() {
  const products = useIdNameLookup("/api/products");
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockBalanceRow>
      title="Saldo de estoque"
      description="Saldo derivado do ledger de movimentações — nunca alterado diretamente por esta tela."
      apiPath="/api/stock-balances"
      searchPlaceholder="Buscar produto ou local..."
      columns={[
        refCol<StockBalanceRow>("product_id", "Produto", products, { mobile: "title" }),
        refCol<StockBalanceRow>("location_id", "Local", locations, { mobile: "meta" }),
        numberCol<StockBalanceRow>("on_hand", "Em estoque", { mobile: "meta" }),
        numberCol<StockBalanceRow>("reserved", "Reservado"),
        numberCol<StockBalanceRow>("available", "Disponível", {
          mobile: "meta",
          cell: (row) => <span className={Number(row.available) <= 0 ? "font-medium text-danger-fg" : undefined}>{Number(row.available ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>,
        }),
        dateTimeCol<StockBalanceRow>("updated_at", "Atualizado em", { defaultHidden: true }),
      ]}
      filters={[
        {
          id: "view",
          label: "Visão",
          kind: "view",
          options: [
            { value: "sem-disponivel", label: "Sem disponibilidade" },
            { value: "com-reserva", label: "Com reserva" },
          ],
          predicate: (row, value) => (value === "sem-disponivel" ? Number(row.available) <= 0 : value === "com-reserva" ? Number(row.reserved) > 0 : true),
        },
      ]}
      detail={{
        title: (row) => products.get(row.product_id) ?? "Saldo de estoque",
        subtitle: (row) => locations.get(row.location_id) ?? undefined,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
