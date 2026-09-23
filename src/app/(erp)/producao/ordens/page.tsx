"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, numberCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProductionOrderRow } from "@/lib/database/schema";

export default function OrdensProducaoPage() {
  const products = useIdNameLookup("/api/products");

  return (
    <ResourceListPage<ProductionOrderRow>
      title="Ordens de produção"
      description="Ordens de produção a partir da estrutura (BOM), do planejamento à conclusão."
      apiPath="/api/production-orders"
      searchPlaceholder="Buscar OP ou produto..."
      columns={[
        codeCol<ProductionOrderRow>("code", "OP"),
        refCol<ProductionOrderRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<ProductionOrderRow>("planned_quantity", "Planejado"),
        numberCol<ProductionOrderRow>("produced_quantity", "Produzido", { mobile: "meta" }),
        numberCol<ProductionOrderRow>("rejected_quantity", "Refugo", { defaultHidden: true }),
        statusCol<ProductionOrderRow>(undefined, "priority", "Prioridade", { width: "7rem" }),
        dateCol<ProductionOrderRow>("planned_date", "Data planejada", { overdueWhen: (row) => isRowOverdue(row, "planned_date", ["planned","released","materials_reserved","in_progress","on_hold"]) }),
        statusCol<ProductionOrderRow>("production_orders"),
      ]}
      filters={[
        combineViews<ProductionOrderRow>(
          overdueView<ProductionOrderRow>("planned_date", ["planned","released","materials_reserved","in_progress","on_hold"], "Atrasadas"),
          statusViews<ProductionOrderRow>([{ value: "producao", label: "Em produção", statuses: ["in_progress"] }, { value: "espera", label: "Em espera", statuses: ["on_hold"] }])
        ),
        statusFilter<ProductionOrderRow>("production_orders", "status", { server: true }),
        enumFilter<ProductionOrderRow>("priority", "Prioridade", [["low", "Baixa"], ["medium", "Média"], ["high", "Alta"], ["urgent", "Urgente"]]),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => products.get(row.product_id) ?? undefined,
        badges: (row) => <StatusBadge entity="production_orders" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
