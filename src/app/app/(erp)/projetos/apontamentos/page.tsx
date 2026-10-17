"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, numberCol, refCol } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { TimeEntryRow } from "@/lib/database/schema";

export default function ApontamentosPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/time-entries");
    setRefresh((n) => n + 1);
  };
  const projects = useIdNameLookup("/api/projects");

  return (
    <>
    <ResourceListPage<TimeEntryRow>
      title="Apontamentos de horas"
      description="Horas apontadas em projeto/tarefa ou ordem de serviço (não é ponto nem folha)."
      apiPath="/api/time-entries"
      refreshToken={refresh}
      actions={
        can("time_entries.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Apontar horas
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar apontamento..."
      columns={[
        dateCol<TimeEntryRow>("entry_date", "Data", { mobile: "title" }),
        refCol<TimeEntryRow>("project_id", "Projeto", projects, { mobile: "meta" }),
        numberCol<TimeEntryRow>("duration_minutes", "Minutos", { digits: 0, mobile: "meta" }),
        textCol<TimeEntryRow>("description", "Descrição"),
      ]}
      detail={{
        title: () => "Apontamento de horas",
        subtitle: (row) => row.project_id ? projects.get(row.project_id) : undefined,
      }}
      emptyDescription="Crie o primeiro pelo botão Apontar horas."
    />
    <SimpleCreateDialog form="timeEntries" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
