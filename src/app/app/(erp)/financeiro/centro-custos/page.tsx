"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { CostCenterRow } from "@/lib/database/schema";

export default function CentroCustosPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/cost-centers");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<CostCenterRow>
      title="Centros de custo"
      description="Estrutura de centros de custo usada em rateios e na apuração de resultado por área."
      apiPath="/api/cost-centers"
      refreshToken={refresh}
      actions={
        can("cost_centers.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo centro de custo
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar centro de custo..."
      columns={[
        codeCol<CostCenterRow>("code", "Centro"),
        textCol<CostCenterRow>("name", "Nome", { mobile: "meta" }),
        statusCol<CostCenterRow>(undefined),
      ]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Crie o primeiro pelo botão Novo centro de custo."
    />
    <SimpleCreateDialog form="costCenters" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
