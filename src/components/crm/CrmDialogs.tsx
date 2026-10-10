"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Controls";
import { DatePicker } from "@/components/ui/DatePicker";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { apiGet, apiSend } from "@/lib/api-client";
import type { ActivityRow, LeadRow, OpportunityRow, PipelineRow, PipelineStageRow } from "@/lib/database/schema";
import {
  ACTIVITY_TYPE_OPTIONS,
  LEAD_STATUS_OPTIONS,
  QUALIFICATION_OPTIONS,
  activityFormFromRow,
  activityPayload,
  emptyActivityForm,
  emptyLeadForm,
  emptyOpportunityForm,
  hasErrors,
  leadFormFromRow,
  leadPayload,
  opportunityFormFromRow,
  opportunityPayload,
  validateActivity,
  validateLead,
  validateOpportunity,
  type ActivityForm,
  type Errors,
  type LeadForm,
  type OpportunityForm,
} from "@/lib/crm/forms";

// Diálogos operacionais do CRM. Cada um chama uma rota que já existe e está
// protegida no servidor (src/lib/api/crm-handlers.ts); a tela só mostra a
// ação para quem tem a permissão, e as listas auxiliares só são lidas por
// quem pode lê-las (sem 403 na tela). O botão de envio fica bloqueado
// enquanto a requisição está em andamento (sem envio duplicado).

export type PipelineWithStages = PipelineRow & { pipeline_stages: PipelineStageRow[] };

const NONE: SelectOption = { value: "", label: "—" };

