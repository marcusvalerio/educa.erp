"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { formatDate } from "@/lib/format";
import type { TaxRuleRow } from "@/lib/database/schema";

export default function ImpostosPage() {
  return (
    <ResourceListPage<TaxRuleRow>
      breadcrumbParent={{ label: "Fiscal", href: "/fiscal" }}
      pageLabel="Impostos"
      title="Regras tributárias"
      description="Regras de cálculo tributário aplicadas aos documentos fiscais conforme produto, operação e destino."
      apiPath="/api/tax-rules"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhuma regra tributária encontrada."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "priority", label: "Prioridade", align: "right" },
        { key: "valid_from", label: "Vigência desde", format: (row) => formatDate(row.valid_from) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
