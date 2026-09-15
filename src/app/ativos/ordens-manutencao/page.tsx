"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { MaintenanceOrderRow } from "@/lib/database/schema";

export default function OrdensManutencaoPage() {
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <ResourceListPage<MaintenanceOrderRow>
      breadcrumbParent={{ label: "Ativos", href: "/ativos" }}
      pageLabel="Ordens de manutenção"
      title="Ordens de manutenção"
      description="Ordens preventivas, corretivas e preditivas, da abertura à conclusão."
      apiPath="/api/maintenance-orders"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhuma ordem de manutenção encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "asset", label: "Ativo", format: (row) => assets.get(row.asset_id) ?? row.asset_id },
        { key: "order_type", label: "Tipo" },
        { key: "priority", label: "Prioridade" },
        { key: "scheduled_date", label: "Programada para", format: (row) => formatDate(row.scheduled_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
