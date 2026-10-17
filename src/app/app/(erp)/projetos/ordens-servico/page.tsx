"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { NewServiceOrderDialog } from "@/components/forms/ServiceForms";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { SERVICE_ORDER_STEPS } from "@/components/forms/transitions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ServiceOrderRow } from "@/lib/database/schema";

export default function OrdensServicoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/service-orders");
    setRefresh((n) => n + 1);
  };
  const customers = useIdNameLookup("/api/customers");

  return (
    <>
    <ResourceListPage<ServiceOrderRow>
      title="Ordens de serviço"
      description="Serviços para clientes, da abertura à conclusão, com consumo de material e custos."
      apiPath="/api/service-orders"
      refreshToken={refresh}
      actions={
        can("service_orders.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova OS
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar OS ou cliente..."
      columns={[
        codeCol<ServiceOrderRow>("code", "OS"),
        textCol<ServiceOrderRow>("title", "Título", { mobile: "meta" }),
        refCol<ServiceOrderRow>("customer_id", "Cliente", customers),
        dateCol<ServiceOrderRow>("scheduled_date", "Programada", { overdueWhen: (row) => isRowOverdue(row, "scheduled_date", ["OPEN","SCHEDULED","WAITING"]), mobile: "meta" }),
        statusCol<ServiceOrderRow>(undefined, "priority", "Prioridade", { width: "7rem" }),
        statusCol<ServiceOrderRow>("service_orders"),
      ]}
      filters={[
        combineViews<ServiceOrderRow>(
          overdueView<ServiceOrderRow>("scheduled_date", ["OPEN","SCHEDULED","WAITING"], "Atrasadas"),
          statusViews<ServiceOrderRow>([{ value: "execucao", label: "Em execução", statuses: ["IN_PROGRESS"] }])
        ),
        statusFilter<ServiceOrderRow>("service_orders", "status", { server: true }),
      ]}
      detail={{
        actions: (row) => <WorkflowActions base="/api/service-orders" id={row.id} status={String(row.status ?? "")} actions={SERVICE_ORDER_STEPS} onDone={reload} />,
        title: (row) => row.title,
        subtitle: (row) => customers.get(row.customer_id) ?? undefined,
        badges: (row) => <StatusBadge entity="service_orders" status={row.status} />,
      }}
      emptyDescription="Abra a primeira ordem de serviço pelo botão Nova OS."
    />
    <NewServiceOrderDialog open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
