"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, numberCol, statusCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TaxRuleRow } from "@/lib/database/schema";

export default function ImpostosPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/tax-rules");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<TaxRuleRow>
      title="Regras tributárias"
      description="Regras de cálculo aplicadas aos documentos fiscais por produto, operação e destino."
      apiPath="/api/tax-rules"
      refreshToken={refresh}
      actions={
        can("tax_rules.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova regra
          </Button>
        ) : undefined
      }
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
      emptyDescription="Crie o primeiro pelo botão Nova regra."
    />
    <SimpleCreateDialog form="taxRules" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
