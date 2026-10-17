import type { WorkflowAction } from "./WorkflowActions";

// Ações de mudança de etapa para recursos com POST /:id/transition { newStatus }.
// Mesma tabela de transições do banco (fn_transition_*_status, 0057/0059):
// OPEN → agendar/planejar → em execução → aguardando ↔ em execução → concluída.

type Step = { to: string; label: string; from: string[]; confirm: string; danger?: boolean };

export function transitionActions(permission: string, steps: Step[]): WorkflowAction[] {
  return steps.map((s) => ({
    id: s.to,
    label: s.label,
    path: "transition",
    permission,
    statuses: s.from.map((x) => x.toLowerCase()),
    confirm: s.confirm,
    success: `Etapa alterada: ${s.label.toLowerCase()}.`,
    tone: s.danger ? "danger" : undefined,
    body: { newStatus: s.to },
  }));
}

export const SERVICE_ORDER_STEPS = transitionActions("service_orders.transition", [
  { to: "SCHEDULED", label: "Agendar", from: ["OPEN"], confirm: "A ordem fica agendada para atendimento." },
  { to: "IN_PROGRESS", label: "Iniciar atendimento", from: ["SCHEDULED", "WAITING"], confirm: "A ordem entra em execução." },
  { to: "WAITING", label: "Aguardar", from: ["IN_PROGRESS"], confirm: "A ordem fica aguardando (cliente, peça, terceiro)." },
  { to: "COMPLETED", label: "Concluir", from: ["IN_PROGRESS"], confirm: "O atendimento é encerrado." },
  { to: "CANCELLED", label: "Cancelar", from: ["OPEN", "SCHEDULED", "IN_PROGRESS", "WAITING"], confirm: "A ordem é cancelada.", danger: true },
]);

export const MAINTENANCE_ORDER_STEPS = transitionActions("maintenance_orders.transition", [
  { to: "PLANNED", label: "Planejar", from: ["OPEN"], confirm: "A manutenção fica planejada." },
  { to: "IN_PROGRESS", label: "Iniciar", from: ["PLANNED", "WAITING_PARTS"], confirm: "A manutenção entra em execução." },
  { to: "WAITING_PARTS", label: "Aguardar peças", from: ["IN_PROGRESS"], confirm: "A ordem fica aguardando peças." },
  { to: "COMPLETED", label: "Concluir", from: ["IN_PROGRESS"], confirm: "A manutenção é encerrada." },
  { to: "CANCELLED", label: "Cancelar", from: ["OPEN", "PLANNED", "IN_PROGRESS", "WAITING_PARTS"], confirm: "A ordem é cancelada.", danger: true },
]);
