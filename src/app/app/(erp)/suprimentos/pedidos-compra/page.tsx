"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Lock, PackagePlus, Plus, Send, Truck } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { MiniTable } from "@/components/resource/DetailLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { NewOrderDialog } from "@/components/commercial/NewOrderDialog";
import { ReceiveOrderDialog } from "@/components/forms/ReceiveOrderDialog";
import { useCached, invalidateCache } from "@/lib/dashboard/client";
import { apiSend } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { dbStatusCode } from "@/lib/status";
import { formatCurrencyBRL } from "@/lib/format";
import type { PurchaseOrderItemRow, PurchaseOrderRow } from "@/lib/database/schema";

// Pedidos de compra: criar (rascunho) e conduzir o fluxo. As ações
// mostradas dependem do status e da permissão; a transição em si é do banco
// (fn_*_purchase_order), que recusa qualquer passo inválido.

type ActionId = "submit" | "approve" | "send" | "close" | "cancel";

const ACTIONS: Record<ActionId, { label: string; path: string; permission: string; statuses: string[]; confirm: string; tone?: "danger"; icon: typeof Send; success: string }> = {
  submit: { label: "Enviar para aprovação", path: "submit", permission: "purchase_orders.update", statuses: ["draft"], confirm: "O pedido segue para aprovação e deixa de ser rascunho.", icon: Send, success: "Pedido enviado para aprovação." },
  approve: { label: "Aprovar", path: "approve", permission: "purchase_orders.approve", statuses: ["pending_approval"], confirm: "Aprovar libera o pedido para ser enviado ao fornecedor.", icon: CheckCircle2, success: "Pedido aprovado." },
  send: { label: "Marcar como enviado ao fornecedor", path: "send", permission: "purchase_orders.update", statuses: ["approved"], confirm: "Registra que o pedido foi enviado ao fornecedor. A partir daí ele aguarda o recebimento.", icon: Truck, success: "Pedido marcado como enviado." },
  close: { label: "Encerrar", path: "close", permission: "purchase_orders.update", statuses: ["received"], confirm: "Encerra o pedido totalmente recebido.", icon: Lock, success: "Pedido encerrado." },
  cancel: { label: "Cancelar pedido", path: "cancel", permission: "purchase_orders.cancel", statuses: ["draft", "pending_approval", "approved", "sent", "partially_received"], confirm: "O cancelamento não pode ser desfeito. Se algo já foi recebido, o pedido é encerrado.", tone: "danger", icon: Ban, success: "Pedido cancelado." },
};

type Order = PurchaseOrderRow & { items: PurchaseOrderItemRow[] };

function OrderItems({ id }: { id: string }) {
  const order = useCached<Order>(`/api/purchase-orders/${id}`);
  if (order.loading && !order.data) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando itens...</p>;
  return (
    <MiniTable<PurchaseOrderItemRow>
      rows={order.data?.items ?? []}
      rowKey={(i) => i.id}
      empty="Sem itens."
      columns={[
        { label: "Item", cell: (i) => i.description },
        { label: "Qtd.", align: "right", cell: (i) => `${Number(i.ordered_quantity)}${i.unit ? ` ${i.unit}` : ""}` },
        { label: "Recebido", align: "right", cell: (i) => Number(i.received_quantity) },
        { label: "Total", align: "right", cell: (i) => formatCurrencyBRL(Number(i.line_total)) },
      ]}
    />
  );
}

