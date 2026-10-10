import type { ActivityRow, LeadRow, OpportunityRow } from "@/lib/database/schema";

// Formulários do CRM: validação no navegador (espelha os schemas Zod de
// src/lib/validations/crm.ts — o servidor continua sendo a autoridade) e
// montagem do corpo enviado às rotas /api/leads, /api/opportunities e
// /api/activities. Nenhuma regra nova: só o que a API já aceita.

export type Errors<K extends string> = Partial<Record<K, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blank = (v: string | null | undefined) => !v || !v.trim();
const opt = (v: string) => (v.trim() ? v.trim() : undefined);

export const LEAD_STATUS_OPTIONS = [
  { value: "NEW", label: "Novo" },
  { value: "CONTACTED", label: "Contatado" },
  { value: "QUALIFIED", label: "Qualificado" },
  { value: "DISQUALIFIED", label: "Desqualificado" },
] as const;
export const QUALIFICATION_OPTIONS = [
  { value: "COLD", label: "Frio" },
  { value: "WARM", label: "Morno" },
  { value: "HOT", label: "Quente" },
] as const;
export const ACTIVITY_TYPE_OPTIONS = [
  { value: "CALL", label: "Ligação" },
  { value: "MEETING", label: "Reunião" },
  { value: "TASK", label: "Tarefa" },
  { value: "CONTACT", label: "Contato" },
  { value: "FOLLOW_UP", label: "Retorno" },
  { value: "NOTE", label: "Anotação" },
] as const;

// ------------------------------------------------------------------ lead
export type LeadForm = {
  name: string;
  companyName: string;
  document: string;
  email: string;
  phone: string;
  originId: string;
  responsibleUserId: string;
  qualification: string;
  status: string;
  disqualifyReason: string;
  notes: string;
};

export const emptyLeadForm = (): LeadForm => ({ name: "", companyName: "", document: "", email: "", phone: "", originId: "", responsibleUserId: "", qualification: "", status: "NEW", disqualifyReason: "", notes: "" });

export const leadFormFromRow = (row: LeadRow): LeadForm => ({
  name: row.name,
  companyName: row.company_name ?? "",
  document: row.document ?? "",
  email: row.email ?? "",
  phone: row.phone ?? "",
  originId: row.origin_id ?? "",
  responsibleUserId: row.responsible_user_id ?? "",
  qualification: row.qualification ?? "",
  status: row.status,
  disqualifyReason: row.disqualify_reason ?? "",
  notes: row.notes ?? "",
});

export function validateLead(f: LeadForm): Errors<keyof LeadForm> {
  const e: Errors<keyof LeadForm> = {};
  if (blank(f.name)) e.name = "Informe o nome do lead.";
  if (!blank(f.email) && !EMAIL.test(f.email.trim())) e.email = "E-mail inválido.";
  return e;
}

/** Corpo do POST (criação) ou do PATCH (edição: inclui situação e motivo). */
export function leadPayload(f: LeadForm, mode: "create" | "edit") {
  const base = {
    name: f.name.trim(),
    companyName: opt(f.companyName),
    document: opt(f.document),
    email: f.email.trim(),
    phone: opt(f.phone),
    originId: f.originId,
    responsibleUserId: f.responsibleUserId,
    qualification: f.qualification || undefined,
    notes: opt(f.notes),
  };
  if (mode === "create") return base;
  return { ...base, status: f.status, disqualifyReason: f.status === "DISQUALIFIED" ? opt(f.disqualifyReason) : undefined };
}

// ----------------------------------------------------------- oportunidade
export type OpportunityForm = {
  title: string;
  pipelineId: string;
  stageId: string;
  customerId: string;
  estimatedValue: string;
  probability: string;
  expectedCloseDate: string;
  ownerUserId: string;
  notes: string;
};

export const emptyOpportunityForm = (pipelineId = "", stageId = ""): OpportunityForm => ({ title: "", pipelineId, stageId, customerId: "", estimatedValue: "", probability: "", expectedCloseDate: "", ownerUserId: "", notes: "" });

