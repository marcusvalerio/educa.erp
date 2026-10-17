"use client";

import { toast } from "@/components/ui/Toast";
import { FormDialog, num, opt, type FieldDef } from "./FormDialog";
import { SOURCES } from "./sources";

// Ordens de serviço e de manutenção: criar, consumir peça e lançar custo.
// Regras (cliente/ativo da empresa, estoque, auditoria) no servidor/banco.

const PRIORITY = {
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
} as const satisfies FieldDef;

const SERVICE_ORDER: FieldDef[] = [
  { key: "customerId", label: "Cliente", type: "lookup", source: SOURCES.customers, required: true },
  { key: "title", label: "Título", type: "text", required: true, placeholder: "Ex.: instalação do equipamento" },
  { key: "description", label: "Descrição do serviço", type: "textarea" },
  PRIORITY,
  { key: "scheduledDate", label: "Data programada", type: "date" },
  { key: "projectId", label: "Projeto (opcional)", type: "lookup", source: SOURCES.projects },
  { key: "responsibleUserId", label: "Responsável", type: "lookup", source: SOURCES.users },
  { key: "notes", label: "Observações", type: "textarea" },
];

export function NewServiceOrderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova ordem de serviço"
      description="A OS nasce aberta. Agende, inicie e conclua pelo detalhe."
      submitLabel="Abrir OS"
      fields={SERVICE_ORDER}
      path="/api/service-orders"
      toBody={(v) => ({
        customerId: v.customerId,
        title: String(v.title).trim(),
        description: opt(v.description),
        priority: v.priority || "MEDIUM",
        scheduledDate: opt(v.scheduledDate),
        projectId: opt(v.projectId),
        responsibleUserId: opt(v.responsibleUserId),
        notes: opt(v.notes),
      })}
      onCreated={() => {
        toast.success("Ordem de serviço aberta.");
        onCreated();
      }}
    />
  );
}

const MAINTENANCE_ORDER: FieldDef[] = [
  { key: "assetId", label: "Ativo / equipamento", type: "lookup", source: SOURCES.assets, required: true },
  {
    key: "orderType",
    label: "Tipo",
    type: "select",
    required: true,
    default: "CORRECTIVE",
    options: [
      { value: "CORRECTIVE", label: "Corretiva" },
      { value: "PREVENTIVE", label: "Preventiva" },
      { value: "PREDICTIVE", label: "Preditiva" },
    ],
  },
  { key: "description", label: "Descrição", type: "text", required: true, placeholder: "Ex.: troca do rolamento" },
  PRIORITY,
  { key: "scheduledDate", label: "Data programada", type: "date" },
  { key: "planId", label: "Plano de manutenção (opcional)", type: "lookup", source: SOURCES.maintenancePlans },
  { key: "assignedTo", label: "Responsável", type: "lookup", source: SOURCES.users },
  { key: "notes", label: "Observações", type: "textarea" },
];

export function NewMaintenanceOrderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova ordem de manutenção"
      description="A ordem nasce aberta. Planeje, inicie e conclua pelo detalhe."
      submitLabel="Abrir ordem"
      fields={MAINTENANCE_ORDER}
      path="/api/maintenance-orders"
      toBody={(v) => ({
        assetId: v.assetId,
        orderType: v.orderType,
        description: String(v.description).trim(),
        priority: v.priority || "MEDIUM",
        scheduledDate: opt(v.scheduledDate),
        planId: opt(v.planId),
        assignedTo: opt(v.assignedTo),
        notes: opt(v.notes),
      })}
      onCreated={() => {
        toast.success("Ordem de manutenção aberta.");
        onCreated();
      }}
    />
  );
}

export function ConsumePartDialog({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Consumir peça"
      description="Baixa a peça do estoque e lança o custo na ordem."
      submitLabel="Consumir"
      fields={[
        { key: "productId", label: "Peça / material", type: "lookup", source: SOURCES.products, required: true },
        { key: "locationId", label: "Local de estoque", type: "lookup", source: SOURCES.locations, required: true },
        { key: "quantity", label: "Quantidade", type: "number", required: true, default: "1" },
        { key: "notes", label: "Observação", type: "textarea" },
      ]}
      path={`/api/maintenance-orders/${orderId}/consume-part`}
      validate={(v) => (num(v.quantity) > 0 ? null : "Informe a quantidade.")}
      toBody={(v) => ({ productId: v.productId, locationId: v.locationId, quantity: num(v.quantity), notes: opt(v.notes) })}
      invalidate={["/api/stock-balances", "/api/stock-movements"]}
      onCreated={() => {
        toast.success("Peça consumida.");
        onDone();
      }}
      size="md"
    />
  );
}

export function AddCostDialog({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Lançar custo"
      description="Mão de obra, serviço de terceiro ou despesa da ordem."
      submitLabel="Lançar"
      fields={[
        {
          key: "costType",
          label: "Tipo",
          type: "select",
          required: true,
          default: "SERVICE",
          options: [
            { value: "SERVICE", label: "Serviço / mão de obra" },
            { value: "EXPENSE", label: "Despesa" },
          ],
        },
        { key: "description", label: "Descrição", type: "text", required: true },
        { key: "amount", label: "Valor (R$)", type: "money", required: true },
      ]}
      path={`/api/maintenance-orders/${orderId}/costs`}
      toBody={(v) => ({ costType: v.costType, description: String(v.description).trim(), amount: num(v.amount) })}
      onCreated={() => {
        toast.success("Custo lançado.");
        onDone();
      }}
      size="sm"
    />
  );
}
