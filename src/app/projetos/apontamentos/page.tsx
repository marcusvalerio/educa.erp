"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { TimeEntryRow } from "@/lib/database/schema";

// Fase 19 — apontamento OPERACIONAL de projeto/serviço (time_entries,
// Fase 18) — nunca tratado como ponto/folha de RH também na UI.
export default function ApontamentosPage() {
  const projects = useIdNameLookup("/api/projects");

  return (
    <ResourceListPage<TimeEntryRow>
      breadcrumbParent={{ label: "Projetos e Serviços", href: "/projetos" }}
      pageLabel="Apontamentos"
      title="Apontamentos de horas"
      description="Apontamento operacional de horas em projeto/tarefa ou ordem de serviço — não é ponto ou folha de pagamento."
      apiPath="/api/time-entries"
      searchKeys={["description"]}
      searchPlaceholder="Buscar por descrição..."
      emptyHint="Nenhum apontamento encontrado."
      detailTitle={() => "Apontamento de horas"}
      columns={[
        { key: "entry_date", label: "Data", format: (row) => formatDate(row.entry_date) },
        { key: "project", label: "Projeto", format: (row) => (row.project_id ? projects.get(row.project_id) ?? row.project_id : "—") },
        { key: "duration_minutes", label: "Duração (min)", align: "right" },
        { key: "description", label: "Descrição" },
      ]}
    />
  );
}
