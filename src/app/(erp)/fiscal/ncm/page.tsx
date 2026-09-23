"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { FiscalNcmRow } from "@/lib/database/schema";

export default function NcmPage() {

  return (
    <ResourceListPage<FiscalNcmRow>
      title="Classificação NCM"
      description="Nomenclatura Comum do Mercosul para a classificação fiscal dos produtos."
      apiPath="/api/fiscal-ncms"
      searchPlaceholder="Buscar NCM ou descrição..."
      columns={[
        codeCol<FiscalNcmRow>("code", "NCM"),
        textCol<FiscalNcmRow>("description", "Descrição", { mobile: "meta" }),
        statusCol<FiscalNcmRow>(undefined),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
