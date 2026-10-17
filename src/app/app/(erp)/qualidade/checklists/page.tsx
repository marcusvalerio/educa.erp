"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, statusCol } from "@/components/data-table/columns";
import type { QualityChecklistRow } from "@/lib/database/schema";

export default function ChecklistsPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/quality-checklists");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<QualityChecklistRow>
      title="Checklists de qualidade"
      description="Critérios de inspeção por tipo: recebimento, produção, expedição, retorno e processo."
      apiPath="/api/quality-checklists"
      refreshToken={refresh}
      actions={
        can("quality_checklists.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo checklist
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar checklist..."
      columns={[codeCol<QualityChecklistRow>("code", "Checklist"), textCol<QualityChecklistRow>("name", "Nome", { mobile: "meta" }), textCol<QualityChecklistRow>("inspection_type", "Tipo de inspeção"), statusCol<QualityChecklistRow>(undefined)]}
      detail={{
        title: (row) => row.name,
      }}
      emptyDescription="Crie o primeiro pelo botão Novo checklist."
    />
    <SimpleCreateDialog form="qualityChecklists" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
