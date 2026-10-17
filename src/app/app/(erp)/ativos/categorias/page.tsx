"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { AssetCategoryRow } from "@/lib/database/schema";

export default function CategoriasAtivoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/asset-categories");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<AssetCategoryRow>
      title="Categorias de ativo"
      description="Classificação dos ativos (equipamentos, veículos, máquinas...)."
      apiPath="/api/asset-categories"
      refreshToken={refresh}
      actions={
        can("asset_categories.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova categoria
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar categoria..."
      columns={[codeCol<AssetCategoryRow>("code", "Categoria"), textCol<AssetCategoryRow>("name", "Nome", { mobile: "meta" }), statusCol<AssetCategoryRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova categoria."
    />
    <SimpleCreateDialog form="assetCategories" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
