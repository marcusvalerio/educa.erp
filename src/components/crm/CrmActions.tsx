"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Plus, Target, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { FormDialog, num, opt, type FieldDef, type LookupSource } from "@/components/forms/FormDialog";
import { SOURCES } from "@/components/forms/sources";
import { apiSend } from "@/lib/api-client";
import { invalidateCache, useCached } from "@/lib/dashboard/client";

// Botões do CRM: cadastrar lead e oportunidade, converter lead e registrar
// atividades. Toda regra fica na API/banco (crm-handlers).

type Stage = { id: string; name: string; sequence: number; status: string; is_won: boolean; is_lost: boolean };
type Pipeline = { id: string; name: string; status: string; pipeline_stages?: Stage[] };

const ORIGINS: LookupSource = { path: "/api/lead-origins", nameField: "name", filter: (r) => (r.status ?? "active") === "active" };
const LEADS: LookupSource = { path: "/api/leads", nameField: "name" };

/** Estágios abertos de todos os funis, para escolher onde a oportunidade entra. */
function useStages() {
  const pipelines = useCached<Pipeline[]>("/api/pipelines");
  return useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const pipelineOf = new Map<string, string>();
    for (const p of pipelines.data ?? []) {
      if (p.status !== "active") continue;
      for (const s of [...(p.pipeline_stages ?? [])].sort((a, b) => a.sequence - b.sequence)) {
        if (s.status !== "active" || s.is_won || s.is_lost) continue;
        options.push({ value: s.id, label: `${p.name} › ${s.name}` });
        pipelineOf.set(s.id, p.id);
      }
    }
    return { options, pipelineOf, loading: pipelines.loading };
  }, [pipelines.data, pipelines.loading]);
}

const QUALIFICATION = [
  { value: "COLD", label: "Frio" },
  { value: "WARM", label: "Morno" },
  { value: "HOT", label: "Quente" },
];

const LEAD_FIELDS: FieldDef[] = [
  { key: "name", label: "Nome do contato", type: "text", required: true },
  { key: "companyName", label: "Empresa", type: "text" },
  { key: "document", label: "CNPJ/CPF", type: "text" },
  { key: "email", label: "E-mail", type: "text" },
  { key: "phone", label: "Telefone", type: "text" },
  { key: "originId", label: "Origem", type: "lookup", source: ORIGINS },
  { key: "qualification", label: "Qualificação", type: "select", options: QUALIFICATION },
  { key: "notes", label: "Observações", type: "textarea" },
];

export function NewLeadButton({ onDone }: { onDone: () => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("leads.create")) return null;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden /> Novo lead
      </Button>
      {open && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title="Novo lead"
          description="Um contato interessado, ainda não cliente."
          submitLabel="Cadastrar lead"
          fields={LEAD_FIELDS}
          path="/api/leads"
          toBody={(v) => ({
            name: String(v.name).trim(),
            companyName: opt(v.companyName),
            document: opt(v.document),
            email: opt(v.email) ?? "",
            phone: opt(v.phone),
            originId: opt(v.originId),
            qualification: opt(v.qualification),
            notes: opt(v.notes),
          })}
          onCreated={() => {
            toast.success("Lead cadastrado.");
            setOpen(false);
            onDone();
          }}
          size="md"
        />
      )}
    </>
  );
}

function opportunityFields(stages: { value: string; label: string }[], withLead: boolean): FieldDef[] {
  return [
    { key: "title", label: "Título", type: "text", required: true, placeholder: "Ex.: Fornecimento de cabos para obra" },
    { key: "stageId", label: "Estágio do funil", type: "select", required: true, options: stages, default: stages[0]?.value },
    ...(withLead ? [{ key: "customerId", label: "Cliente", type: "lookup", source: SOURCES.customers } as FieldDef, { key: "leadId", label: "Lead", type: "lookup", source: LEADS } as FieldDef] : []),
    { key: "estimatedValue", label: "Valor estimado (R$)", type: "money" },
    { key: "probability", label: "Probabilidade (%)", type: "number", min: 0 },
    { key: "expectedCloseDate", label: "Previsão de fechamento", type: "date" },
    { key: "notes", label: "Observações", type: "textarea" },
  ];
}

export function NewOpportunityButton({ onDone }: { onDone: () => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  const stages = useStages();
  if (!can("opportunities.create")) return null;
  return (
    <>
      <Button size="sm" onClick={() => (stages.options.length === 0 ? toast.error("Nenhum funil de vendas ativo.", "Cadastre um funil com estágios no Pipeline.") : setOpen(true))}>
        <Plus size={14} aria-hidden /> Nova oportunidade
      </Button>
      {open && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title="Nova oportunidade"
          description="Uma venda em negociação, com valor e previsão."
          submitLabel="Cadastrar oportunidade"
          fields={opportunityFields(stages.options, true)}
          path="/api/opportunities"
          toBody={(v) => ({
            title: String(v.title).trim(),
            stageId: v.stageId,
            pipelineId: stages.pipelineOf.get(String(v.stageId)),
            customerId: opt(v.customerId),
            leadId: opt(v.leadId),
            estimatedValue: opt(v.estimatedValue) ? num(v.estimatedValue) : undefined,
            probability: opt(v.probability) ? num(v.probability) : undefined,
            expectedCloseDate: opt(v.expectedCloseDate),
            notes: opt(v.notes),
          })}
          validate={(v) => (num(v.probability) > 100 ? "A probabilidade vai de 0 a 100." : null)}
          invalidate={["/api/pipelines"]}
          onCreated={() => {
            toast.success("Oportunidade cadastrada.");
            setOpen(false);
            onDone();
          }}
          size="md"
        />
      )}
    </>
  );
}

