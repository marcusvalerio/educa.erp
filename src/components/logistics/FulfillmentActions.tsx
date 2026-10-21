"use client";

import { useState } from "react";
import { CheckCheck, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { FormDialog } from "@/components/forms/FormDialog";
import { apiSend } from "@/lib/api-client";
import { invalidateCache } from "@/lib/dashboard/client";

// Passos da separação e da expedição na tela. O banco decide cada passo
// (fn_start_picking, fn_pick_item, fn_*_shipment); a saída do estoque
// acontece em "Expedir", que baixa o que estava reservado.

/** Expedição: rascunho → pronta → embalada → aprovada → expedida → entregue → encerrada. */
export const SHIPMENT_STEPS: WorkflowAction[] = [
  { id: "ready", label: "Marcar pronta", path: "ready", permission: "shipments.update", statuses: ["draft"], confirm: "A expedição fica pronta para embalar.", success: "Expedição pronta." },
  { id: "pack", label: "Embalar", path: "pack", permission: "shipments.update", statuses: ["ready"], confirm: "Registra que os volumes foram embalados.", success: "Expedição embalada." },
  { id: "approve", label: "Aprovar envio", path: "approve", permission: "shipments.approve", statuses: ["packed"], confirm: "Libera a expedição para sair.", success: "Envio aprovado." },
  {
    id: "ship",
    label: "Expedir (baixa do estoque)",
    path: "ship",
    permission: "shipments.ship",
    statuses: ["ready_to_ship"],
    confirm: "A mercadoria sai do estoque agora: a quantidade reservada é baixada do local e o pedido fica expedido.",
    success: "Mercadoria expedida: estoque baixado.",
  },
  { id: "deliver", label: "Confirmar entrega", path: "deliver", permission: "deliveries.confirm", statuses: ["shipped", "in_transit"], confirm: "Registra que o cliente recebeu a mercadoria.", success: "Entrega confirmada." },
  { id: "complete", label: "Encerrar", path: "complete", permission: "shipments.update", statuses: ["delivered"], confirm: "Encerra a expedição.", success: "Expedição encerrada." },
  {
    id: "cancel",
    label: "Cancelar",
    path: "cancel",
    permission: "shipments.cancel",
    statuses: ["draft", "ready", "packed", "ready_to_ship"],
    confirm: "A expedição é cancelada; a reserva do pedido continua.",
    success: "Expedição cancelada.",
    tone: "danger",
  },
];

export function ShipmentActions({ id, status, onDone, transport = false }: { id: string; status: string; onDone: () => void; transport?: boolean }) {
  const { can } = useSession();
  const [assigning, setAssigning] = useState(false);
  const canTransport = transport && can("shipments.update") && !["shipped", "in_transit", "delivered", "completed", "cancelled"].includes(status.toLowerCase());
  return (
    <>
      <WorkflowActions
        base="/api/shipments"
        id={id}
        status={status}
        actions={SHIPMENT_STEPS}
        onDone={onDone}
        extra={
          canTransport ? (
            <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>
              <Truck size={14} aria-hidden /> Definir transporte
            </Button>
          ) : undefined
        }
      />
      {assigning && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setAssigning(false)}
          title="Transporte da expedição"
          description="Transportadora, motorista e veículo (todos opcionais)."
          submitLabel="Salvar transporte"
          fields={[
            { key: "carrierId", label: "Transportadora", type: "lookup", source: { path: "/api/carriers", label: (r) => String(r.razaoSocial ?? r.nomeFantasia ?? r.id) } },
            { key: "driverId", label: "Motorista", type: "lookup", source: { path: "/api/drivers", label: (r) => String(r.nome ?? r.id) } },
            { key: "vehicleId", label: "Veículo", type: "lookup", source: { path: "/api/vehicles", label: (r) => String(r.placa ?? r.modelo ?? r.id) } },
          ]}
          path={`/api/shipments/${id}/transport`}
          toBody={(v) => ({ carrierId: v.carrierId || undefined, driverId: v.driverId || undefined, vehicleId: v.vehicleId || undefined })}
          invalidate={["/api/shipments"]}
          onCreated={() => {
            toast.success("Transporte definido.");
            setAssigning(false);
            onDone();
          }}
          size="md"
        />
      )}
    </>
  );
}

/** Separação: um toque inicia, separa o que foi pedido e conclui. */
export function PickListActions({ id, status, onDone }: { id: string; status: string; onDone: () => void }) {
  const { can } = useSession();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const st = status.toLowerCase();
  const canPick = ["pending", "in_progress"].includes(st) && can("pick_lists.update") && can("pick_lists.complete");

  async function run() {
    setBusy(true);
    try {
      await apiSend(`/api/pick-lists/${id}/pick-all`, "POST", {});
      invalidateCache("/api/pick-lists");
      invalidateCache("/api/sales-orders");
      toast.success("Separação concluída.", "Agora gere a expedição no pedido de venda.");
      setConfirm(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível separar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkflowActions
      base="/api/pick-lists"
      id={id}
      status={status}
      actions={[
        { id: "cancel", label: "Cancelar separação", path: "cancel", permission: "pick_lists.cancel", statuses: ["pending", "in_progress"], confirm: "A separação é cancelada; a reserva do pedido continua.", success: "Separação cancelada.", tone: "danger" },
      ]}
      onDone={onDone}
      extra={
        canPick ? (
          <>
            <Button size="sm" onClick={() => setConfirm(true)}>
              <CheckCheck size={14} aria-hidden /> Separar tudo e concluir
            </Button>
            {confirm && (
              <ConfirmDialog
                open
                title="Separar tudo e concluir?"
                description="Registra como separada toda a quantidade reservada de cada item e conclui a separação. O estoque só sai na expedição."
                confirmLabel="Separar"
                loading={busy}
                onConfirm={run}
                onCancel={() => setConfirm(false)}
              />
            )}
          </>
        ) : undefined
      }
    />
  );
}

/** No pedido de venda: separar a reserva e gerar a expedição. */
export function OrderFulfillmentButtons({ orderId, status, onDone }: { orderId: string; status: string; onDone: () => void }) {
  const { can } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const st = status.toLowerCase();

  async function run(kind: "pick" | "ship") {
    setBusy(kind);
    try {
      await apiSend(`/api/sales-orders/${orderId}/${kind === "pick" ? "pick-auto" : "ship-auto"}`, "POST", {});
      invalidateCache("/api/sales-orders");
      invalidateCache(kind === "pick" ? "/api/pick-lists" : "/api/shipments");
      toast.success(
        kind === "pick" ? "Separação criada." : "Expedição criada.",
        kind === "pick" ? "Conclua em Logística › Picking." : "Siga os passos em Logística › Expedição: embalar, aprovar e expedir (baixa do estoque)."
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {["reserved", "reservation_pending"].includes(st) && can("pick_lists.create") && (
        <Button size="sm" variant="secondary" loading={busy === "pick"} disabled={busy !== null} onClick={() => run("pick")}>
          <PackageCheck size={14} aria-hidden /> Separar estoque
        </Button>
      )}
      {["reserved", "ready_to_ship", "partially_shipped"].includes(st) && can("shipments.create") && (
        <Button size="sm" variant="secondary" loading={busy === "ship"} disabled={busy !== null} onClick={() => run("ship")}>
          <Truck size={14} aria-hidden /> Gerar expedição
        </Button>
      )}
    </>
  );
}
