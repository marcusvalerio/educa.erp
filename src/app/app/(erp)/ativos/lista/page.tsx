"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { AssetRow } from "@/lib/database/schema";

export default function AtivosPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/assets");
    setRefresh((n) => n + 1);
  };
  const categories = useIdNameLookup("/api/asset-categories");
  const locations = useIdNameLookup("/api/asset-locations");

  return (
    <>
    <ResourceListPage<AssetRow>
      title="Ativos"
      description="Máquinas, equipamentos e veículos, com hierarquia de sub-ativos. Ativo não é estoque."
      apiPath="/api/assets"
      refreshToken={refresh}
      actions={
        can("assets.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo ativo
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar ativo, fabricante ou série..."
      columns={[
        codeCol<AssetRow>("code", "Ativo"),
        textCol<AssetRow>("description", "Descrição", { mobile: "meta" }),
        refCol<AssetRow>("category_id", "Categoria", categories),
        refCol<AssetRow>("location_id", "Local", locations, { mobile: "meta" }),
        textCol<AssetRow>("manufacturer", "Fabricante", { defaultHidden: true }),
        moneyCol<AssetRow>("acquisition_cost", "Custo de aquisição"),
        dateCol<AssetRow>("acquisition_date", "Aquisição", { defaultHidden: true }),
        statusCol<AssetRow>("assets"),
      ]}
      filters={[
        statusViews<AssetRow>([{ value: "manutencao", label: "Em manutenção", statuses: ["UNDER_MAINTENANCE"] }]),
        statusFilter<AssetRow>("assets", "status", { server: true }),
      ]}
      rowHref={(row) => `/app/ativos/lista/${row.id}`}
      emptyDescription="Crie o primeiro pelo botão Novo ativo."
    />
    <SimpleCreateDialog form="assets" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
