"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { SalesOrderRow } from "@/lib/database/schema";

export default function PedidosVendaPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<SalesOrderRow>
      breadcrumbParent={{ label: "Comercial", href: "/comercial" }}
      pageLabel="Pedidos de venda"
      title="Pedidos de venda"
      description="Pedidos de venda confirmados com clientes, do faturamento à expedição."
      apiPath="/api/sales-orders"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum pedido de venda encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "order_date", label: "Data do pedido", format: (row) => formatDate(row.order_date) },
        { key: "expected_delivery_at", label: "Entrega prevista", format: (row) => formatDate(row.expected_delivery_at) },
        { key: "total_amount", label: "Total", align: "right", format: (row) => formatCurrencyBRL(row.total_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
