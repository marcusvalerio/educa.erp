"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateTimeCol, numberCol, refCol, enumFilter } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockMovementRow } from "@/lib/database/schema";
import { MOVEMENT_TYPE_OPTIONS, movementTypeLabel, referenceTypeLabel } from "@/lib/stock-labels";


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
        textCol<StockMovementRow>("movement_type", "Tipo", { cell: (row) => movementTypeLabel(row.movement_type), value: (row) => movementTypeLabel(row.movement_type), mobile: "title" }),
        refCol<StockMovementRow>("product_id", "Produto", products, { mobile: "meta" }),
        refCol<StockMovementRow>("location_id", "Local", locations),
        numberCol<StockMovementRow>("quantity", "Quantidade", { mobile: "meta" }),
        textCol<StockMovementRow>("reference_type", "Origem", { cell: (row) => referenceTypeLabel(row.reference_type), value: (row) => referenceTypeLabel(row.reference_type) }),
      ]}
      filters={[enumFilter<StockMovementRow>("movement_type", "Tipo", MOVEMENT_TYPE_OPTIONS)]}
      detail={{
        title: (row) => movementTypeLabel(row.movement_type),
        subtitle: (row) => products.get(row.product_id) ?? undefined,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