export const opportunityFormFromRow = (row: OpportunityRow): OpportunityForm => ({
  title: row.title,
  pipelineId: row.pipeline_id,
  stageId: row.stage_id,
  customerId: row.customer_id ?? "",
  estimatedValue: row.estimated_value != null ? String(row.estimated_value) : "",
  probability: row.probability != null ? String(row.probability) : "",
  expectedCloseDate: row.expected_close_date ?? "",
  ownerUserId: row.owner_user_id ?? "",
  notes: row.notes ?? "",
});

/** Aceita "1.234,56", "1234,56" e "1234.56". Vazio → undefined; inválido → NaN. */
export function parseDecimal(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

export function validateOpportunity(f: OpportunityForm, mode: "create" | "edit"): Errors<keyof OpportunityForm> {
  const e: Errors<keyof OpportunityForm> = {};
  if (blank(f.title)) e.title = "Informe o título da oportunidade.";
  if (mode === "create" && !f.pipelineId) e.pipelineId = "Selecione o pipeline.";
  if (mode === "create" && !f.stageId) e.stageId = "Selecione o estágio.";
  const value = parseDecimal(f.estimatedValue);
  if (value !== undefined && (Number.isNaN(value) || value < 0)) e.estimatedValue = "Informe um valor maior ou igual a zero.";
  const prob = parseDecimal(f.probability);
  if (prob !== undefined && (Number.isNaN(prob) || prob < 0 || prob > 100)) e.probability = "Informe uma probabilidade de 0 a 100.";
  return e;
}

export function opportunityPayload(f: OpportunityForm, mode: "create" | "edit") {
  const base = {
    title: f.title.trim(),
    customerId: f.customerId,
    estimatedValue: parseDecimal(f.estimatedValue),
    probability: parseDecimal(f.probability),
    expectedCloseDate: f.expectedCloseDate,
    ownerUserId: f.ownerUserId,
    notes: opt(f.notes),
  };
  // pipeline e estágio só na criação: depois, o estágio muda por "Mudar estágio" (histórico).
  return mode === "create" ? { ...base, pipelineId: f.pipelineId, stageId: f.stageId } : base;
}

// ------------------------------------------------------------- atividade
export type ActivityForm = {
  activityType: string;
  subject: string;
  description: string;
  relatedType: string;
  relatedId: string;
  dueDate: string;
  ownerUserId: string;
};

export const emptyActivityForm = (relatedType = "", relatedId = ""): ActivityForm => ({ activityType: "CALL", subject: "", description: "", relatedType, relatedId, dueDate: "", ownerUserId: "" });

export const activityFormFromRow = (row: ActivityRow): ActivityForm => ({
  activityType: row.activity_type,
  subject: row.subject,
  description: row.description ?? "",
  relatedType: row.related_type,
  relatedId: row.related_id,
  dueDate: row.due_date ? row.due_date.slice(0, 10) : "",
  ownerUserId: row.owner_user_id ?? "",
});

export function validateActivity(f: ActivityForm, mode: "create" | "edit"): Errors<keyof ActivityForm> {
  const e: Errors<keyof ActivityForm> = {};
  if (blank(f.subject)) e.subject = "Informe o assunto.";
  if (mode === "create") {
    if (!f.activityType) e.activityType = "Selecione o tipo.";
    if (!f.relatedType) e.relatedType = "Selecione a que a atividade se refere.";
    if (!f.relatedId) e.relatedId = "Selecione o registro relacionado.";
  }
  return e;
}

export function activityPayload(f: ActivityForm, mode: "create" | "edit") {
  const base = { subject: f.subject.trim(), description: opt(f.description), dueDate: f.dueDate, ownerUserId: f.ownerUserId };
  return mode === "create" ? { ...base, activityType: f.activityType, relatedType: f.relatedType, relatedId: f.relatedId } : base;
}

export const hasErrors = (e: Record<string, string | undefined>) => Object.values(e).some(Boolean);
