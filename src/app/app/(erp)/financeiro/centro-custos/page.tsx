"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { CostCenterRow } from "@/lib/database/schema";

export default function CentroCustosPage() {

  return (
    <ResourceListPage<CostCenterRow>
      title="Centros de custo"
      description="Estrutura de centros de custo usada em rateios e na apuração de resultado por área."
      apiPath="/api/cost-centers"
      searchPlaceholder="Buscar centro de custo..."
      columns={[
        codeCol<CostCenterRow>("code", "Centro"),
        textCol<CostCenterRow>("name", "Nome", { mobile: "meta" }),
        statusCol<CostCenterRow>(undefined),
      ]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
