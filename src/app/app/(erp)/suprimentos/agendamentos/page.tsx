"use client";

import { useState } from "react";
import { invalidateCache } from "@/lib/dashboard/client";
import { dbStatusCode } from "@/lib/status";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { RECEIPT_ACTIONS } from "@/components/forms/receipt-actions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { PurchaseReceiptRow } from "@/lib/database/schema";

export default function AgendamentosPage() {
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/purchase-receipts");
    setRefresh((n) => n + 1);
  };
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");

  return (
    <ResourceListPage<PurchaseReceiptRow>
      title="Agendamentos de recebimento"
      description="Recebimentos agendados e confirmados junto a fornecedores para os pedidos em aberto."
      apiPath="/api/purchase-receipts"
      refreshToken={refresh}
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
        actions: (row) => <WorkflowActions base="/api/purchase-receipts" id={row.id} status={dbStatusCode("purchase_receipts", String(row.status ?? ""))} actions={RECEIPT_ACTIONS} onDone={reload} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
