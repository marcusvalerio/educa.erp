"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ServiceOrderRow } from "@/lib/database/schema";

export default function OrdensServicoPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ServiceOrderRow>
      title="Ordens de serviço"
      description="Serviços para clientes, da abertura à conclusão, com consumo de material e custos."
      apiPath="/api/service-orders"
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
        title: (row) => row.title,
        subtitle: (row) => customers.get(row.customer_id) ?? undefined,
        badges: (row) => <StatusBadge entity="service_orders" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