/** No lead: converter em cliente ou em oportunidade e registrar atividade. */
export function LeadActions({ id, status, name, onDone }: { id: string; status: string; name: string; onDone: () => void }) {
  const { can } = useSession();
  const stages = useStages();
  const [mode, setMode] = useState<"customer" | "opportunity" | null>(null);
  const [busy, setBusy] = useState(false);
  const st = status.toUpperCase();
  const open = !["CONVERTED", "DISQUALIFIED"].includes(st);

  async function toCustomer() {
    setBusy(true);
    try {
      await apiSend(`/api/leads/${id}/convert-to-customer`, "POST", {});
      invalidateCache("/api/leads");
      invalidateCache("/api/customers");
      toast.success("Lead convertido em cliente.");
      setMode(null);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível converter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {open && can("leads.convert") && (
        <>
          <Button size="sm" variant="secondary" onClick={() => setMode("customer")}>
            <UserCheck size={14} aria-hidden /> Converter em cliente
          </Button>
          <Button size="sm" variant="secondary" onClick={() => (stages.options.length === 0 ? toast.error("Nenhum funil de vendas ativo.") : setMode("opportunity"))}>
            <Target size={14} aria-hidden /> Converter em oportunidade
          </Button>
        </>
      )}
      <NewActivityButton relatedType="lead" relatedId={id} onDone={onDone} />
      {mode === "customer" && (
        <ConfirmDialog
          open
          title="Converter em cliente?"
          description={`${name} vira um cliente cadastrado, com os dados do lead.`}
          confirmLabel="Converter"
          loading={busy}
          onConfirm={toCustomer}
          onCancel={() => setMode(null)}
        />
      )}
      {mode === "opportunity" && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setMode(null)}
          title="Converter em oportunidade"
          description={`Abre uma oportunidade para ${name} no funil.`}
          submitLabel="Converter"
          fields={[
            { key: "stageId", label: "Estágio do funil", type: "select", required: true, options: stages.options, default: stages.options[0]?.value },
            { key: "title", label: "Título", type: "text", default: name },
            { key: "estimatedValue", label: "Valor estimado (R$)", type: "money" },
          ]}
          path={`/api/leads/${id}/convert-to-opportunity`}
          toBody={(v) => ({
            stageId: v.stageId,
            pipelineId: stages.pipelineOf.get(String(v.stageId)),
            title: opt(v.title),
            estimatedValue: opt(v.estimatedValue) ? num(v.estimatedValue) : undefined,
          })}
          invalidate={["/api/leads", "/api/opportunities"]}
          onCreated={() => {
            toast.success("Oportunidade criada a partir do lead.");
            setMode(null);
            onDone();
          }}
          size="md"
        />
      )}
    </div>
  );
}

const ACTIVITY_TYPES = [
  { value: "CALL", label: "Ligação" },
  { value: "MEETING", label: "Reunião" },
  { value: "TASK", label: "Tarefa" },
  { value: "CONTACT", label: "Contato" },
  { value: "FOLLOW_UP", label: "Retorno (follow-up)" },
  { value: "NOTE", label: "Anotação" },
];

export function NewActivityButton({ relatedType, relatedId, onDone }: { relatedType: "lead" | "opportunity" | "customer"; relatedId: string; onDone: () => void }) {
  const { can } = useSession();
  const [open, setOpen] = useState(false);
  if (!can("activities.create")) return null;
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <CalendarPlus size={14} aria-hidden /> Registrar atividade
      </Button>
      {open && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setOpen(false)}
          title="Registrar atividade"
          description="Ligação, reunião, tarefa ou anotação ligada a este registro."
          submitLabel="Registrar"
          fields={[
            { key: "activityType", label: "Tipo", type: "select", required: true, options: ACTIVITY_TYPES, default: "CALL" },
            { key: "subject", label: "Assunto", type: "text", required: true },
            { key: "dueDate", label: "Prazo", type: "date" },
            { key: "description", label: "Descrição", type: "textarea" },
          ]}
          path="/api/activities"
          toBody={(v) => ({ activityType: v.activityType, subject: String(v.subject).trim(), relatedType, relatedId, dueDate: opt(v.dueDate), description: opt(v.description) })}
          onCreated={() => {
            toast.success("Atividade registrada.");
            setOpen(false);
            onDone();
          }}
          size="md"
        />
      )}
    </>
  );
}

/** Na atividade pendente: concluir ou cancelar. */
export function ActivityStatusButtons({ id, status, onDone }: { id: string; status: string; onDone: () => void }) {
  const { can } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  if (status.toUpperCase() !== "PENDING" || !can("activities.update")) return null;

  async function set(next: "DONE" | "CANCELLED") {
    setBusy(next);
    try {
      await apiSend(`/api/activities/${id}`, "PATCH", { status: next });
      invalidateCache("/api/activities");
      toast.success(next === "DONE" ? "Atividade concluída." : "Atividade cancelada.");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" loading={busy === "DONE"} disabled={busy !== null} onClick={() => set("DONE")}>
        Concluir
      </Button>
      <Button size="sm" variant="secondary" loading={busy === "CANCELLED"} disabled={busy !== null} onClick={() => set("CANCELLED")}>
        Cancelar
      </Button>
    </div>
  );
}
