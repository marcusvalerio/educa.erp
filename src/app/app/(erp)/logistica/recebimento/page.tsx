"use client";

import { useState } from "react";
import { PackagePlus } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { ReceiveOrderDialog } from "@/components/forms/ReceiveOrderDialog";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { RECEIPT_ACTIONS } from "@/components/forms/receipt-actions";
import { invalidateCache } from "@/lib/dashboard/client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { dbStatusCode } from "@/lib/status";
import type { PurchaseReceiptRow } from "@/lib/database/schema";



export default function RecebimentoPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/purchase-receipts");
    setRefresh((n) => n + 1);
  };

  return (
    <>
      <ResourceListPage<PurchaseReceiptRow>
        title="Recebimento de mercadorias"
        description="Conferência dos recebimentos de compra — único caminho que confirma entrada de estoque vinda de compra."
        apiPath="/api/purchase-receipts"
        searchPlaceholder="Buscar recebimento, documento ou fornecedor..."
        refreshToken={refresh}
        actions={
          can("purchase_receipts.create") ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <PackagePlus size={14} aria-hidden /> Receber mercadoria
            </Button>
          ) : undefined
        }
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
          actions: (row) => (
            <WorkflowActions base="/api/purchase-receipts" id={row.id} status={dbStatusCode("purchase_receipts", String(row.status ?? ""))} actions={RECEIPT_ACTIONS} onDone={reload} />
          ),
        }}
        emptyDescription="Receba a mercadoria de um pedido de compra pelo botão Receber mercadoria."
      />
      <ReceiveOrderDialog
        open={open}
        onOpenChange={setOpen}
        onDone={() => {
          setOpen(false);
          toast.success("Recebimento registrado.");
          reload();
        }}
      />
    </>
  );
}
