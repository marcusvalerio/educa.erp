"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatDate } from "@/lib/format";
import type { ServiceOrderRow } from "@/lib/database/schema";

export default function OrdensServicoPage() {
  const customers = useIdNameLookup("/api/customers");

  return (
    <ResourceListPage<ServiceOrderRow>
      breadcrumbParent={{ label: "Projetos e Serviços", href: "/projetos" }}
      pageLabel="Ordens de serviço"
      title="Ordens de serviço"
      description="Ordens de serviço para clientes, da abertura à conclusão, com consumo de material e custos."
      apiPath="/api/service-orders"
      searchKeys={["code", "title"]}
      searchPlaceholder="Buscar por código ou título..."
      emptyHint="Nenhuma ordem de serviço encontrada."
      detailTitle={(row) => row.title}
      columns={[
        { key: "code", label: "Código" },
        { key: "title", label: "Título" },
        { key: "customer", label: "Cliente", format: (row) => customers.get(row.customer_id) ?? row.customer_id },
        { key: "scheduled_date", label: "Programada para", format: (row) => formatDate(row.scheduled_date) },
        { key: "priority", label: "Prioridade" },
        { key: "status", label: "Status", status: true },
      ]}
    />
  );
}
