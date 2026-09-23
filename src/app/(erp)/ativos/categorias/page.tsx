"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { AssetCategoryRow } from "@/lib/database/schema";

export default function CategoriasAtivoPage() {

  return (
    <ResourceListPage<AssetCategoryRow>
      title="Categorias de ativo"
      description="Classificação dos ativos (equipamentos, veículos, máquinas...)."
      apiPath="/api/asset-categories"
      searchPlaceholder="Buscar categoria..."
      columns={[codeCol<AssetCategoryRow>("code", "Categoria"), textCol<AssetCategoryRow>("name", "Nome", { mobile: "meta" }), statusCol<AssetCategoryRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