export default function PedidosCompraPage() {
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<{ action: ActionId; row: PurchaseOrderRow } | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);

  function reload() {
    invalidateCache("/api/purchase-orders");
    setRefresh((n) => n + 1);
  }

  async function run() {
    if (!pending) return;
    const action = ACTIONS[pending.action];
    setBusy(true);
    try {
      await apiSend(`/api/purchase-orders/${pending.row.id}/${action.path}`, "POST");
      toast.success(action.success);
      setPending(null);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  const available = (row: PurchaseOrderRow) => {
    const status = dbStatusCode("purchase_orders", String(row.status ?? "")).toLowerCase();
    return (Object.keys(ACTIONS) as ActionId[]).filter((key) => ACTIONS[key].statuses.includes(status) && can(ACTIONS[key].permission));
  };

  return (
    <>
      <ResourceListPage<PurchaseOrderRow>
        title="Pedidos de compra"
        description="Pedidos confirmados com fornecedores, do envio ao recebimento."
        apiPath="/api/purchase-orders"
        searchPlaceholder="Buscar pedido ou fornecedor..."
        refreshToken={refresh}
        actions={
          can("purchase_orders.create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> Novo pedido
            </Button>
          ) : undefined
        }
        columns={[
          codeCol<PurchaseOrderRow>("code", "Pedido"),
          refCol<PurchaseOrderRow>("supplier_id", "Fornecedor", suppliers, { mobile: "meta" }),
          dateCol<PurchaseOrderRow>("issued_at", "Emissão"),
          dateCol<PurchaseOrderRow>("expected_delivery_at", "Entrega prevista", { overdueWhen: (row) => isRowOverdue(row, "expected_delivery_at", ["approved","sent","partially_received"]), mobile: "meta" }),
          moneyCol<PurchaseOrderRow>("total_amount", "Total", { mobile: "meta" }),
          statusCol<PurchaseOrderRow>("purchase_orders"),
        ]}
        filters={[
          combineViews<PurchaseOrderRow>(
            overdueView<PurchaseOrderRow>("expected_delivery_at", ["approved","sent","partially_received"], "Entrega atrasada"),
            statusViews<PurchaseOrderRow>([{ value: "aprovacao", label: "Aguardando aprovação", statuses: ["pending_approval"] }])
          ),
          statusFilter<PurchaseOrderRow>("purchase_orders", "status", { server: true }),
        ]}
        detail={{
          title: (row) => row.code,
          subtitle: (row) => suppliers.get(row.supplier_id) ?? undefined,
          badges: (row) => <StatusBadge entity="purchase_orders" status={row.status} />,
          render: (row) => <OrderItems key={`${row.id}-${refresh}`} id={row.id} />,
          actions: (row) => {
            const list = available(row);
            const canReceive = ["sent", "partially_received"].includes(dbStatusCode("purchase_orders", String(row.status ?? "")).toLowerCase()) && can("purchase_receipts.create");
            if (list.length === 0 && !canReceive) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {canReceive && (
                  <Button size="sm" onClick={() => setReceiving(row.id)}>
                    <PackagePlus size={14} aria-hidden /> Receber mercadoria
                  </Button>
                )}
                {list.map((key) => {
                  const a = ACTIONS[key];
                  const Icon = a.icon;
                  return (
                    <Button key={key} size="sm" variant={a.tone === "danger" ? "ghost" : key === list[0] ? "primary" : "secondary"} className={a.tone === "danger" ? "text-danger-fg" : undefined} onClick={() => setPending({ action: key, row })}>
                      <Icon size={14} aria-hidden /> {a.label}
                    </Button>
                  );
                })}
              </div>
            );
          },
        }}
        emptyDescription="Crie o primeiro pedido de compra pelo botão Novo pedido."
      />
      <NewOrderDialog
        kind="purchase"
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          toast.success("Pedido de compra criado como rascunho.", "Abra o pedido na lista para enviar para aprovação.");
          reload();
        }}
      />
      <ReceiveOrderDialog
        key={receiving ?? "none"}
        open={receiving !== null}
        orderId={receiving}
        onOpenChange={(o) => !o && setReceiving(null)}
        onDone={() => {
          setReceiving(null);
          toast.success("Recebimento registrado.");
          reload();
        }}
      />
      {pending && (
        <ConfirmDialog
          open
          title={`${ACTIONS[pending.action].label}?`}
          description={`${pending.row.code}: ${ACTIONS[pending.action].confirm}`}
          confirmLabel={ACTIONS[pending.action].label}
          cancelLabel="Voltar"
          tone={ACTIONS[pending.action].tone === "danger" ? "danger" : "default"}
          loading={busy}
          onConfirm={run}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