/** Lista para <Select> a partir de uma rota de listagem, só se `enabled`. */
function useOptions(path: string | null, label: (row: Record<string, unknown>) => string): SelectOption[] {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    apiGet<Record<string, unknown>[]>(path)
      .then((data) => !cancelled && setRows(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return useMemo(() => rows.map((r) => ({ value: String(r.id), label: label(r) })), [rows, label]);
}

const userLabel = (r: Record<string, unknown>) => String(r.nome ?? r.name ?? r.email ?? r.id);
const originLabel = (r: Record<string, unknown>) => String(r.name ?? r.code ?? r.id);
const customerLabel = (r: Record<string, unknown>) => String(r.nome ?? r.name ?? r.id);

/** `refresh`: muda depois de uma ação (ex.: conversão que cria cliente) para reler os cadastros. */
export function useCrmLookups(refresh = 0) {
  const { can } = useSession();
  const users = useOptions(can("users.read") ? "/api/users?pageSize=500" : null, userLabel);
  const origins = useOptions(can("lead_origins.view") ? "/api/lead-origins" : null, originLabel);
  const customers = useOptions(can("customers.read") ? `/api/customers?pageSize=500${refresh ? `&v=${refresh}` : ""}` : null, customerLabel);
  const [pipelines, setPipelines] = useState<PipelineWithStages[]>([]);
  const canPipelines = can("pipelines.view");
  useEffect(() => {
    if (!canPipelines) return;
    let cancelled = false;
    apiGet<PipelineWithStages[]>("/api/pipelines")
      .then((data) => !cancelled && setPipelines(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setPipelines([]));
    return () => {
      cancelled = true;
    };
  }, [canPipelines]);
  return { users, origins, customers, pipelines, canUsers: can("users.read"), canOrigins: can("lead_origins.view"), canCustomers: can("customers.read"), canPipelines };
}

const stagesOf = (pipelines: PipelineWithStages[], pipelineId: string): SelectOption[] =>
  [...(pipelines.find((p) => p.id === pipelineId)?.pipeline_stages ?? [])].sort((a, b) => a.sequence - b.sequence).map((s) => ({ value: s.id, label: s.name }));

function useSubmit() {
  const [saving, setSaving] = useState(false);
  async function run(fn: () => Promise<void>, failure: string) {
    if (saving) return;
    setSaving(true);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setSaving(false);
    }
  }
  return { saving, run };
}

// ================================================================== lead
export function LeadDialog({ open, lead, onClose, onSaved }: { open: boolean; lead: LeadRow | null; onClose: () => void; onSaved: (row: LeadRow) => void }) {
  const lookups = useCrmLookups();
  const mode = lead ? "edit" : "create";
  const [form, setForm] = useState<LeadForm>(emptyLeadForm());
  const [errors, setErrors] = useState<Errors<keyof LeadForm>>({});
  const { saving, run } = useSubmit();
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(lead ? leadFormFromRow(lead) : emptyLeadForm());
    setErrors({});
  }, [open, lead]);
  const set = <K extends keyof LeadForm>(k: K, v: LeadForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    const found = validateLead(form);
    setErrors(found);
    if (hasErrors(found)) return;
    void run(async () => {
      const saved = lead
        ? await apiSend<LeadRow>(`/api/leads/${lead.id}`, "PATCH", leadPayload(form, "edit"))
        : await apiSend<LeadRow>("/api/leads", "POST", leadPayload(form, "create"));
      toast.success(lead ? `Lead ${saved.code} atualizado.` : `Lead ${saved.code} criado.`);
      onSaved(saved);
    }, "Não foi possível salvar o lead.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={mode === "create" ? "Novo lead" : `Editar lead ${lead?.code ?? ""}`}
      description={mode === "create" ? "O lead nasce como Novo. Ele vira cliente ou oportunidade pelas ações de conversão." : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>{mode === "create" ? "Criar lead" : "Salvar"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Nome do contato" required error={errors.name} className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} invalid={!!errors.name} autoFocus />
        </FormField>
        <FormField label="Empresa">
          <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
        </FormField>
        <FormField label="CPF/CNPJ" help="Necessário para converter em cliente.">
          <Input value={form.document} onChange={(e) => set("document", e.target.value)} inputMode="numeric" />
        </FormField>
        <FormField label="E-mail" error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={!!errors.email} />
        </FormField>
        <FormField label="Telefone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
        </FormField>
        {lookups.canOrigins && (
          <FormField label="Origem" help={lookups.origins.length === 0 ? "Nenhuma origem cadastrada." : undefined}>
            <Select value={form.originId} onValueChange={(v) => set("originId", v)} options={[NONE, ...lookups.origins]} aria-label="Origem" />
          </FormField>
        )}
        <FormField label="Qualificação">
          <Select value={form.qualification} onValueChange={(v) => set("qualification", v)} options={[NONE, ...QUALIFICATION_OPTIONS]} aria-label="Qualificação" />
        </FormField>
        {lookups.canUsers && (
          <FormField label="Responsável">
            <Select value={form.responsibleUserId} onValueChange={(v) => set("responsibleUserId", v)} options={[NONE, ...lookups.users]} aria-label="Responsável" />
          </FormField>
        )}
        {mode === "edit" && (
          <FormField label="Situação" help="Convertido só pelas ações de conversão.">
            <Select value={form.status} onValueChange={(v) => set("status", v)} options={[...LEAD_STATUS_OPTIONS]} aria-label="Situação" />
          </FormField>
        )}
        {mode === "edit" && form.status === "DISQUALIFIED" && (
          <FormField label="Motivo da desqualificação" className="sm:col-span-2">
            <Input value={form.disqualifyReason} onChange={(e) => set("disqualifyReason", e.target.value)} />
          </FormField>
        )}
        <FormField label="Observações" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
        </FormField>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------ lead → oportunidade
export function ConvertLeadToOpportunityDialog({ open, lead, onClose, onDone }: { open: boolean; lead: LeadRow | null; onClose: () => void; onDone: (opp: OpportunityRow) => void }) {
  const { pipelines, canPipelines } = useCrmLookups();
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { saving, run } = useSubmit();
  useEffect(() => {
    if (!open) return;
    const first = pipelines[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPipelineId(first?.id ?? "");
    setStageId(first ? (stagesOf(pipelines, first.id)[0]?.value ?? "") : "");
    setTitle(lead?.company_name ? `${lead.company_name}` : (lead?.name ?? ""));
    setValue("");
    setErrors({});
  }, [open, lead, pipelines]);

  function submit() {
    if (!lead) return;
    const found: Record<string, string> = {};
    if (!pipelineId) found.pipelineId = "Selecione o pipeline.";
    if (!stageId) found.stageId = "Selecione o estágio.";
    const n = value.trim() ? Number(value.replace(/\./g, "").replace(",", ".")) : undefined;
    if (n !== undefined && (Number.isNaN(n) || n < 0)) found.value = "Informe um valor maior ou igual a zero.";
    setErrors(found);
    if (Object.keys(found).length) return;
    void run(async () => {
      const opp = await apiSend<OpportunityRow>(`/api/leads/${lead.id}/convert-to-opportunity`, "POST", { pipelineId, stageId, title: title.trim() || undefined, estimatedValue: n });
      toast.success(`Oportunidade ${opp.code} criada a partir do lead ${lead.code}.`);
      onDone(opp);
    }, "Não foi possível converter o lead.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={`Converter ${lead?.code ?? "lead"} em oportunidade`}
      description="A oportunidade nasce aberta, no estágio escolhido. Um lead Novo passa a Qualificado. Se o lead já virou cliente, a oportunidade já vem com o cliente."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving} disabled={!canPipelines || pipelines.length === 0}>Criar oportunidade</Button>
        </>
      }
    >
      {!canPipelines || pipelines.length === 0 ? (
        <Alert tone="warning" title="Nenhum pipeline disponível">
          Para criar oportunidades é preciso ao menos um pipeline com estágios, cadastrado por quem tem a permissão de configurar o funil.
        </Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Pipeline" required error={errors.pipelineId}>
            <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(stagesOf(pipelines, v)[0]?.value ?? ""); }} options={pipelines.map((p) => ({ value: p.id, label: p.name }))} aria-label="Pipeline" />
          </FormField>
          <FormField label="Estágio" required error={errors.stageId}>
            <Select value={stageId} onValueChange={setStageId} options={stagesOf(pipelines, pipelineId)} aria-label="Estágio" />
          </FormField>
          <FormField label="Título" help="Se vazio, usa o nome do lead." className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </FormField>
          <FormField label="Valor estimado (R$)" error={errors.value}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}

// ========================================================= oportunidade
export function OpportunityDialog({ open, opportunity, onClose, onSaved }: { open: boolean; opportunity: OpportunityRow | null; onClose: () => void; onSaved: (row: OpportunityRow) => void }) {
  const lookups = useCrmLookups();
  const mode = opportunity ? "edit" : "create";
  const [form, setForm] = useState<OpportunityForm>(emptyOpportunityForm());
  const [errors, setErrors] = useState<Errors<keyof OpportunityForm>>({});
  const { saving, run } = useSubmit();
  useEffect(() => {
    if (!open) return;
    const first = lookups.pipelines[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(opportunity ? opportunityFormFromRow(opportunity) : emptyOpportunityForm(first?.id ?? "", first ? (stagesOf(lookups.pipelines, first.id)[0]?.value ?? "") : ""));
    setErrors({});
  }, [open, opportunity, lookups.pipelines]);
  const set = <K extends keyof OpportunityForm>(k: K, v: OpportunityForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    const found = validateOpportunity(form, mode);
    setErrors(found);
    if (hasErrors(found)) return;
    void run(async () => {
      const saved = opportunity
        ? await apiSend<OpportunityRow>(`/api/opportunities/${opportunity.id}`, "PATCH", opportunityPayload(form, "edit"))
        : await apiSend<OpportunityRow>("/api/opportunities", "POST", opportunityPayload(form, "create"));
      toast.success(opportunity ? `Oportunidade ${saved.code} atualizada.` : `Oportunidade ${saved.code} criada.`);
      onSaved(saved);
    }, "Não foi possível salvar a oportunidade.");
  }

  const noPipeline = mode === "create" && (!lookups.canPipelines || lookups.pipelines.length === 0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={mode === "create" ? "Nova oportunidade" : `Editar oportunidade ${opportunity?.code ?? ""}`}
      description={mode === "edit" ? "O estágio muda pela ação Mudar estágio (fica no histórico)." : undefined}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving} disabled={noPipeline}>{mode === "create" ? "Criar oportunidade" : "Salvar"}</Button>
        </>
      }
    >
      {noPipeline ? (
        <Alert tone="warning" title="Nenhum pipeline disponível">Para criar oportunidades é preciso ao menos um pipeline com estágios.</Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Título" required error={errors.title} className="sm:col-span-2">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} invalid={!!errors.title} autoFocus />
          </FormField>
          {mode === "create" && (
            <>
              <FormField label="Pipeline" required error={errors.pipelineId}>
                <Select value={form.pipelineId} onValueChange={(v) => setForm((f) => ({ ...f, pipelineId: v, stageId: stagesOf(lookups.pipelines, v)[0]?.value ?? "" }))} options={lookups.pipelines.map((p) => ({ value: p.id, label: p.name }))} aria-label="Pipeline" />
              </FormField>
              <FormField label="Estágio" required error={errors.stageId}>
                <Select value={form.stageId} onValueChange={(v) => set("stageId", v)} options={stagesOf(lookups.pipelines, form.pipelineId)} aria-label="Estágio" />
              </FormField>
            </>
          )}
          {lookups.canCustomers && (
            <FormField label="Cliente" help="Necessário para gerar orçamento ou pedido.">
              <Select value={form.customerId} onValueChange={(v) => set("customerId", v)} options={[NONE, ...lookups.customers]} aria-label="Cliente" />
            </FormField>
          )}
          {lookups.canUsers && (
            <FormField label="Responsável">
              <Select value={form.ownerUserId} onValueChange={(v) => set("ownerUserId", v)} options={[NONE, ...lookups.users]} aria-label="Responsável" />
            </FormField>
          )}
          <FormField label="Valor estimado (R$)" error={errors.estimatedValue}>
            <Input value={form.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value)} inputMode="decimal" placeholder="0,00" invalid={!!errors.estimatedValue} />
          </FormField>
          <FormField label="Probabilidade (%)" error={errors.probability}>
            <Input value={form.probability} onChange={(e) => set("probability", e.target.value)} inputMode="numeric" placeholder="0 a 100" invalid={!!errors.probability} />
          </FormField>
          <FormField label="Previsão de fechamento">
            <DatePicker value={form.expectedCloseDate} onChange={(v) => set("expectedCloseDate", v)} aria-label="Previsão de fechamento" />
          </FormField>
          <FormField label="Observações" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </FormField>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------- mudar estágio
export function MoveStageDialog({ open, opportunity, onClose, onDone }: { open: boolean; opportunity: OpportunityRow | null; onClose: () => void; onDone: (row: OpportunityRow) => void }) {
  const { pipelines } = useCrmLookups();
  const [stageId, setStageId] = useState("");
  const { saving, run } = useSubmit();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setStageId("");
  }, [open]);
  const options = opportunity ? stagesOf(pipelines, opportunity.pipeline_id).filter((s) => s.value !== opportunity.stage_id) : [];
  function submit() {
    if (!opportunity || !stageId) return;
    void run(async () => {
      const row = await apiSend<OpportunityRow>(`/api/opportunities/${opportunity.id}/move-stage`, "POST", { stageId });
      toast.success(`Oportunidade ${row.code} movida.`);
      onDone(row);
    }, "Não foi possível mudar o estágio.");
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={`Mudar estágio de ${opportunity?.code ?? ""}`}
      description="A passagem fica registrada no histórico de estágios."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving} disabled={!stageId}>Mudar estágio</Button>
        </>
      }
    >
      <FormField label="Novo estágio" required>
        <Select value={stageId} onValueChange={setStageId} options={options} aria-label="Novo estágio" placeholder={options.length ? "Selecione" : "Nenhum outro estágio neste pipeline"} />
      </FormField>
    </Dialog>
  );
}

// ------------------------------------------------- fechar (ganha/perdida)
export function CloseOpportunityDialog({ open, opportunity, outcome, onClose, onDone }: { open: boolean; opportunity: OpportunityRow | null; outcome: "WON" | "LOST"; onClose: () => void; onDone: (row: OpportunityRow) => void }) {
  const [reason, setReason] = useState("");
  const { saving, run } = useSubmit();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setReason("");
  }, [open]);
  function submit() {
    if (!opportunity) return;
    void run(async () => {
      const row = await apiSend<OpportunityRow>(`/api/opportunities/${opportunity.id}/close`, "POST", { outcome, lostReason: outcome === "LOST" ? reason.trim() || undefined : undefined });
      toast.success(outcome === "WON" ? `Oportunidade ${row.code} ganha.` : `Oportunidade ${row.code} marcada como perdida.`);
      onDone(row);
    }, "Não foi possível encerrar a oportunidade.");
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={outcome === "WON" ? `Marcar ${opportunity?.code ?? ""} como ganha` : `Marcar ${opportunity?.code ?? ""} como perdida`}
      description="Depois de encerrada, a oportunidade não pode mais ser editada nem mudar de estágio. Encerrar não gera orçamento nem pedido."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant={outcome === "LOST" ? "danger" : "primary"} onClick={submit} loading={saving}>{outcome === "WON" ? "Marcar como ganha" : "Marcar como perdida"}</Button>
        </>
      }
    >
      {outcome === "LOST" ? (
        <FormField label="Motivo da perda">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </FormField>
      ) : (
        <p className="text-sm text-muted-foreground">A probabilidade passa a 100%.</p>
      )}
    </Dialog>
  );
}

// ============================================================ atividade
export function ActivityDialog({
  open,
  activity,
  related,
  onClose,
  onSaved,
}: {
  open: boolean;
  activity: ActivityRow | null;
  /** Atividade criada a partir de um lead/oportunidade/cliente (vínculo fixo). */
  related?: { type: "lead" | "opportunity" | "customer"; id: string; label: string };
  onClose: () => void;
  onSaved: (row: ActivityRow) => void;
}) {
  const { can } = useSession();
  const lookups = useCrmLookups();
  const mode = activity ? "edit" : "create";
  const [form, setForm] = useState<ActivityForm>(emptyActivityForm());
  const [errors, setErrors] = useState<Errors<keyof ActivityForm>>({});
  const { saving, run } = useSubmit();
  const leads = useOptions(open && !related && mode === "create" && can("leads.view") ? "/api/leads" : null, (r) => `${r.code} · ${r.name}`);
  const opps = useOptions(open && !related && mode === "create" && can("opportunities.view") ? "/api/opportunities?status=OPEN" : null, (r) => `${r.code} · ${r.title}`);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(activity ? activityFormFromRow(activity) : emptyActivityForm(related?.type ?? "", related?.id ?? ""));
    setErrors({});
  }, [open, activity, related]);
  const set = <K extends keyof ActivityForm>(k: K, v: ActivityForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const relatedOptions: SelectOption[] = [
    ...(can("leads.view") ? [{ value: "lead", label: "Lead" }] : []),
    ...(can("opportunities.view") ? [{ value: "opportunity", label: "Oportunidade" }] : []),
    ...(lookups.canCustomers ? [{ value: "customer", label: "Cliente" }] : []),
  ];
  const recordOptions = form.relatedType === "lead" ? leads : form.relatedType === "opportunity" ? opps : form.relatedType === "customer" ? lookups.customers : [];

  function submit() {
    const found = validateActivity(form, mode);
    setErrors(found);
    if (hasErrors(found)) return;
    void run(async () => {
      const saved = activity
        ? await apiSend<ActivityRow>(`/api/activities/${activity.id}`, "PATCH", activityPayload(form, "edit"))
        : await apiSend<ActivityRow>("/api/activities", "POST", activityPayload(form, "create"));
      toast.success(activity ? "Atividade atualizada." : "Atividade registrada.");
      onSaved(saved);
    }, "Não foi possível salvar a atividade.");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !saving && onClose()}
      title={mode === "create" ? (related ? `Registrar atividade — ${related.label}` : "Nova atividade") : "Editar atividade"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={submit} loading={saving}>{mode === "create" ? "Registrar" : "Salvar"}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "create" && (
          <FormField label="Tipo" required error={errors.activityType}>
            <Select value={form.activityType} onValueChange={(v) => set("activityType", v)} options={[...ACTIVITY_TYPE_OPTIONS]} aria-label="Tipo" />
          </FormField>
        )}
        <FormField label="Prazo">
          <DatePicker value={form.dueDate} onChange={(v) => set("dueDate", v)} aria-label="Prazo" />
        </FormField>
        <FormField label="Assunto" required error={errors.subject} className="sm:col-span-2">
          <Input value={form.subject} onChange={(e) => set("subject", e.target.value)} invalid={!!errors.subject} autoFocus />
        </FormField>
        {mode === "create" && !related && (
          <>
            <FormField label="Relacionada a" required error={errors.relatedType}>
              <Select value={form.relatedType} onValueChange={(v) => setForm((f) => ({ ...f, relatedType: v, relatedId: "" }))} options={relatedOptions} aria-label="Relacionada a" />
            </FormField>
            <FormField label="Registro" required error={errors.relatedId}>
              <Select value={form.relatedId} onValueChange={(v) => set("relatedId", v)} options={recordOptions} aria-label="Registro" placeholder={form.relatedType ? "Selecione" : "Escolha o tipo antes"} disabled={!form.relatedType} />
            </FormField>
          </>
        )}
        {lookups.canUsers && (
          <FormField label="Responsável">
            <Select value={form.ownerUserId} onValueChange={(v) => set("ownerUserId", v)} options={[NONE, ...lookups.users]} aria-label="Responsável" />
          </FormField>
        )}
        <FormField label="Descrição" className="sm:col-span-2">
          <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} />
        </FormField>
      </div>
    </Dialog>
  );
}

