"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProjectTaskRow } from "@/lib/database/schema";

export default function TarefasPage() {
  const projects = useIdNameLookup("/api/projects");

  return (
    <ResourceListPage<ProjectTaskRow>
      title="Tarefas de projeto"
      description="Tarefas com hierarquia e prioridade, vinculadas a um projeto."
      apiPath="/api/project-tasks"
      searchPlaceholder="Buscar tarefa ou projeto..."
      columns={[
        textCol<ProjectTaskRow>("name", "Tarefa", { mobile: "title" }),
        refCol<ProjectTaskRow>("project_id", "Projeto", projects, { mobile: "meta" }),
        statusCol<ProjectTaskRow>(undefined, "priority", "Prioridade", { width: "7rem" }),
        dateCol<ProjectTaskRow>("due_date", "Prazo", { overdueWhen: (row) => isRowOverdue(row, "due_date", ["OPEN", "IN_PROGRESS", "BLOCKED"]), mobile: "meta" }),
        statusCol<ProjectTaskRow>("project_tasks"),
      ]}
      filters={[
        combineViews<ProjectTaskRow>(
          overdueView<ProjectTaskRow>("due_date", ["OPEN", "IN_PROGRESS", "BLOCKED"], "Atrasadas"),
          statusViews<ProjectTaskRow>([{ value: "bloqueadas", label: "Bloqueadas", statuses: ["BLOCKED"] }])
        ),
        statusFilter<ProjectTaskRow>("project_tasks"),
      ]}
      detail={{
        title: (row) => row.name,
        subtitle: (row) => projects.get(row.project_id) ?? undefined,
        badges: (row) => <StatusBadge entity="project_tasks" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
