"use client";

import { toast } from "@/components/ui/Toast";
import { FormDialog, filledItems, num, opt, type FieldDef, type FormValues } from "./FormDialog";
import { SOURCES } from "./sources";

// Formulários de criação das telas de cadastro/registro simples. Cada um só
// monta o corpo do POST; validação de negócio e permissão são do servidor.

type SimpleForm = {
  title: string;
  description?: string;
  submitLabel: string;
  path: string;
  fields: FieldDef[];
  toBody: (v: FormValues) => unknown;
  validate?: (v: FormValues) => string | null;
  success: string;
  invalidate?: string[];
  size?: "sm" | "md" | "lg";
};

const PRIORITY: FieldDef = {
  key: "priority",
  label: "Prioridade",
  type: "select",
  default: "MEDIUM",
  options: [
    { value: "LOW", label: "Baixa" },
    { value: "MEDIUM", label: "Média" },
    { value: "HIGH", label: "Alta" },
    { value: "CRITICAL", label: "Crítica" },
  ],
};

const INSPECTION_TYPES = [
  { value: "RECEIVING", label: "Recebimento" },
  { value: "PRODUCTION", label: "Produção" },
  { value: "PROCESS", label: "Processo" },
  { value: "SHIPPING", label: "Expedição" },
  { value: "RETURN", label: "Devolução" },
  { value: "OTHER", label: "Outra" },
];

const today = () => new Date().toISOString().slice(0, 10);
const txt = (v: unknown) => String(v ?? "").trim();
const lines = (v: FormValues, key: string) => filledItems(v, key).map((i) => ({ productId: i.ref, quantity: num(i.quantity) }));
const itemsOk = (v: FormValues, key: string) => (filledItems(v, key).every((i) => num(i.quantity) > 0) ? null : "Informe a quantidade de cada item.");
const stockItems = (label = "Itens"): FieldDef => ({ key: "items", label, type: "items", required: true, source: SOURCES.products, columns: [{ key: "quantity", label: "Quantidade", default: "1" }] });

