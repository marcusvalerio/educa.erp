"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { PurchaseReceiptRow } from "@/lib/database/schema";

export default function AgendamentosPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseReceiptRow>
      title="Agendamentos de recebimento"
      description="Recebimentos agendados e confirmados junto a fornecedores para os pedidos em aberto."
      apiPath="/api/purchase-receipts"
      searchPlaceholder="Buscar recebimento, documento ou fornecedor..."
      columns={[
        codeCol<PurchaseReceiptRow>("code", "Recebimento"),
        refCol<PurchaseReceiptRow>("supplier_id", "Fornecedor", suppliers, { mobile: "meta" }),
        dateCol<PurchaseReceiptRow>("received_at", "Recebido em", { mobile: "meta" }),
        textCol<PurchaseReceiptRow>("document_number", "Documento", { mono: true }),
        statusCol<PurchaseReceiptRow>("purchase_receipts"),
      ]}
      filters={[
        statusViews<PurchaseReceiptRow>([{ value: "conferencia", label: "Em conferência", statuses: ["draft"] }]),
        statusFilter<PurchaseReceiptRow>("purchase_receipts", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => suppliers.get(row.supplier_id) ?? undefined,
        badges: (row) => <StatusBadge entity="purchase_receipts" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
