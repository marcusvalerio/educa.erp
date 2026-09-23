"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { FiscalCfopRow } from "@/lib/database/schema";

export default function CfopPage() {

  return (
    <ResourceListPage<FiscalCfopRow>
      title="Códigos CFOP"
      description="Código Fiscal de Operações e Prestações usado na natureza da operação."
      apiPath="/api/fiscal-cfops"
      searchPlaceholder="Buscar CFOP ou descrição..."
      columns={[
        codeCol<FiscalCfopRow>("code", "CFOP"),
        textCol<FiscalCfopRow>("description", "Descrição", { mobile: "meta" }),
        textCol<FiscalCfopRow>("direction", "Direção", { width: "7rem" }),
        textCol<FiscalCfopRow>("scope", "Abrangência", { width: "8rem" }),
        statusCol<FiscalCfopRow>(undefined),
      ]}
      detail={{
        title: (row) => row.code,
        subtitle: (row) => row.description,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
