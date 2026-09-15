"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { PurchaseReceiptRow } from "@/lib/database/schema";

export default function AgendamentosPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseReceiptRow>
      breadcrumbParent={{ label: "Suprimentos", href: "/suprimentos" }}
      pageLabel="Agendamentos"
      title="Agendamentos de recebimento"
      description="Recebimentos agendados/confirmados junto a fornecedores para os pedidos de compra em aberto."
      apiPath="/api/purchase-receipts"
      searchKeys={["code"]}
      searchPlaceholder="Buscar por código..."
      emptyHint="Nenhum agendamento de recebimento encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "supplier", label: "Fornecedor", format: (row) => suppliers.get(row.supplier_id) ?? row.supplier_id },
        { key: "received_at", label: "Recebimento", format: (row) => formatDate(row.received_at) },
        { key: "document_number", label: "Documento" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
