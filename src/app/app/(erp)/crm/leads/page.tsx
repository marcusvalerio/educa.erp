"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Handshake, Pencil, Plus, UserCheck } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, refCol, labelCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { DropdownMenuItem } from "@/components/ui/Menu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { ActivityDialog, ConvertLeadToOpportunityDialog, LeadDialog, RelatedActivities, useCrmLookups } from "@/components/crm/CrmDialogs";
import { apiSend } from "@/lib/api-client";
import type { LeadRow } from "@/lib/database/schema";

// Qualificação (0054): COLD/WARM/HOT no banco; rótulo em português na tela e no CSV.
const LEAD_QUALIFICATION_LABELS: Record<string, string> = { HOT: "Quente", WARM: "Morno", COLD: "Frio" };

// Leads: criar, editar, converter em cliente/oportunidade e registrar
// atividades pelas rotas /api/leads (regras no servidor e no banco: lead
// convertido não é editado; conversão em cliente exige CPF/CNPJ e reaproveita
// o cliente com o mesmo documento; uma oportunidade aberta por lead).
export default function LeadsPage() {
  const { can } = useSession();
  const [refresh, setRefresh] = useState(0);
  const lookups = useCrmLookups(refresh);
  const origins = useMemo(() => new Map(lookups.origins.map((o) => [o.value, o.label])), [lookups.origins]);
  const users = useMemo(() => new Map(lookups.users.map((o) => [o.value, o.label])), [lookups.users]);
  const customers = useMemo(() => new Map(lookups.customers.map((o) => [o.value, o.label])), [lookups.customers]);
  const reload = () => setRefresh((n) => n + 1);
  const [editing, setEditing] = useState<{ lead: LeadRow | null } | null>(null);
  const [toCustomer, setToCustomer] = useState<LeadRow | null>(null);
  const [converting, setConverting] = useState(false);
  const [toOpportunity, setToOpportunity] = useState<LeadRow | null>(null);
  const [activityFor, setActivityFor] = useState<LeadRow | null>(null);

  const canCreate = can("leads.create");
  const canEdit = (row: LeadRow) => can("leads.update") && row.status !== "CONVERTED";
  const canConvert = can("leads.convert");
  const canActivity = can("activities.create");

  async function convertToCustomer() {
    if (!toCustomer || converting) return;
    setConverting(true);
    try {
      const customer = await apiSend<{ code: string; name: string }>(`/api/leads/${toCustomer.id}/convert-to-customer`, "POST", {});
      toast.success(`Lead ${toCustomer.code} convertido: cliente ${customer.code} — ${customer.name}.`);
      setToCustomer(null);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível converter o lead.");
    } finally {
      setConverting(false);
    }
  }

  const actions = (row: LeadRow) => (
    <>
      {canEdit(row) && <Button variant="secondary" size="sm" onClick={() => setEditing({ lead: row })}><Pencil size={14} aria-hidden /> Editar</Button>}
      {canConvert && row.status !== "CONVERTED" && <Button variant="secondary" size="sm" onClick={() => setToCustomer(row)}><UserCheck size={14} aria-hidden /> Converter em cliente</Button>}
      {canConvert && <Button variant="secondary" size="sm" onClick={() => setToOpportunity(row)}><Handshake size={14} aria-hidden /> Converter em oportunidade</Button>}
      {canActivity && <Button variant="secondary" size="sm" onClick={() => setActivityFor(row)}><CalendarPlus size={14} aria-hidden /> Registrar atividade</Button>}
    </>
  );

  return (
    <>
      <ResourceListPage<LeadRow>
        title="Leads"
        description="Leads comerciais — da captação à conversão em cliente ou oportunidade."
        apiPath="/api/leads"
        refreshToken={refresh}
        searchPlaceholder="Buscar lead, empresa ou e-mail..."
        actions={canCreate ? <Button size="sm" onClick={() => setEditing({ lead: null })}><Plus size={14} aria-hidden /> Novo lead</Button> : undefined}
        columns={[
          codeCol<LeadRow>("code", "Lead"),
          textCol<LeadRow>("name", "Nome", { mobile: "meta" }),
          textCol<LeadRow>("company_name", "Empresa"),
          refCol<LeadRow>("origin_id", "Origem", origins),
          labelCol<LeadRow>("qualification", "Qualificação", LEAD_QUALIFICATION_LABELS, { width: "7rem" }),
          ...(lookups.canUsers ? [refCol<LeadRow>("responsible_user_id", "Responsável", users)] : []),
          dateCol<LeadRow>("created_at", "Criado em", { mobile: "meta" }),
          statusCol<LeadRow>("leads"),
        ]}
        filters={[
          statusViews<LeadRow>([{ value: "novos", label: "Novos", statuses: ["NEW"] }, { value: "qualificados", label: "Qualificados", statuses: ["QUALIFIED"] }]),
          statusFilter<LeadRow>("leads", "status", { server: true }),
        ]}
        rowActions={(row) => (
          <>
            {canEdit(row) && <DropdownMenuItem onSelect={() => setEditing({ lead: row })}><Pencil size={14} aria-hidden /> Editar</DropdownMenuItem>}
            {canConvert && row.status !== "CONVERTED" && <DropdownMenuItem onSelect={() => setToCustomer(row)}><UserCheck size={14} aria-hidden /> Converter em cliente</DropdownMenuItem>}
            {canConvert && <DropdownMenuItem onSelect={() => setToOpportunity(row)}><Handshake size={14} aria-hidden /> Converter em oportunidade</DropdownMenuItem>}
            {canActivity && <DropdownMenuItem onSelect={() => setActivityFor(row)}><CalendarPlus size={14} aria-hidden /> Registrar atividade</DropdownMenuItem>}
          </>
        )}
        detail={{
          title: (row) => row.name,
          subtitle: (row) => row.company_name ?? undefined,
          badges: (row) => <StatusBadge entity="leads" status={row.status} />,
          sections: [
            {
              title: "Contato",
              fields: [
                { label: "E-mail", value: (row) => row.email || "—" },
                { label: "Telefone", value: (row) => row.phone || "—" },
                { label: "CPF/CNPJ", value: (row) => row.document || "—" },
                { label: "Empresa", value: (row) => row.company_name || "—" },
              ],
            },
            {
              title: "Comercial",
              fields: [
                { label: "Origem", value: (row) => (row.origin_id ? origins.get(row.origin_id) ?? "—" : "—") },
                { label: "Qualificação", value: (row) => (row.qualification ? LEAD_QUALIFICATION_LABELS[row.qualification] : "—") },
                ...(lookups.canUsers ? [{ label: "Responsável", value: (row: LeadRow) => (row.responsible_user_id ? users.get(row.responsible_user_id) ?? "—" : "—") }] : []),
                { label: "Cliente gerado", value: (row) => (row.converted_customer_id ? customers.get(row.converted_customer_id) ?? "Cliente cadastrado" : "—") },
                { label: "Motivo da desqualificação", value: (row) => row.disqualify_reason || "—", span: 2 },
                { label: "Observações", value: (row) => row.notes || "—", span: 2 },
              ],
            },
          ],
          render: (row) => <RelatedActivities type="lead" id={row.id} refresh={refresh} />,
          actions,
        }}
        emptyDescription={canCreate ? "Nenhum lead ainda. Use “Novo lead” para cadastrar o primeiro." : "Quando houver registros, eles aparecem aqui."}
      />

      <LeadDialog open={editing !== null} lead={editing?.lead ?? null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      <ConfirmDialog
        open={toCustomer !== null}
        title={`Converter ${toCustomer?.code ?? ""} em cliente?`}
        description="Se já existir cliente com o mesmo CPF/CNPJ (com ou sem pontuação), ele é reaproveitado; senão, um cliente novo é cadastrado com os dados do lead. O lead fica Convertido e não pode mais ser editado. O representante de vendas do cliente não é preenchido automaticamente."
        confirmLabel="Converter em cliente"
        loading={converting}
        onConfirm={convertToCustomer}
        onCancel={() => setToCustomer(null)}
      />
      <ConvertLeadToOpportunityDialog open={toOpportunity !== null} lead={toOpportunity} onClose={() => setToOpportunity(null)} onDone={() => { setToOpportunity(null); reload(); }} />
      <ActivityDialog
        open={activityFor !== null}
        activity={null}
        related={activityFor ? { type: "lead", id: activityFor.id, label: `${activityFor.code} · ${activityFor.name}` } : undefined}
        onClose={() => setActivityFor(null)}
        onSaved={() => { setActivityFor(null); reload(); }}
      />
    </>
  );
}
