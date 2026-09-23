"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { SalesOrderRow } from "@/lib/database/schema";

export default function PedidosVendaPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<SalesOrderRow>
      title="Pedidos de venda"
      description="Pedidos confirmados com clientes — da aprovação à expedição e conclusão."
      apiPath="/api/sales-orders"
      searchPlaceholder="Buscar pedido ou cliente..."
      columns={[
        codeCol<SalesOrderRow>("code", "Pedido"),
        refCol<SalesOrderRow>("customer_id", "Cliente", customers, { mobile: "meta" }),
        dateCol<SalesOrderRow>("order_date", "Data"),
        dateCol<SalesOrderRow>("expected_delivery_at", "Entrega prevista", { overdueWhen: (row) => isRowOverdue(row, "expected_delivery_at", ["pending_approval","approved","reservation_pending","reserved","picking","ready_to_ship","partially_shipped"]), mobile: "meta" }),
        textCol<SalesOrderRow>("delivery_city", "Cidade", { defaultHidden: true }),
        moneyCol<SalesOrderRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<SalesOrderRow>("sales_orders"),
      ]}
      filters={[
        combineViews<SalesOrderRow>(
          overdueView<SalesOrderRow>("expected_delivery_at", ["pending_approval","approved","reservation_pending","reserved","picking","ready_to_ship","partially_shipped"], "Entrega atrasada"),
          statusViews<SalesOrderRow>([
            { value: "aprovacao", label: "Aguardando aprovação", statuses: ["pending_approval"] },
            { value: "em-andamento", label: "Em andamento", statuses: ["approved", "reservation_pending", "reserved", "picking", "ready_to_ship", "partially_shipped", "shipped"] },
          ])
        ),
        statusFilter<SalesOrderRow>("sales_orders", "status", { server: true }),
      ]}
      rowHref={(row) => `/comercial/pedidos-venda/${row.id}`}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