export const SIMPLE_FORMS = {
  projects: {
    title: "Novo projeto",
    submitLabel: "Criar projeto",
    path: "/api/projects",
    success: "Projeto criado.",
    fields: [
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "customerId", label: "Cliente", type: "lookup", source: SOURCES.customers },
      { key: "responsibleUserId", label: "Responsável", type: "lookup", source: SOURCES.users },
      { key: "startDate", label: "Início", type: "date", default: today() },
      { key: "forecastEndDate", label: "Término previsto", type: "date" },
      { key: "budget", label: "Orçamento (R$)", type: "money" },
      { key: "description", label: "Descrição", type: "textarea" },
    ],
    toBody: (v) => ({ name: txt(v.name), customerId: opt(v.customerId), responsibleUserId: opt(v.responsibleUserId), startDate: opt(v.startDate), forecastEndDate: opt(v.forecastEndDate), budget: opt(v.budget) ? num(v.budget) : undefined, description: opt(v.description) }),
  },
  projectTasks: {
    title: "Nova tarefa",
    submitLabel: "Criar tarefa",
    path: "/api/project-tasks",
    success: "Tarefa criada.",
    fields: [
      { key: "projectId", label: "Projeto", type: "lookup", source: SOURCES.projects, required: true },
      { key: "name", label: "Tarefa", type: "text", required: true },
      PRIORITY,
      { key: "dueDate", label: "Prazo", type: "date" },
      { key: "estimatedHours", label: "Horas estimadas", type: "number" },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ projectId: v.projectId, name: txt(v.name), priority: v.priority || "MEDIUM", dueDate: opt(v.dueDate), estimatedHours: opt(v.estimatedHours) ? num(v.estimatedHours) : undefined, notes: opt(v.notes) }),
  },
  timeEntries: {
    title: "Apontar horas",
    submitLabel: "Apontar",
    path: "/api/time-entries",
    success: "Horas apontadas.",
    size: "md",
    fields: [
      { key: "projectId", label: "Projeto", type: "lookup", source: SOURCES.projects },
      { key: "taskId", label: "Tarefa", type: "lookup", source: SOURCES.projectTasks },
      { key: "serviceOrderId", label: "Ordem de serviço", type: "lookup", source: SOURCES.serviceOrders, help: "Informe o projeto ou a ordem de serviço." },
      { key: "entryDate", label: "Data", type: "date", required: true, default: today() },
      { key: "hours", label: "Horas", type: "number", required: true, help: "Ex.: 1,5 = 1h30." },
      { key: "description", label: "O que foi feito", type: "textarea" },
    ],
    validate: (v) => (!opt(v.projectId) && !opt(v.serviceOrderId) ? "Informe o projeto ou a ordem de serviço." : num(v.hours) <= 0 ? "Informe as horas." : null),
    toBody: (v) => ({ projectId: opt(v.projectId), taskId: opt(v.taskId), serviceOrderId: opt(v.serviceOrderId), entryDate: v.entryDate, durationMinutes: Math.round(num(v.hours) * 60), description: opt(v.description) }),
  },
  qualityInspections: {
    title: "Nova inspeção",
    submitLabel: "Abrir inspeção",
    path: "/api/quality-inspections",
    success: "Inspeção aberta.",
    size: "md",
    fields: [
      { key: "inspectionType", label: "Tipo", type: "select", required: true, default: "RECEIVING", options: INSPECTION_TYPES },
      { key: "productId", label: "Produto", type: "lookup", source: SOURCES.products },
      { key: "checklistId", label: "Checklist", type: "lookup", source: SOURCES.checklists },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ inspectionType: v.inspectionType, productId: opt(v.productId), checklistId: opt(v.checklistId), notes: opt(v.notes) }),
  },
  nonconformities: {
    title: "Nova não conformidade",
    submitLabel: "Registrar",
    path: "/api/nonconformities",
    success: "Não conformidade registrada.",
    fields: [
      { key: "description", label: "O que aconteceu", type: "text", required: true },
      { key: "severity", label: "Gravidade", type: "select", default: "MEDIUM", options: [{ value: "LOW", label: "Baixa" }, { value: "MEDIUM", label: "Média" }, { value: "HIGH", label: "Alta" }, { value: "CRITICAL", label: "Crítica" }] },
      { key: "cause", label: "Causa provável", type: "text" },
      { key: "inspectionId", label: "Inspeção de origem", type: "lookup", source: SOURCES.inspections },
      { key: "responsibleUserId", label: "Responsável", type: "lookup", source: SOURCES.users },
      { key: "evidenceNotes", label: "Evidências", type: "textarea" },
    ],
    toBody: (v) => ({ description: txt(v.description), severity: v.severity || "MEDIUM", cause: opt(v.cause), inspectionId: opt(v.inspectionId), responsibleUserId: opt(v.responsibleUserId), evidenceNotes: opt(v.evidenceNotes) }),
  },
  qualityActions: {
    title: "Nova ação",
    submitLabel: "Criar ação",
    path: "/api/quality-actions",
    success: "Ação criada.",
    fields: [
      { key: "actionType", label: "Tipo", type: "select", required: true, default: "CORRECTIVE", options: [{ value: "CORRECTIVE", label: "Corretiva" }, { value: "PREVENTIVE", label: "Preventiva" }] },
      { key: "description", label: "Ação", type: "text", required: true },
      { key: "nonconformityId", label: "Não conformidade", type: "lookup", source: SOURCES.nonconformities },
      { key: "responsibleUserId", label: "Responsável", type: "lookup", source: SOURCES.users },
      { key: "dueDate", label: "Prazo", type: "date" },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ actionType: v.actionType, description: txt(v.description), nonconformityId: opt(v.nonconformityId), responsibleUserId: opt(v.responsibleUserId), dueDate: opt(v.dueDate), notes: opt(v.notes) }),
  },
  qualityChecklists: {
    title: "Novo checklist",
    submitLabel: "Criar checklist",
    path: "/api/quality-checklists",
    success: "Checklist criado.",
    size: "md",
    fields: [
      { key: "code", label: "Código", type: "text", required: true },
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "inspectionType", label: "Tipo de inspeção", type: "select", required: true, default: "RECEIVING", options: INSPECTION_TYPES },
      { key: "description", label: "Descrição", type: "textarea" },
    ],
    toBody: (v) => ({ code: txt(v.code), name: txt(v.name), inspectionType: v.inspectionType, description: opt(v.description) }),
  },
  assets: {
    title: "Novo ativo",
    submitLabel: "Cadastrar ativo",
    path: "/api/assets",
    success: "Ativo cadastrado.",
    fields: [
      { key: "description", label: "Descrição", type: "text", required: true, placeholder: "Ex.: Prensa hidráulica 20t" },
      { key: "categoryId", label: "Categoria", type: "lookup", source: SOURCES.assetCategories },
      { key: "locationId", label: "Local", type: "lookup", source: SOURCES.assetLocations },
      { key: "manufacturer", label: "Fabricante", type: "text" },
      { key: "model", label: "Modelo", type: "text" },
      { key: "serialNumber", label: "Nº de série", type: "text" },
      { key: "acquisitionDate", label: "Data de aquisição", type: "date" },
      { key: "acquisitionCost", label: "Valor de aquisição (R$)", type: "money" },
      { key: "supplierId", label: "Fornecedor", type: "lookup", source: SOURCES.suppliers },
      { key: "costCenterId", label: "Centro de custo", type: "lookup", source: SOURCES.costCenters },
    ],
    toBody: (v) => ({
      description: txt(v.description),
      categoryId: opt(v.categoryId),
      locationId: opt(v.locationId),
      manufacturer: opt(v.manufacturer),
      model: opt(v.model),
      serialNumber: opt(v.serialNumber),
      acquisitionDate: opt(v.acquisitionDate),
      acquisitionCost: opt(v.acquisitionCost) ? num(v.acquisitionCost) : undefined,
      supplierId: opt(v.supplierId),
      costCenterId: opt(v.costCenterId),
    }),
  },
  assetCategories: {
    title: "Nova categoria de ativo",
    submitLabel: "Criar categoria",
    path: "/api/asset-categories",
    success: "Categoria criada.",
    size: "sm",
    fields: [
      { key: "code", label: "Código", type: "text", required: true },
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "description", label: "Descrição", type: "textarea" },
    ],
    toBody: (v) => ({ code: txt(v.code), name: txt(v.name), description: opt(v.description) }),
  },
  assetLocations: {
    title: "Novo local de instalação",
    submitLabel: "Criar local",
    path: "/api/asset-locations",
    success: "Local criado.",
    size: "sm",
    fields: [
      { key: "code", label: "Código", type: "text", required: true },
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "parentId", label: "Dentro de", type: "lookup", source: SOURCES.assetLocations },
      { key: "description", label: "Descrição", type: "textarea" },
    ],
    toBody: (v) => ({ code: txt(v.code), name: txt(v.name), parentId: opt(v.parentId), description: opt(v.description) }),
  },
  maintenancePlans: {
    title: "Novo plano de manutenção",
    submitLabel: "Criar plano",
    path: "/api/maintenance-plans",
    success: "Plano criado.",
    fields: [
      { key: "code", label: "Código", type: "text", required: true },
      { key: "description", label: "Descrição", type: "text", required: true, placeholder: "Ex.: lubrificação mensal" },
      { key: "assetId", label: "Ativo", type: "lookup", source: SOURCES.assets, help: "Ou uma categoria inteira, abaixo." },
      { key: "assetCategoryId", label: "Categoria de ativo", type: "lookup", source: SOURCES.assetCategories },
      { key: "planType", label: "Tipo", type: "select", required: true, default: "PREVENTIVE", options: [{ value: "PREVENTIVE", label: "Preventiva" }, { value: "PREDICTIVE", label: "Preditiva" }, { value: "CORRECTIVE", label: "Corretiva" }] },
      { key: "periodicityType", label: "Periodicidade por", type: "select", required: true, default: "TIME", options: [{ value: "TIME", label: "Tempo" }, { value: "HOURS", label: "Horas de uso" }, { value: "CYCLES", label: "Ciclos" }, { value: "MILEAGE", label: "Quilometragem" }, { value: "OTHER", label: "Outra" }] },
      { key: "periodicityValue", label: "A cada", type: "number" },
      { key: "periodicityUnit", label: "Unidade", type: "text", placeholder: "Ex.: dias, h, km" },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ code: txt(v.code), description: txt(v.description), assetId: opt(v.assetId), assetCategoryId: opt(v.assetCategoryId), planType: v.planType, periodicityType: v.periodicityType, periodicityValue: opt(v.periodicityValue) ? num(v.periodicityValue) : undefined, periodicityUnit: opt(v.periodicityUnit), notes: opt(v.notes) }),
  },
  costCenters: {
    title: "Novo centro de custo",
    submitLabel: "Criar centro de custo",
    path: "/api/cost-centers",
    success: "Centro de custo criado.",
    size: "sm",
    fields: [
      { key: "code", label: "Código", type: "text", required: true },
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "parentId", label: "Dentro de", type: "lookup", source: SOURCES.costCenters },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ code: txt(v.code), name: txt(v.name), parentId: opt(v.parentId), notes: opt(v.notes) }),
  },
  transfers: {
    title: "Nova transferência",
    description: "Move produtos entre dois locais. A transferência nasce em trânsito e é recebida no destino pelo detalhe.",
    submitLabel: "Transferir",
    path: "/api/stock-transfers",
    success: "Transferência criada.",
    fields: [
      { key: "fromLocationId", label: "De (local de origem)", type: "lookup", source: SOURCES.locations, required: true },
      { key: "toLocationId", label: "Para (local de destino)", type: "lookup", source: SOURCES.locations, required: true },
      stockItems(),
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    validate: (v) => (v.fromLocationId === v.toLocationId ? "Origem e destino precisam ser diferentes." : itemsOk(v, "items")),
    toBody: (v) => ({ fromLocationId: v.fromLocationId, toLocationId: v.toLocationId, items: lines(v, "items"), notes: opt(v.notes) }),
    invalidate: ["/api/stock-balances"],
  },
  materialRequests: {
    title: "Nova requisição de material",
    description: "Pede material do almoxarifado para uso (ex.: produção). Na entrega, o material é baixado do estoque como consumo.",
    submitLabel: "Requisitar",
    path: "/api/material-requests",
    success: "Requisição criada.",
    fields: [
      { key: "fromLocationId", label: "De (almoxarifado)", type: "lookup", source: SOURCES.locations, required: true },
      { key: "toLocationId", label: "Para (local de uso)", type: "lookup", source: SOURCES.locations, required: true },
      stockItems("Materiais"),
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    validate: (v) => (v.fromLocationId === v.toLocationId ? "Origem e destino precisam ser diferentes." : itemsOk(v, "items")),
    toBody: (v) => ({ fromLocationId: v.fromLocationId, toLocationId: v.toLocationId, items: lines(v, "items"), notes: opt(v.notes) }),
  },
  stockCounts: {
    title: "Nova contagem de inventário",
    description: "Abre a contagem do depósito com os saldos atuais; conte e informe as quantidades no detalhe.",
    submitLabel: "Abrir contagem",
    path: "/api/stock-counts",
    success: "Contagem aberta.",
    size: "sm",
    fields: [
      { key: "warehouseId", label: "Depósito", type: "lookup", source: SOURCES.depots, required: true },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ warehouseId: v.warehouseId, notes: opt(v.notes) }),
  },
  purchaseQuotes: {
    title: "Nova cotação de compra",
    description: "Convida fornecedores a cotar. Pode partir de uma solicitação aprovada.",
    submitLabel: "Criar cotação",
    path: "/api/purchase-quotes",
    success: "Cotação criada.",
    size: "md",
    fields: [
      { key: "suppliers", label: "Fornecedores convidados", type: "items", required: true, source: SOURCES.suppliers, itemLabel: "Fornecedor", columns: [] },
      { key: "purchaseRequestId", label: "Solicitação de compra", type: "lookup", source: SOURCES.purchaseRequests },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({ supplierIds: [...new Set(filledItems(v, "suppliers").map((i) => i.ref))], purchaseRequestId: opt(v.purchaseRequestId), notes: opt(v.notes) }),
  },
  fiscalNcms: {
    title: "Novo NCM",
    submitLabel: "Cadastrar",
    path: "/api/fiscal-ncms",
    success: "NCM cadastrado.",
    size: "sm",
    fields: [
      { key: "code", label: "Código NCM", type: "text", required: true, placeholder: "Ex.: 9403.30.00" },
      { key: "description", label: "Descrição", type: "text", required: true },
    ],
    toBody: (v) => ({ code: txt(v.code), description: txt(v.description) }),
  },
  fiscalCfops: {
    title: "Novo CFOP",
    submitLabel: "Cadastrar",
    path: "/api/fiscal-cfops",
    success: "CFOP cadastrado.",
    size: "sm",
    fields: [
      { key: "code", label: "Código CFOP", type: "text", required: true, placeholder: "Ex.: 5102" },
      { key: "description", label: "Descrição", type: "text", required: true },
      { key: "direction", label: "Sentido", type: "select", required: true, default: "SAIDA", options: [{ value: "SAIDA", label: "Saída" }, { value: "ENTRADA", label: "Entrada" }] },
      { key: "scope", label: "Abrangência", type: "select", required: true, default: "INTERNAL", options: [{ value: "INTERNAL", label: "Dentro do estado" }, { value: "INTERSTATE", label: "Interestadual" }, { value: "FOREIGN", label: "Exterior" }] },
    ],
    toBody: (v) => ({ code: txt(v.code), description: txt(v.description), direction: v.direction, scope: v.scope }),
  },
  taxRules: {
    title: "Nova regra tributária",
    description: "Define quando aplicar um CFOP e a tributação. As alíquotas são configuradas no detalhe da regra.",
    submitLabel: "Criar regra",
    path: "/api/tax-rules",
    success: "Regra criada.",
    fields: [
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "ncmId", label: "NCM", type: "lookup", source: SOURCES.ncms },
      { key: "productId", label: "Produto específico", type: "lookup", source: SOURCES.products },
      { key: "cfopId", label: "CFOP", type: "lookup", source: SOURCES.cfops },
      { key: "originUf", label: "UF de origem", type: "text", maxLength: 2, placeholder: "SP" },
      { key: "destinationUf", label: "UF de destino", type: "text", maxLength: 2, placeholder: "RJ" },
      { key: "taxRegime", label: "Regime", type: "select", options: [{ value: "SIMPLES_NACIONAL", label: "Simples Nacional" }, { value: "LUCRO_PRESUMIDO", label: "Lucro presumido" }, { value: "LUCRO_REAL", label: "Lucro real" }, { value: "MEI", label: "MEI" }] },
      { key: "priority", label: "Prioridade", type: "number", default: "0", help: "Maior vence quando mais de uma regra serve." },
      { key: "notes", label: "Observações", type: "textarea" },
    ],
    toBody: (v) => ({
      name: txt(v.name),
      ncmId: opt(v.ncmId),
      productId: opt(v.productId),
      cfopId: opt(v.cfopId),
      originUf: opt(v.originUf)?.toUpperCase(),
      destinationUf: opt(v.destinationUf)?.toUpperCase(),
      taxRegime: opt(v.taxRegime),
      priority: Math.round(num(v.priority)),
      notes: opt(v.notes),
    }),
  },
} satisfies Record<string, SimpleForm>;

export type SimpleFormKey = keyof typeof SIMPLE_FORMS;

export function SimpleCreateDialog({ form, open, onOpenChange, onCreated }: { form: SimpleFormKey; open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const f: SimpleForm = SIMPLE_FORMS[form];
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={f.title}
      description={f.description}
      submitLabel={f.submitLabel}
      fields={f.fields}
      path={f.path}
      toBody={f.toBody}
      validate={f.validate}
      invalidate={f.invalidate}
      size={f.size ?? "lg"}
      onCreated={() => {
        toast.success(f.success);
        onCreated();
      }}
    />
  );
}
