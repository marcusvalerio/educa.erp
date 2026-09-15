"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { PurchaseOrderRow } from "@/lib/database/schema";

export default function PedidosCompraPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseOrderRow>
      breadcrumbParent={{ label: "Suprimentos", href: "/suprimentos" }}
      pageLabel="Pedidos de compra"
      title="Pedidos de compra"
      description="Pedidos de compra confirmados com fornecedores, do envio ao recebimento."
      apiPath="/api/purchase-orders"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum pedido de compra encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "supplier", label: "Fornecedor", format: (row) => suppliers.get(row.supplier_id) ?? row.supplier_id },
        { key: "issued_at", label: "Emitido em", format: (row) => formatDate(row.issued_at) },
        { key: "expected_delivery_at", label: "Entrega prevista", format: (row) => formatDate(row.expected_delivery_at) },
        { key: "total_amount", label: "Total", align: "right", format: (row) => formatCurrencyBRL(row.total_amount) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
