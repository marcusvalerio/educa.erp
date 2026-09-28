"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateTimeCol, numberCol, refCol, enumFilter } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockMovementRow } from "@/lib/database/schema";

const MOVEMENT_LABEL: Record<string, string> = Object.fromEntries([["RECEIPT", "Entrada"], ["ISSUE", "Saída"], ["TRANSFER_IN", "Transferência (entrada)"], ["TRANSFER_OUT", "Transferência (saída)"], ["ADJUSTMENT_IN", "Ajuste (+)"], ["ADJUSTMENT_OUT", "Ajuste (−)"], ["RETURN_IN", "Devolução (entrada)"], ["RETURN_OUT", "Devolução (saída)"]]);

export default function MovimentacoesPage() {
  const products = useIdNameLookup("/api/products");
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<StockMovementRow>
      title="Movimentações de estoque"
      description="Ledger de estoque — imutável, nunca editado por esta tela."
      apiPath="/api/stock-movements"
      searchPlaceholder="Buscar produto, local ou origem..."
      columns={[
        dateTimeCol<StockMovementRow>("created_at", "Data", { mobile: "meta" }),
        textCol<StockMovementRow>("movement_type", "Tipo", { cell: (row) => MOVEMENT_LABEL[row.movement_type] ?? row.movement_type, value: (row) => MOVEMENT_LABEL[row.movement_type] ?? row.movement_type, mobile: "title" }),
        refCol<StockMovementRow>("product_id", "Produto", products, { mobile: "meta" }),
        refCol<StockMovementRow>("location_id", "Local", locations),
        numberCol<StockMovementRow>("quantity", "Quantidade", { mobile: "meta" }),
        textCol<StockMovementRow>("reference_type", "Origem"),
      ]}
      filters={[enumFilter<StockMovementRow>("movement_type", "Tipo", [["RECEIPT", "Entrada"], ["ISSUE", "Saída"], ["TRANSFER_IN", "Transferência (entrada)"], ["TRANSFER_OUT", "Transferência (saída)"], ["ADJUSTMENT_IN", "Ajuste (+)"], ["ADJUSTMENT_OUT", "Ajuste (−)"], ["RETURN_IN", "Devolução (entrada)"], ["RETURN_OUT", "Devolução (saída)"]])]}
      detail={{
        title: (row) => MOVEMENT_LABEL[row.movement_type] ?? "Movimentação",
        subtitle: (row) => products.get(row.product_id) ?? undefined,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
