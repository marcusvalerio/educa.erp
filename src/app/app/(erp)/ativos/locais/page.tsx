"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { AssetLocationRow } from "@/lib/database/schema";

export default function LocaisAtivoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/asset-locations");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<AssetLocationRow>
      title="Locais de instalação"
      description="Planta, setor ou linha onde cada ativo está instalado (diferente de local de estoque)."
      apiPath="/api/asset-locations"
      refreshToken={refresh}
      actions={
        can("asset_locations.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo local
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar local..."
      columns={[codeCol<AssetLocationRow>("code", "Local"), textCol<AssetLocationRow>("name", "Nome", { mobile: "meta" }), statusCol<AssetLocationRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Crie o primeiro pelo botão Novo local."
    />
    <SimpleCreateDialog form="assetLocations" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