/** Atividades de um lead/oportunidade/cliente, para o painel de detalhe. */
export function RelatedActivities({ type, id, refresh }: { type: "lead" | "opportunity" | "customer"; id: string; refresh: number }) {
  const { can } = useSession();
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = can("activities.view");
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    apiGet<ActivityRow[]>(`/api/activities?relatedType=${type}&relatedId=${id}`)
      .then((data) => !cancelled && setRows(data))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Não foi possível carregar as atividades."));
    return () => {
      cancelled = true;
    };
  }, [allowed, type, id, refresh]);
  if (!allowed) return null;
  const typeLabel = (code: string) => ACTIVITY_TYPE_OPTIONS.find((o) => o.value === code)?.label ?? code;
  return (
    <section aria-label="Atividades" className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-label uppercase text-subtle-foreground">Atividades</h3>
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : rows === null ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((a) => (
            <li key={a.id} className="rounded-md border border-border-subtle px-3 py-2 text-sm">
              <span className="font-medium">{typeLabel(a.activity_type)}</span> · {a.subject}
              <span className="block text-xs text-muted-foreground">
                {a.status === "DONE" ? "Realizada" : a.status === "CANCELLED" ? "Cancelada" : "Pendente"}
                {a.due_date ? ` · prazo ${new Date(a.due_date).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
