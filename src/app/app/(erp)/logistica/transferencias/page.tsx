"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { dbStatusCode } from "@/lib/status";

const ACTIONS: WorkflowAction[] = [
  { id: "ship", label: "Despachar", path: "ship", permission: "stock.transfer", statuses: ["draft"], confirm: "Os produtos saem do local de origem e ficam em trânsito.", success: "Transferência despachada." },
  { id: "receive", label: "Receber no destino", path: "receive", permission: "stock.transfer", statuses: ["in_transit"], confirm: "Os produtos entram no local de destino.", success: "Transferência recebida." },
  { id: "cancel", label: "Cancelar", path: "cancel", permission: "stock.transfer", statuses: ["draft"], confirm: "A transferência é cancelada.", success: "Transferência cancelada.", tone: "danger" },
];
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateTimeCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockTransferRow } from "@/lib/database/schema";

export default function TransferenciasPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/stock-transfers");
    setRefresh((n) => n + 1);
  };
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <>
    <ResourceListPage<StockTransferRow>
      title="Transferências entre locais"
      description="Transferências de estoque entre locais, do envio à confirmação de recebimento."
      apiPath="/api/stock-transfers"
      refreshToken={refresh}
      actions={
        can("stock.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova transferência
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar transferência ou local..."
      columns={[
        codeCol<StockTransferRow>("code", "Transferência"),
        refCol<StockTransferRow>("from_location_id", "Origem", locations, { mobile: "meta" }),
        refCol<StockTransferRow>("to_location_id", "Destino", locations, { mobile: "meta" }),
        dateTimeCol<StockTransferRow>("shipped_at", "Envio"),
        dateTimeCol<StockTransferRow>("received_at", "Recebimento", { defaultHidden: true }),
        statusCol<StockTransferRow>("stock_transfers"),
      ]}
      filters={[
        statusViews<StockTransferRow>([{ value: "transito", label: "Em trânsito", statuses: ["in_transit"] }]),
        statusFilter<StockTransferRow>("stock_transfers", "status", { server: true }),
      ]}
      detail={{
        actions: (row) => <WorkflowActions base="/api/stock-transfers" id={String(row.id)} status={dbStatusCode("stock_transfers", String(row.status ?? ""))} actions={ACTIONS} onDone={reload} />,
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="stock_transfers" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova transferência."
    />
    <SimpleCreateDialog form="transfers" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
