"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, dateTimeCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaterialRequestRow } from "@/lib/database/schema";

export default function AlmoxarifadoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/material-requests");
    setRefresh((n) => n + 1);
  };
  const locations = useIdNameLookup("/api/warehouse-locations");

  return (
    <>
    <ResourceListPage<MaterialRequestRow>
      title="Almoxarifado operacional"
      description="Requisições internas de material entre locais (diferente do estoque para venda)."
      apiPath="/api/material-requests"
      refreshToken={refresh}
      actions={
        can("stock.request") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova requisição
          </Button>
        ) : undefined
      }
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
      emptyDescription="Crie o primeiro pelo botão Nova requisição."
    />
    <SimpleCreateDialog form="materialRequests" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
