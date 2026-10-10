// Formulários operacionais do CRM (validação no navegador e corpo enviado à
// API). Sem rede: o servidor continua validando com os schemas Zod — este
// teste também confere que o corpo montado PASSA nesses schemas.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  activityPayload,
  emptyActivityForm,
  emptyLeadForm,
  emptyOpportunityForm,
  leadPayload,
  opportunityPayload,
  parseDecimal,
  validateActivity,
  validateLead,
  validateOpportunity,
} from "@/lib/crm/forms";
import { activitySchema, leadSchema, opportunitySchema, updateActivitySchema, updateLeadSchema, updateOpportunitySchema } from "@/lib/validations/crm";

const P = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";

describe("CRM — formulário de lead", () => {
  test("nome obrigatório e e-mail válido", () => {
    assert.deepEqual(Object.keys(validateLead(emptyLeadForm())), ["name"]);
    assert.ok(validateLead({ ...emptyLeadForm(), name: "Maria", email: "maria@" }).email);
    assert.deepEqual(validateLead({ ...emptyLeadForm(), name: "Maria", email: "" }), {});
  });
  test("criação: corpo aceito pelo schema da API, sem situação (lead nasce Novo)", () => {
    const body = leadPayload({ ...emptyLeadForm(), name: " Maria ", companyName: "Mercado Lua", document: "11.222.333/0001-81", qualification: "HOT" }, "create");
    assert.equal("status" in body, false);
    const parsed = leadSchema.parse(body);
    assert.equal(parsed.name, "Maria");
    assert.equal(parsed.qualification, "HOT");
    assert.equal(parsed.originId, undefined);
  });
  test("edição: situação vai junto; motivo só quando Desqualificado; nunca CONVERTED", () => {
    const disq = leadPayload({ ...emptyLeadForm(), name: "Maria", status: "DISQUALIFIED", disqualifyReason: "Sem orçamento" }, "edit");
    assert.equal(updateLeadSchema.parse(disq).disqualifyReason, "Sem orçamento");
    const ok = leadPayload({ ...emptyLeadForm(), name: "Maria", status: "CONTACTED", disqualifyReason: "sobra" }, "edit");
    assert.equal(updateLeadSchema.parse(ok).disqualifyReason, undefined);
    assert.equal(updateLeadSchema.safeParse({ status: "CONVERTED" }).success, false);
  });
});

describe("CRM — formulário de oportunidade", () => {
  test("título, pipeline e estágio obrigatórios na criação; valor ≥ 0; probabilidade 0–100", () => {
    const e = validateOpportunity(emptyOpportunityForm(), "create");
    assert.ok(e.title && e.pipelineId && e.stageId);
    assert.ok(validateOpportunity({ ...emptyOpportunityForm(P, S), title: "X", estimatedValue: "-1" }, "create").estimatedValue);
    assert.ok(validateOpportunity({ ...emptyOpportunityForm(P, S), title: "X", probability: "101" }, "create").probability);
    assert.ok(validateOpportunity({ ...emptyOpportunityForm(P, S), title: "X", estimatedValue: "dez" }, "create").estimatedValue);
    assert.deepEqual(validateOpportunity({ ...emptyOpportunityForm(P, S), title: "X", estimatedValue: "1.234,56", probability: "40" }, "create"), {});
  });
  test("valor em formato brasileiro vira número", () => {
    assert.equal(parseDecimal("1.234,56"), 1234.56);
    assert.equal(parseDecimal("1234.56"), 1234.56);
    assert.equal(parseDecimal(""), undefined);
    assert.ok(Number.isNaN(parseDecimal("12a")));
  });
  test("criação aceita pelo schema; edição NÃO envia pipeline/estágio (estágio só por 'Mudar estágio')", () => {
    const create = opportunityPayload({ ...emptyOpportunityForm(P, S), title: "Fornecimento", estimatedValue: "1.000,00" }, "create");
    assert.equal(opportunitySchema.parse(create).estimatedValue, 1000);
    const edit = opportunityPayload({ ...emptyOpportunityForm(P, S), title: "Fornecimento" }, "edit");
    assert.equal("pipelineId" in edit || "stageId" in edit, false);
    assert.ok(updateOpportunitySchema.safeParse(edit).success);
  });
});

describe("CRM — formulário de atividade", () => {
  test("assunto obrigatório; tipo e registro relacionado obrigatórios na criação", () => {
    const e = validateActivity({ ...emptyActivityForm(), activityType: "" }, "create");
    assert.ok(e.subject && e.activityType && e.relatedType && e.relatedId);
    assert.deepEqual(Object.keys(validateActivity({ ...emptyActivityForm(), subject: "" }, "edit")), ["subject"]);
  });
  test("corpo aceito pelos schemas de criação e de edição", () => {
    const create = activityPayload({ ...emptyActivityForm("lead", P), subject: "Ligar", dueDate: "2026-10-20" }, "create");
    assert.equal(activitySchema.parse(create).relatedType, "lead");
    const edit = activityPayload({ ...emptyActivityForm("lead", P), subject: "Ligar de novo" }, "edit");
    assert.equal("relatedId" in edit, false);
    assert.ok(updateActivitySchema.safeParse(edit).success);
  });
});
