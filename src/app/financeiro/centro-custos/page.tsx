"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { CostCenterRow } from "@/lib/database/schema";

export default function CentroCustosPage() {
  return (
    <ResourceListPage<CostCenterRow>
      breadcrumbParent={{ label: "Financeiro", href: "/financeiro" }}
      pageLabel="Centro de custos"
      title="Centros de custo"
      description="Estrutura de centros de custo utilizada em rateios e apuração de resultado por área."
      apiPath="/api/cost-centers"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhum centro de custo encontrado."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
