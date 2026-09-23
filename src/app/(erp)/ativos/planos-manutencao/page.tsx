"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol, refCol } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaintenancePlanRow } from "@/lib/database/schema";

export default function PlanosManutencaoPage() {
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <ResourceListPage<MaintenancePlanRow>
      title="Planos de manutenção"
      description="Planos com periodicidade por tempo, horas, ciclos ou quilometragem."
      apiPath="/api/maintenance-plans"
      searchPlaceholder="Buscar plano..."
      columns={[
        codeCol<MaintenancePlanRow>("code", "Plano"),
        refCol<MaintenancePlanRow>("asset_id", "Ativo", assets, { mobile: "meta", cell: (row) => (row.asset_id ? assets.get(row.asset_id) ?? "—" : "Categoria inteira") }),
        textCol<MaintenancePlanRow>("plan_type", "Tipo", { width: "7rem" }),
        textCol<MaintenancePlanRow>("periodicity_type", "Periodicidade", { width: "8rem" }),
        statusCol<MaintenancePlanRow>(undefined),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
