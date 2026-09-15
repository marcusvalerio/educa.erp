"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import type { FiscalNcmRow } from "@/lib/database/schema";

export default function NcmPage() {
  return (
    <ResourceListPage<FiscalNcmRow>
      breadcrumbParent={{ label: "Fiscal", href: "/fiscal" }}
      pageLabel="NCM"
      title="Classificação NCM"
      description="Nomenclatura Comum do Mercosul utilizada na classificação fiscal dos produtos."
      apiPath="/api/fiscal-ncms"
      searchKeys={["code", "description"]}
      searchPlaceholder="Buscar por código ou descrição..."
      emptyHint="Nenhuma classificação NCM encontrada."
      detailTitle={(row) => row.code}
      columns={[
        { key: "code", label: "Código" },
        { key: "description", label: "Descrição" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
