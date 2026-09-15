"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { AssetLocationRow } from "@/lib/database/schema";

export default function AssetLocaisPage() {
  return (
    <ResourceListPage<AssetLocationRow>
      breadcrumbParent={{ label: "Ativos", href: "/ativos" }}
      pageLabel="Locais"
      title="Locais de instalação de ativos"
      description="Planta/setor/linha onde cada ativo está instalado — diferente de local de estoque (endereço de armazenagem)."
      apiPath="/api/asset-locations"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhum local de ativo encontrado."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
