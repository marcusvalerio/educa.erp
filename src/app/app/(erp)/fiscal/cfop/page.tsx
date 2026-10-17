"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { FiscalCfopRow } from "@/lib/database/schema";

export default function CfopPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/fiscal-cfops");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<FiscalCfopRow>
      title="Códigos CFOP"
      description="Código Fiscal de Operações e Prestações usado na natureza da operação."
      apiPath="/api/fiscal-cfops"
      refreshToken={refresh}
      actions={
        can("fiscal_cfops.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo CFOP
          </Button>
        ) : undefined
      }
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
      emptyDescription="Crie o primeiro pelo botão Novo CFOP."
    />
    <SimpleCreateDialog form="fiscalCfops" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
