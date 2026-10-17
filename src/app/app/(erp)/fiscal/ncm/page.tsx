"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { FiscalNcmRow } from "@/lib/database/schema";

export default function NcmPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/fiscal-ncms");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<FiscalNcmRow>
      title="Classificação NCM"
      description="Nomenclatura Comum do Mercosul para a classificação fiscal dos produtos."
      apiPath="/api/fiscal-ncms"
      refreshToken={refresh}
      actions={
        can("fiscal_ncms.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo NCM
          </Button>
        ) : undefined
      }
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
      emptyDescription="Crie o primeiro pelo botão Novo NCM."
    />
    <SimpleCreateDialog form="fiscalNcms" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
