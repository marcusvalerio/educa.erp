"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaintenanceOrderRow } from "@/lib/database/schema";

export default function OrdensManutencaoPage() {
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <ResourceListPage<MaintenanceOrderRow>
      title="Ordens de manutenção"
      description="Ordens preventivas, corretivas e preditivas, da abertura à conclusão."
      apiPath="/api/maintenance-orders"
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
        title: (row) => row.code,
        subtitle: (row) => assets.get(row.asset_id) ?? undefined,
        badges: (row) => <StatusBadge entity="maintenance_orders" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
