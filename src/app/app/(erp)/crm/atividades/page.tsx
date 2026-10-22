"use client";

import { useState } from "react";
import { ActivityStatusButtons } from "@/components/crm/CrmActions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ActivityRow } from "@/lib/database/schema";

export default function AtividadesPage() {
  const [refresh, setRefresh] = useState(0);

  return (
    <ResourceListPage<ActivityRow>
      refreshToken={refresh}
      title="Atividades"
      description="Interações com leads, oportunidades e clientes — ligações, reuniões, tarefas e follow-ups."
      apiPath="/api/activities"
      searchPlaceholder="Buscar atividade..."
      columns={[
        textCol<ActivityRow>("subject", "Assunto", { mobile: "title" }),
        textCol<ActivityRow>("activity_type", "Tipo", { width: "7rem", mobile: "meta" }),
        textCol<ActivityRow>("related_type", "Relacionado a", { width: "8rem" }),
        dateCol<ActivityRow>("due_date", "Prazo", { overdueWhen: (row) => isRowOverdue(row, "due_date", ["PENDING"]), mobile: "meta" }),
        statusCol<ActivityRow>("activities"),
      ]}
      filters={[
        combineViews<ActivityRow>(
          statusViews<ActivityRow>([{ value: "pendentes", label: "Pendentes", statuses: ["PENDING"] }]),
          overdueView<ActivityRow>("due_date", ["PENDING"], "Atrasadas")
        ),
        statusFilter<ActivityRow>("activities"),
      ]}
      detail={{
        title: (row) => row.subject,
        subtitle: (row) => row.activity_type,
        badges: (row) => <StatusBadge entity="activities" status={row.status} />,
        actions: (row) => <ActivityStatusButtons id={row.id} status={row.status} onDone={() => setRefresh((n) => n + 1)} />,
      }}
      emptyDescription="Registre atividades a partir de um lead ou de uma oportunidade."
    />
  );
}
