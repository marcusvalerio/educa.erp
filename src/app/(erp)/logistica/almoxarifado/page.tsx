"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, dateTimeCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaterialRequestRow } from "@/lib/database/schema";

export default function AlmoxarifadoPage() {
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <ResourceListPage<MaterialRequestRow>
      title="Almoxarifado operacional"
      description="Requisições internas de material entre locais (diferente do estoque para venda)."
      apiPath="/api/material-requests"
      searchPlaceholder="Buscar requisição ou local..."
      columns={[
        codeCol<MaterialRequestRow>("code", "Requisição"),
        refCol<MaterialRequestRow>("from_location_id", "De", locations, { mobile: "meta" }),
        refCol<MaterialRequestRow>("to_location_id", "Para", locations, { mobile: "meta" }),
        dateCol<MaterialRequestRow>("created_at", "Solicitada em"),
        dateTimeCol<MaterialRequestRow>("delivered_at", "Entregue em"),
        statusCol<MaterialRequestRow>("material_requests"),
      ]}
      filters={[
        statusViews<MaterialRequestRow>([{ value: "pendentes", label: "Aguardando entrega", statuses: ["requested"] }]),
        statusFilter<MaterialRequestRow>("material_requests", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="material_requests" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
