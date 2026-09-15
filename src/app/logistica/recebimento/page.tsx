"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { PurchaseReceiptRow } from "@/lib/database/schema";

export default function RecebimentoPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseReceiptRow>
      breadcrumbParent={{ label: "Logística", href: "/logistica" }}
      pageLabel="Recebimento"
      title="Recebimento de mercadorias"
      description="Conferência de recebimentos de pedidos de compra — o único caminho que confirma entrada de estoque a partir de uma compra."
      apiPath="/api/purchase-receipts"
      searchKeys={["code", "document_number"]}
      searchPlaceholder="Buscar por código ou documento..."
      emptyHint="Nenhum recebimento encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "supplier", label: "Fornecedor", format: (row) => suppliers.get(row.supplier_id) ?? row.supplier_id },
        { key: "received_at", label: "Recebido em", format: (row) => formatDate(row.received_at) },
        { key: "document_number", label: "Documento" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
