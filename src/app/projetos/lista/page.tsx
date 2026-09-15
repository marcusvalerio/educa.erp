"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { ProjectRow } from "@/lib/database/schema";

export default function ProjetosListaPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ProjectRow>
      breadcrumbParent={{ label: "Projetos e Serviços", href: "/projetos" }}
      pageLabel="Projetos"
      title="Projetos"
      description="Projetos com cliente, orçamento e cronograma — tarefas, apontamentos e custos ficam nas abas relacionadas."
      apiPath="/api/projects"
      searchKeys={["code", "name"]}
      searchPlaceholder="Buscar por código ou nome..."
      emptyHint="Nenhum projeto encontrado."
      detailTitle={(row) => row.name}
      columns={[
        { key: "code", label: "Código" },
        { key: "name", label: "Nome" },
        { key: "customer", label: "Cliente", format: (row) => (row.customer_id ? customers.get(row.customer_id) ?? row.customer_id : "—") },
        { key: "start_date", label: "Início", format: (row) => formatDate(row.start_date) },
        { key: "budget", label: "Orçamento", align: "right", format: (row) => formatCurrencyBRL(row.budget) },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
