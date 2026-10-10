"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, CalendarPlus, Pencil, Plus, ThumbsDown, Trophy } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, moneyCol, numberCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { Button } from "@/components/ui/Button";
import { DropdownMenuItem } from "@/components/ui/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useSession } from "@/components/shell/SessionProvider";
import { ActivityDialog, CloseOpportunityDialog, MoveStageDialog, OpportunityDialog, RelatedActivities, useCrmLookups } from "@/components/crm/CrmDialogs";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { OpportunityRow } from "@/lib/database/schema";

// Oportunidades: criar, editar (só abertas), mudar estágio, encerrar como
// ganha/perdida e registrar atividades. Converter em orçamento/pedido existe
// na API, mas exige um editor de itens que o ATLAS ainda não tem em nenhuma
// tela (ver docs/CRM/FLUXO-DE-DADOS-CRM.md §11) — por isso não há botão aqui.
export default function OportunidadesPage() {
  const { can } = useSession();
  const lookups = useCrmLookups();
  const customers = useMemo(() => new Map(lookups.customers.map((o) => [o.value, o.label])), [lookups.customers]);
  const users = useMemo(() => new Map(lookups.users.map((o) => [o.value, o.label])), [lookups.users]);
  const stageName = useMemo(() => new Map(lookups.pipelines.flatMap((p) => p.pipeline_stages.map((s) => [s.id, s.name] as const))), [lookups.pipelines]);
  const pipelineName = useMemo(() => new Map(lookups.pipelines.map((p) => [p.id, p.name] as const)), [lookups.pipelines]);
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((n) => n + 1);
  const [editing, setEditing] = useState<{ opportunity: OpportunityRow | null } | null>(null);
  const [moving, setMoving] = useState<OpportunityRow | null>(null);
  const [closing, setClosing] = useState<{ opportunity: OpportunityRow; outcome: "WON" | "LOST" } | null>(null);
  const [activityFor, setActivityFor] = useState<OpportunityRow | null>(null);

  const open = (row: OpportunityRow) => row.status === "OPEN";
  const canCreate = can("opportunities.create");
  const canEdit = (row: OpportunityRow) => can("opportunities.update") && open(row);
  const canMove = (row: OpportunityRow) => can("opportunities.move_stage") && open(row);
  const canClose = (row: OpportunityRow) => can("opportunities.close") && open(row);
  const canActivity = can("activities.create");

  const actions = (row: OpportunityRow) => (
    <>
      {canEdit(row) && <Button variant="secondary" size="sm" onClick={() => setEditing({ opportunity: row })}><Pencil size={14} aria-hidden /> Editar</Button>}
      {canMove(row) && <Button variant="secondary" size="sm" onClick={() => setMoving(row)}><ArrowRightLeft size={14} aria-hidden /> Mudar estágio</Button>}
      {canClose(row) && <Button variant="secondary" size="sm" onClick={() => setClosing({ opportunity: row, outcome: "WON" })}><Trophy size={14} aria-hidden /> Ganha</Button>}
      {canClose(row) && <Button variant="secondary" size="sm" onClick={() => setClosing({ opportunity: row, outcome: "LOST" })}><ThumbsDown size={14} aria-hidden /> Perdida</Button>}
      {canActivity && <Button variant="secondary" size="sm" onClick={() => setActivityFor(row)}><CalendarPlus size={14} aria-hidden /> Registrar atividade</Button>}
    </>
  );

  return (
    <>
      <ResourceListPage<OpportunityRow>
        title="Oportunidades"
        description="Oportunidades comerciais em lista — use o Pipeline para a visão por estágio."
        apiPath="/api/opportunities"
        refreshToken={refresh}
        searchPlaceholder="Buscar oportunidade ou cliente..."
        actions={canCreate ? <Button size="sm" onClick={() => setEditing({ opportunity: null })}><Plus size={14} aria-hidden /> Nova oportunidade</Button> : undefined}
        columns={[
          codeCol<OpportunityRow>("code", "Oportunidade"),
          textCol<OpportunityRow>("title", "Título", { mobile: "meta" }),
          refCol<OpportunityRow>("customer_id", "Cliente", customers),
          refCol<OpportunityRow>("stage_id", "Estágio", stageName),
          moneyCol<OpportunityRow>("estimated_value", "Valor estimado", { mobile: "meta" }),
          numberCol<OpportunityRow>("probability", "Prob. (%)", { digits: 0 }),
          dateCol<OpportunityRow>("expected_close_date", "Previsão", { overdueWhen: (row) => isRowOverdue(row, "expected_close_date", ["OPEN"]) }),
          statusCol<OpportunityRow>("opportunities"),
        ]}
        filters={[
          combineViews<OpportunityRow>(
            statusViews<OpportunityRow>([{ value: "abertas", label: "Abertas", statuses: ["OPEN"] }]),
            overdueView<OpportunityRow>("expected_close_date", ["OPEN"], "Fechamento vencido")
          ),
          statusFilter<OpportunityRow>("opportunities", "status", { server: true }),
        ]}
        rowActions={(row) => (
          <>
            {canEdit(row) && <DropdownMenuItem onSelect={() => setEditing({ opportunity: row })}><Pencil size={14} aria-hidden /> Editar</DropdownMenuItem>}
            {canMove(row) && <DropdownMenuItem onSelect={() => setMoving(row)}><ArrowRightLeft size={14} aria-hidden /> Mudar estágio</DropdownMenuItem>}
            {canClose(row) && <DropdownMenuItem onSelect={() => setClosing({ opportunity: row, outcome: "WON" })}><Trophy size={14} aria-hidden /> Marcar como ganha</DropdownMenuItem>}
            {canClose(row) && <DropdownMenuItem onSelect={() => setClosing({ opportunity: row, outcome: "LOST" })}><ThumbsDown size={14} aria-hidden /> Marcar como perdida</DropdownMenuItem>}
            {canActivity && <DropdownMenuItem onSelect={() => setActivityFor(row)}><CalendarPlus size={14} aria-hidden /> Registrar atividade</DropdownMenuItem>}
          </>
        )}
        detail={{
          title: (row) => row.title,
          subtitle: (row) => (row.customer_id ? customers.get(row.customer_id) : undefined),
          badges: (row) => <StatusBadge entity="opportunities" status={row.status} />,
          sections: [
            {
              title: "Negociação",
              fields: [
                { label: "Pipeline", value: (row) => pipelineName.get(row.pipeline_id) ?? "—" },
                { label: "Estágio", value: (row) => stageName.get(row.stage_id) ?? "—" },
                { label: "Valor estimado", value: (row) => formatCurrencyBRL(Number(row.estimated_value)) },
                { label: "Probabilidade", value: (row) => `${Number(row.probability)}%` },
                { label: "Previsão de fechamento", value: (row) => (row.expected_close_date ? formatDate(row.expected_close_date) : "—") },
                ...(lookups.canUsers ? [{ label: "Responsável", value: (row: OpportunityRow) => (row.owner_user_id ? users.get(row.owner_user_id) ?? "—" : "—") }] : []),
                { label: "Encerrada em", value: (row) => (row.closed_at ? formatDate(row.closed_at) : "—") },
                { label: "Motivo da perda", value: (row) => row.lost_reason || "—" },
                { label: "Observações", value: (row) => row.notes || "—", span: 2 },
              ],
            },
          ],
          render: (row) => <RelatedActivities type="opportunity" id={row.id} refresh={refresh} />,
          actions,
        }}
        emptyDescription={canCreate ? "Nenhuma oportunidade ainda. Use “Nova oportunidade” ou converta um lead." : "Quando houver registros, eles aparecem aqui."}
      />

      <OpportunityDialog open={editing !== null} opportunity={editing?.opportunity ?? null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <MoveStageDialog open={moving !== null} opportunity={moving} onClose={() => setMoving(null)} onDone={() => { setMoving(null); reload(); }} />
      <CloseOpportunityDialog open={closing !== null} opportunity={closing?.opportunity ?? null} outcome={closing?.outcome ?? "WON"} onClose={() => setClosing(null)} onDone={() => { setClosing(null); reload(); }} />
      <ActivityDialog
        open={activityFor !== null}
        activity={null}
        related={activityFor ? { type: "opportunity", id: activityFor.id, label: `${activityFor.code} · ${activityFor.title}` } : undefined}
        onClose={() => setActivityFor(null)}
        onSaved={() => { setActivityFor(null); reload(); }}
      />
    </>
  );
}
