"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { AssetCategoryRow } from "@/lib/database/schema";

export default function AssetCategoriasPage() {
  return (
    <ResourceListPage<AssetCategoryRow>
      breadcrumbParent={{ label: "Ativos", href: "/ativos" }}
      pageLabel="Categorias"
      title="Categorias de ativo"
      description="Classificação dos ativos por categoria (equipamentos, veículos, máquinas...)."
      apiPath="/api/asset-categories"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhuma categoria de ativo encontrada."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
