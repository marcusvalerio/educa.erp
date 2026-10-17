"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { CountItems } from "@/components/forms/StepPanels";
import { dbStatusCode } from "@/lib/status";

const ACTIONS: WorkflowAction[] = [
  { id: "close", label: "Encerrar e ajustar estoque", path: "close", permission: "stock.approve", statuses: ["counting"], confirm: "As diferenças contadas viram ajustes de estoque. Itens não contados ficam como estão.", success: "Contagem encerrada." },
  { id: "cancel", label: "Cancelar contagem", path: "cancel", permission: "stock.count", statuses: ["counting"], confirm: "Nada é ajustado.", success: "Contagem cancelada.", tone: "danger" },
];
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateTimeCol, statusCol, refCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockCountRow } from "@/lib/database/schema";

export default function InventarioPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/stock-counts");
    setRefresh((n) => n + 1);
  };
  const warehouses = useIdNameLookup("/api/warehouses");

  return (
    <>
    <ResourceListPage<StockCountRow>
      title="Contagens de inventário"
      description="Contagens físicas por armazém, da abertura ao fechamento com ajuste."
      apiPath="/api/stock-counts"
      refreshToken={refresh}
      actions={
        can("stock.count") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova contagem
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar contagem ou armazém..."
      columns={[
        codeCol<StockCountRow>("code", "Contagem"),
        refCol<StockCountRow>("warehouse_id", "Armazém", warehouses, { mobile: "meta" }),
        dateTimeCol<StockCountRow>("closed_at", "Fechada em"),
        statusCol<StockCountRow>("stock_counts"),
      ]}
      filters={[statusFilter<StockCountRow>("stock_counts", "status", { server: true })]}
      detail={{
        render: (row) => <CountItems key={`${String(row.id)}-${refresh}`} countId={String(row.id)} status={dbStatusCode("stock_counts", String(row.status ?? "")).toLowerCase()} onChanged={reload} />,
        actions: (row) => <WorkflowActions base="/api/stock-counts" id={String(row.id)} status={dbStatusCode("stock_counts", String(row.status ?? ""))} actions={ACTIONS} onDone={reload} />,
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="stock_counts" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova contagem."
    />
    <SimpleCreateDialog form="stockCounts" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
