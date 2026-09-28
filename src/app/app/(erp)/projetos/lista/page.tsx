"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProjectRow } from "@/lib/database/schema";

export default function ProjetosPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ProjectRow>
      title="Projetos"
      description="Projetos com cliente, orçamento e cronograma."
      apiPath="/api/projects"
      searchPlaceholder="Buscar projeto ou cliente..."
      columns={[
        codeCol<ProjectRow>("code", "Projeto"),
        textCol<ProjectRow>("name", "Nome", { mobile: "meta" }),
        refCol<ProjectRow>("customer_id", "Cliente", customers),
        dateCol<ProjectRow>("start_date", "Início"),
        moneyCol<ProjectRow>("budget", "Orçamento", { mobile: "meta" }),
        statusCol<ProjectRow>("projects"),
      ]}
      filters={[
        statusViews<ProjectRow>([{ value: "andamento", label: "Em andamento", statuses: ["IN_PROGRESS"] }, { value: "pausados", label: "Pausados", statuses: ["ON_HOLD"] }]),
        statusFilter<ProjectRow>("projects", "status", { server: true }),
      ]}
      detail={{
        title: (row) => row.name,
        subtitle: (row) => row.customer_id ? customers.get(row.customer_id) : undefined,
        badges: (row) => <StatusBadge entity="projects" status={row.status} />,
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
