"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaintenancePlanRow } from "@/lib/database/schema";

export default function PlanosManutencaoPage() {
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <ResourceListPage<MaintenancePlanRow>
      breadcrumbParent={{ label: "Ativos", href: "/ativos" }}
      pageLabel="Planos de manutenção"
      title="Planos de manutenção"
      description="Planos preventivos, corretivos e preditivos, com periodicidade por tempo, horas, ciclos ou km."
      apiPath="/api/maintenance-plans"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhum plano de manutenção encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "asset", label: "Ativo", format: (row) => (row.asset_id ? assets.get(row.asset_id) ?? row.asset_id : "Categoria inteira") },
        { key: "plan_type", label: "Tipo" },
        { key: "periodicity_type", label: "Periodicidade" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
