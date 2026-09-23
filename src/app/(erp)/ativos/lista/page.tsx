"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { AssetRow } from "@/lib/database/schema";

export default function AtivosPage() {
  const categories = useIdNameLookup("/api/asset-categories");
  const locations = useIdNameLookup("/api/asset-locations");

  return (
    <ResourceListPage<AssetRow>
      title="Ativos"
      description="Máquinas, equipamentos e veículos, com hierarquia de sub-ativos. Ativo não é estoque."
      apiPath="/api/assets"
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
      rowHref={(row) => `/ativos/lista/${row.id}`}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
