"use client";

import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews, labelCol } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ActivityRow } from "@/lib/database/schema";

// Códigos de 0055 (activities.activity_type / related_type) com rótulo em português.
const ACTIVITY_TYPE_LABELS: Record<string, string> = { CALL: "Ligação", MEETING: "Reunião", TASK: "Tarefa", CONTACT: "Contato", FOLLOW_UP: "Retorno", NOTE: "Anotação" };
const RELATED_TYPE_LABELS: Record<string, string> = { lead: "Lead", opportunity: "Oportunidade", customer: "Cliente" };

export default function AtividadesPage() {

  return (
    <ResourceListPage<ActivityRow>
      title="Atividades"
      description="Interações com leads, oportunidades e clientes — ligações, reuniões, tarefas e follow-ups."
      apiPath="/api/activities"
      searchPlaceholder="Buscar atividade..."
      columns={[
        textCol<ActivityRow>("subject", "Assunto", { mobile: "title" }),
        labelCol<ActivityRow>("activity_type", "Tipo", ACTIVITY_TYPE_LABELS, { width: "7rem", mobile: "meta" }),
        labelCol<ActivityRow>("related_type", "Relacionado a", RELATED_TYPE_LABELS, { width: "8rem" }),
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
      }}
      emptyDescription="Quando houver registros, eles aparecem aqui."
    />
  );
}
