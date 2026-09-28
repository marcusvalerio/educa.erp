"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, numberCol, refCol } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { TimeEntryRow } from "@/lib/database/schema";

export default function ApontamentosPage() {
  const projects = useIdNameLookup("/api/projects");

  return (
    <ResourceListPage<TimeEntryRow>
      title="Apontamentos de horas"
      description="Horas apontadas em projeto/tarefa ou ordem de serviço (não é ponto nem folha)."
      apiPath="/api/time-entries"
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
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
