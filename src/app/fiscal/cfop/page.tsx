"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { FiscalCfopRow } from "@/lib/database/schema";

export default function CfopPage() {
  return (
    <ResourceListPage<FiscalCfopRow>
      breadcrumbParent={{ label: "Fiscal", href: "/fiscal" }}
      pageLabel="CFOP"
      title="Códigos CFOP"
      description="Código Fiscal de Operações e Prestações utilizado na natureza da operação dos documentos fiscais."
      apiPath="/api/fiscal-cfops"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhum código CFOP encontrado."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "direction", label: "Direção" },
        { key: "scope", label: "Abrangência" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
