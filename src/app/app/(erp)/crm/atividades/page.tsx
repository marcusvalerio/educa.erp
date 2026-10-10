"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews, labelCol } from "@/components/data-table/columns";
import { Button } from "@/components/ui/Button";
import { DropdownMenuItem } from "@/components/ui/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { ActivityDialog } from "@/components/crm/CrmDialogs";
import { apiSend } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { ActivityRow } from "@/lib/database/schema";

// Códigos de 0055 (activities.activity_type / related_type) com rótulo em português.
const ACTIVITY_TYPE_LABELS: Record<string, string> = { CALL: "Ligação", MEETING: "Reunião", TASK: "Tarefa", CONTACT: "Contato", FOLLOW_UP: "Retorno", NOTE: "Anotação" };
const RELATED_TYPE_LABELS: Record<string, string> = { lead: "Lead", opportunity: "Oportunidade", customer: "Cliente" };

// Atividades: registrar, editar, concluir e cancelar pelas rotas
// /api/activities (o banco confere que o registro relacionado existe na
// mesma empresa).
export default function AtividadesPage() {
  const { can } = useSession();
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((n) => n + 1);
  const [editing, setEditing] = useState<{ activity: ActivityRow | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const canCreate = can("activities.create");
  const canEdit = can("activities.update");
  const canFinish = (row: ActivityRow) => canEdit && row.status === "PENDING";

  async function setStatus(row: ActivityRow, status: "DONE" | "CANCELLED") {
    if (busy) return;
    setBusy(row.id);
    try {
      await apiSend<ActivityRow>(`/api/activities/${row.id}`, "PATCH", { status });
      toast.success(status === "DONE" ? "Atividade concluída." : "Atividade cancelada.");
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a atividade.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ResourceListPage<ActivityRow>
        title="Atividades"
        description="Interações com leads, oportunidades e clientes — ligações, reuniões, tarefas e follow-ups."
        apiPath="/api/activities"
        refreshToken={refresh}
        searchPlaceholder="Buscar atividade..."
        actions={canCreate ? <Button size="sm" onClick={() => setEditing({ activity: null })}><Plus size={14} aria-hidden /> Nova atividade</Button> : undefined}
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
        rowActions={(row) => (
          <>
            {canEdit && <DropdownMenuItem onSelect={() => setEditing({ activity: row })}><Pencil size={14} aria-hidden /> Editar</DropdownMenuItem>}
            {canFinish(row) && <DropdownMenuItem onSelect={() => setStatus(row, "DONE")}><Check size={14} aria-hidden /> Marcar como realizada</DropdownMenuItem>}
            {canFinish(row) && <DropdownMenuItem onSelect={() => setStatus(row, "CANCELLED")}><X size={14} aria-hidden /> Cancelar atividade</DropdownMenuItem>}
          </>
        )}
        detail={{
          title: (row) => row.subject,
          subtitle: (row) => ACTIVITY_TYPE_LABELS[row.activity_type] ?? row.activity_type,
          badges: (row) => <StatusBadge entity="activities" status={row.status} />,
          sections: [
            {
              title: "Atividade",
              fields: [
                { label: "Tipo", value: (row) => ACTIVITY_TYPE_LABELS[row.activity_type] ?? row.activity_type },
                { label: "Relacionada a", value: (row) => RELATED_TYPE_LABELS[row.related_type] ?? row.related_type },
                { label: "Prazo", value: (row) => (row.due_date ? formatDate(row.due_date) : "—") },
                { label: "Concluída em", value: (row) => (row.completed_at ? formatDate(row.completed_at) : "—") },
                { label: "Descrição", value: (row) => row.description || "—", span: 2 },
              ],
            },
          ],
          actions: (row) => (
            <>
              {canEdit && <Button variant="secondary" size="sm" onClick={() => setEditing({ activity: row })}><Pencil size={14} aria-hidden /> Editar</Button>}
              {canFinish(row) && <Button variant="secondary" size="sm" loading={busy === row.id} onClick={() => setStatus(row, "DONE")}><Check size={14} aria-hidden /> Marcar como realizada</Button>}
              {canFinish(row) && <Button variant="secondary" size="sm" disabled={busy === row.id} onClick={() => setStatus(row, "CANCELLED")}><X size={14} aria-hidden /> Cancelar</Button>}
            </>
          ),
        }}
        emptyDescription={canCreate ? "Nenhuma atividade ainda. Use “Nova atividade” ou registre a partir de um lead ou oportunidade." : "Quando houver registros, eles aparecem aqui."}
      />
      <ActivityDialog open={editing !== null} activity={editing?.activity ?? null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </>
  );
}
