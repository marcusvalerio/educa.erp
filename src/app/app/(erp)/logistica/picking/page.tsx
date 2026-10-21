"use client";

import { useState } from "react";
import { invalidateCache } from "@/lib/dashboard/client";
import { PickListActions } from "@/components/logistics/FulfillmentActions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, dateTimeCol, statusCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PickListRow } from "@/lib/database/schema";

export default function PickingPage() {
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/pick-lists");
    invalidateCache("/api/sales-orders");
    setRefresh((n) => n + 1);
  };

  return (
    <ResourceListPage<PickListRow>
      title="Separação (picking)"
      description="Listas de separação geradas a partir de pedidos de venda confirmados."
      apiPath="/api/pick-lists"
      refreshToken={refresh}
      searchPlaceholder="Buscar lista..."
      columns={[
        codeCol<PickListRow>("code", "Lista"),
        dateTimeCol<PickListRow>("started_at", "Início", { mobile: "meta" }),
        dateTimeCol<PickListRow>("completed_at", "Conclusão"),
        dateCol<PickListRow>("created_at", "Criada em", { defaultHidden: true }),
        statusCol<PickListRow>("pick_lists"),
      ]}
      filters={[
        statusViews<PickListRow>([{ value: "fila", label: "Na fila", statuses: ["pending"] }, { value: "separando", label: "Separando", statuses: ["in_progress"] }]),
        statusFilter<PickListRow>("pick_lists", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="pick_lists" status={row.status} />,
        actions: (row) => <PickListActions id={row.id} status={String(row.status ?? "")} onDone={reload} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
