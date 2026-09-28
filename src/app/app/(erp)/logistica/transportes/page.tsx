"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ShipmentRow } from "@/lib/database/schema";

export default function TransportesPage() {
  const customers = useIdNameLookup("/api/customers");
  const carriers = useIdNameLookup("/api/carriers", "legal_name");

  return (
    <ResourceListPage<ShipmentRow>
      title="Transportes"
      description="Expedições sob a ótica do transporte: transportadora, despacho e entrega."
      apiPath="/api/shipments"
      searchPlaceholder="Buscar expedição, cliente ou cidade..."
      columns={[
        codeCol<ShipmentRow>("code", "Expedição"),
        refCol<ShipmentRow>("customer_id", "Cliente", customers, { defaultHidden: true }),
        refCol<ShipmentRow>("carrier_id", "Transportadora", carriers),
        textCol<ShipmentRow>("delivery_city", "Cidade", { mobile: "meta" }),
        dateCol<ShipmentRow>("expected_ship_date", "Expedição prevista", { overdueWhen: (row) => isRowOverdue(row, "expected_ship_date", ["draft","ready","picking","packed","ready_to_ship"]), mobile: "meta" }),
        dateCol<ShipmentRow>("created_at", "Criada em", { defaultHidden: true }),
        statusCol<ShipmentRow>("shipments"),
      ]}
      filters={[
        combineViews<ShipmentRow>(
          overdueView<ShipmentRow>("expected_ship_date", ["draft","ready","picking","packed","ready_to_ship"], "Expedição atrasada"),
          statusViews<ShipmentRow>([{ value: "transito", label: "Em trânsito", statuses: ["shipped", "in_transit"] }, { value: "entregues", label: "Entregues", statuses: ["delivered", "completed"] }])
        ),
        statusFilter<ShipmentRow>("shipments", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => customers.get(row.customer_id) ?? undefined,
        badges: (row) => <StatusBadge entity="shipments" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
