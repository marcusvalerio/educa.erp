"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { AssetLocationRow } from "@/lib/database/schema";

export default function LocaisAtivoPage() {

  return (
    <ResourceListPage<AssetLocationRow>
      title="Locais de instalação"
      description="Planta, setor ou linha onde cada ativo está instalado (diferente de local de estoque)."
      apiPath="/api/asset-locations"
      searchPlaceholder="Buscar local..."
      columns={[codeCol<AssetLocationRow>("code", "Local"), textCol<AssetLocationRow>("name", "Nome", { mobile: "meta" }), statusCol<AssetLocationRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
