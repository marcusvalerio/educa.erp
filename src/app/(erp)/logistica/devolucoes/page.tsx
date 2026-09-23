"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateTimeCol, numberCol, refCol, enumFilter } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockMovementRow } from "@/lib/database/schema";

export default function DevolucoesPage() {
  const products = useIdNameLookup("/api/products");

  return (
    <ResourceListPage<StockMovementRow>
      title="Devoluções"
      description="Movimentações de devolução (RETURN_IN/RETURN_OUT) do ledger de estoque."
      apiPath="/api/stock-movements"
      baseFilter={(row) => row.movement_type === "RETURN_IN" || row.movement_type === "RETURN_OUT"}
      searchPlaceholder="Buscar produto ou origem..."
      columns={[
        dateTimeCol<StockMovementRow>("created_at", "Data", { mobile: "meta" }),
        textCol<StockMovementRow>("movement_type", "Tipo", { cell: (row) => (row.movement_type === "RETURN_IN" ? "Devolução de cliente" : "Devolução a fornecedor"), mobile: "title" }),
        refCol<StockMovementRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<StockMovementRow>("quantity", "Quantidade", { mobile: "meta" }),
        textCol<StockMovementRow>("reference_type", "Origem"),
      ]}
      filters={[enumFilter<StockMovementRow>("movement_type", "Tipo", [["RETURN_IN", "Devolução de cliente"], ["RETURN_OUT", "Devolução a fornecedor"]])]}
      detail={{
        title: () => "Devolução",
        subtitle: (row) => products.get(row.product_id) ?? undefined,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
