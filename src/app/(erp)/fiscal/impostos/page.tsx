"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, numberCol, statusCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TaxRuleRow } from "@/lib/database/schema";

export default function ImpostosPage() {

  return (
    <ResourceListPage<TaxRuleRow>
      title="Regras tributárias"
      description="Regras de cálculo aplicadas aos documentos fiscais por produto, operação e destino."
      apiPath="/api/tax-rules"
      searchPlaceholder="Buscar regra..."
      columns={[
        codeCol<TaxRuleRow>("code", "Regra"),
        textCol<TaxRuleRow>("name", "Nome", { mobile: "meta" }),
        numberCol<TaxRuleRow>("priority", "Prioridade", { digits: 0 }),
        dateCol<TaxRuleRow>("valid_from", "Vigência desde"),
        statusCol<TaxRuleRow>("tax_rules"),
      ]}
      filters={[statusFilter<TaxRuleRow>("tax_rules", "status", { server: true })]}
      detail={{
        title: (row) => row.name,
        badges: (row) => <StatusBadge entity="tax_rules" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
