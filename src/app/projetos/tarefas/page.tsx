"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { ProjectTaskRow } from "@/lib/database/schema";

export default function TarefasPage() {
  const projects = useIdNameLookup("/api/projects");

  return (
    <ResourceListPage<ProjectTaskRow>
      breadcrumbParent={{ label: "Projetos e Serviços", href: "/projetos" }}
      pageLabel="Tarefas"
      title="Tarefas de projeto"
      description="Tarefas com hierarquia e prioridade, vinculadas a um projeto."
      apiPath="/api/project-tasks"
      searchKeys={["name"]}
      searchPlaceholder="Buscar por nome..."
      emptyHint="Nenhuma tarefa encontrada."
      detailTitle={(row) => row.name}
      columns={[
        { key: "name", label: "Nome" },
        { key: "project", label: "Projeto", format: (row) => projects.get(row.project_id) ?? row.project_id },
        { key: "priority", label: "Prioridade" },
        { key: "due_date", label: "Prazo", format: (row) => formatDate(row.due_date) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
