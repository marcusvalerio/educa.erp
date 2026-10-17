"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { AddCostDialog, ConsumePartDialog, NewMaintenanceOrderDialog } from "@/components/forms/ServiceForms";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { MAINTENANCE_ORDER_STEPS } from "@/components/forms/transitions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaintenanceOrderRow } from "@/lib/database/schema";

export default function OrdensManutencaoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/maintenance-orders");
    setRefresh((n) => n + 1);
  };
  const [part, setPart] = useState<string | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <>
    <ResourceListPage<MaintenanceOrderRow>
      title="Ordens de manutenção"
      description="Ordens preventivas, corretivas e preditivas, da abertura à conclusão."
      apiPath="/api/maintenance-orders"
      refreshToken={refresh}
      actions={
        can("maintenance_orders.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova ordem
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar ordem ou ativo..."
      columns={[
        codeCol<MaintenanceOrderRow>("code", "Ordem"),
        refCol<MaintenanceOrderRow>("asset_id", "Ativo", assets, { mobile: "meta" }),
        textCol<MaintenanceOrderRow>("order_type", "Tipo", { width: "7rem" }),
        statusCol<MaintenanceOrderRow>(undefined, "priority", "Prioridade", { width: "7rem", mobile: "meta" }),
        dateCol<MaintenanceOrderRow>("scheduled_date", "Programada", { overdueWhen: (row) => isRowOverdue(row, "scheduled_date", ["OPEN","PLANNED","WAITING_PARTS"]), mobile: "meta" }),
        statusCol<MaintenanceOrderRow>("maintenance_orders"),
      ]}
      filters={[
        combineViews<MaintenanceOrderRow>(
          overdueView<MaintenanceOrderRow>("scheduled_date", ["OPEN","PLANNED","WAITING_PARTS"], "Atrasadas"),
          statusViews<MaintenanceOrderRow>([{ value: "pecas", label: "Aguardando peças", statuses: ["WAITING_PARTS"] }])
        ),
        statusFilter<MaintenanceOrderRow>("maintenance_orders", "status", { server: true }),
        enumFilter<MaintenanceOrderRow>("priority", "Prioridade", [["LOW", "Baixa"], ["MEDIUM", "Média"], ["HIGH", "Alta"], ["CRITICAL", "Crítica"]]),
      ]}
      detail={{
        actions: (row) => <WorkflowActions base="/api/maintenance-orders" id={row.id} status={String(row.status ?? "")} actions={MAINTENANCE_ORDER_STEPS} onDone={reload} extra={["OPEN", "PLANNED", "IN_PROGRESS", "WAITING_PARTS"].includes(String(row.status)) ? <>{["IN_PROGRESS", "WAITING_PARTS"].includes(String(row.status)) && can("maintenance_orders.consume_parts") && <Button size="sm" variant="secondary" onClick={() => setPart(row.id)}>Consumir peça</Button>}{can("maintenance_orders.manage_costs") && <Button size="sm" variant="secondary" onClick={() => setCost(row.id)}>Lançar custo</Button>}</> : undefined} />,
        title: (row) => row.code,
        subtitle: (row) => assets.get(row.asset_id) ?? undefined,
        badges: (row) => <StatusBadge entity="maintenance_orders" status={row.status} />,
      }}
      emptyDescription="Abra a primeira ordem pelo botão Nova ordem."
    />
    <NewMaintenanceOrderDialog open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    {part && <ConsumePartDialog orderId={part} onClose={() => setPart(null)} onDone={() => { setPart(null); reload(); }} />}
    {cost && <AddCostDialog orderId={cost} onClose={() => setCost(null)} onDone={() => { setCost(null); reload(); }} />}
    </>
  );
}
