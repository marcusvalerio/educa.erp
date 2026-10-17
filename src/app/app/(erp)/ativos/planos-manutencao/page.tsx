"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol, refCol } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { MaintenancePlanRow } from "@/lib/database/schema";

export default function PlanosManutencaoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/maintenance-plans");
    setRefresh((n) => n + 1);
  };
  const assets = useIdNameLookup("/api/assets", "description");

  return (
    <>
    <ResourceListPage<MaintenancePlanRow>
      title="Planos de manutenção"
      description="Planos com periodicidade por tempo, horas, ciclos ou quilometragem."
      apiPath="/api/maintenance-plans"
      refreshToken={refresh}
      actions={
        can("maintenance_plans.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo plano
          </Button>
        ) : undefined
      }
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
      emptyDescription="Crie o primeiro pelo botão Novo plano."
    />
    <SimpleCreateDialog form="maintenancePlans" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
