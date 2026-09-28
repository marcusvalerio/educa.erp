"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { PurchaseOrderRow } from "@/lib/database/schema";

export default function PedidosCompraPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseOrderRow>
      title="Pedidos de compra"
      description="Pedidos confirmados com fornecedores, do envio ao recebimento."
      apiPath="/api/purchase-orders"
      searchPlaceholder="Buscar pedido ou fornecedor..."
      columns={[
        codeCol<PurchaseOrderRow>("code", "Pedido"),
        refCol<PurchaseOrderRow>("supplier_id", "Fornecedor", suppliers, { mobile: "meta" }),
        dateCol<PurchaseOrderRow>("issued_at", "Emissão"),
        dateCol<PurchaseOrderRow>("expected_delivery_at", "Entrega prevista", { overdueWhen: (row) => isRowOverdue(row, "expected_delivery_at", ["approved","sent","partially_received"]), mobile: "meta" }),
        moneyCol<PurchaseOrderRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<PurchaseOrderRow>("purchase_orders"),
      ]}
      filters={[
        combineViews<PurchaseOrderRow>(
          overdueView<PurchaseOrderRow>("expected_delivery_at", ["approved","sent","partially_received"], "Entrega atrasada"),
          statusViews<PurchaseOrderRow>([{ value: "aprovacao", label: "Aguardando aprovação", statuses: ["pending_approval"] }])
        ),
        statusFilter<PurchaseOrderRow>("purchase_orders", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => suppliers.get(row.supplier_id) ?? undefined,
        badges: (row) => <StatusBadge entity="purchase_orders" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
