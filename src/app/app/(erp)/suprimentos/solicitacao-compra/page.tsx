"use client";

import { useState } from "react";
import { Ban, CheckCircle2, FilePlus2, Plus, Send, XCircle } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, textCol, dateCol, statusCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { MiniTable } from "@/components/resource/DetailLayout";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { NewPurchaseRequestDialog } from "@/components/commercial/NewPurchaseRequestDialog";
import { NewOrderDialog, type OrderInitial } from "@/components/commercial/NewOrderDialog";
import { useCached, invalidateCache } from "@/lib/dashboard/client";
import { apiGet, apiSend } from "@/lib/api-client";
import { dbStatusCode } from "@/lib/status";
import type { PurchaseRequestItemRow, PurchaseRequestRow } from "@/lib/database/schema";

// Solicitações de compra: criar e conduzir até virar pedido. As ações
// dependem do status e da permissão; a transição é do banco
// (fn_*_purchase_request), que recusa qualquer passo inválido.

type ActionId = "submit" | "approve" | "reject" | "cancel";

const ACTIONS: Record<ActionId, { label: string; path: string; permission: string; statuses: string[]; confirm: string; tone?: "danger"; icon: typeof Send; success: string }> = {
  submit: { label: "Enviar para aprovação", path: "submit", permission: "purchase_requests.update", statuses: ["draft"], confirm: "A solicitação segue para aprovação.", icon: Send, success: "Solicitação enviada para aprovação." },
  approve: { label: "Aprovar", path: "approve", permission: "purchase_requests.approve", statuses: ["requested"], confirm: "Aprova as quantidades pedidas. Depois, gere o pedido de compra.", icon: CheckCircle2, success: "Solicitação aprovada." },
  reject: { label: "Recusar", path: "reject", permission: "purchase_requests.approve", statuses: ["requested"], confirm: "A solicitação é recusada e não pode virar pedido.", tone: "danger", icon: XCircle, success: "Solicitação recusada." },
  cancel: { label: "Cancelar", path: "cancel", permission: "purchase_requests.update", statuses: ["draft", "requested", "approved"], confirm: "O cancelamento não pode ser desfeito.", tone: "danger", icon: Ban, success: "Solicitação cancelada." },
};

type RequestWithItems = PurchaseRequestRow & { items: PurchaseRequestItemRow[] };

function RequestItems({ id }: { id: string }) {
  const req = useCached<RequestWithItems>(`/api/purchase-requests/${id}`);
  if (req.loading && !req.data) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando itens...</p>;
  return (
    <MiniTable<PurchaseRequestItemRow>
      rows={req.data?.items ?? []}
      rowKey={(i) => i.id}
      empty="Sem itens."
      columns={[
        { label: "Item", cell: (i) => i.description },
        { label: "Pedida", align: "right", cell: (i) => `${Number(i.quantity_requested)}${i.unit ? ` ${i.unit}` : ""}` },
        { label: "Aprovada", align: "right", cell: (i) => (i.quantity_approved === null ? "—" : Number(i.quantity_approved)) },
      ]}
    />
  );
}

export default function SolicitacaoCompraPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [ordering, setOrdering] = useState<OrderInitial | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<{ action: ActionId; row: PurchaseRequestRow } | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    invalidateCache("/api/purchase-requests");
    setRefresh((n) => n + 1);
  }

  async function run() {
    if (!pending) return;
    const action = ACTIONS[pending.action];
    setBusy(true);
    try {
      await apiSend(`/api/purchase-requests/${pending.row.id}/${action.path}`, "POST", pending.action === "approve" || pending.action === "reject" ? {} : undefined);
      toast.success(action.success);
      setPending(null);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  async function startOrder(row: PurchaseRequestRow) {
    try {
      const req = await apiGet<RequestWithItems>(`/api/purchase-requests/${row.id}`);
      const items = (req.items ?? [])
        .filter((i) => i.product_id)
        .map((i) => ({ productId: i.product_id as string, quantity: Number(i.quantity_approved ?? i.quantity_requested) }))
        .filter((i) => i.quantity > 0);
      setOrdering({ purchaseRequestId: row.id, items });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir a solicitação.");
    }
  }

  const statusOf = (row: PurchaseRequestRow) => dbStatusCode("purchase_requests", String(row.status ?? "")).toLowerCase();

  return (
    <>
      <ResourceListPage<PurchaseRequestRow>
        title="Solicitações de compra"
        description="Necessidades internas de compra, da abertura à aprovação para cotação."
        apiPath="/api/purchase-requests"
        searchPlaceholder="Buscar solicitação ou setor..."
        refreshToken={refresh}
        actions={
          can("purchase_requests.create") ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden /> Nova solicitação
            </Button>
          ) : undefined
        }
        columns={[
          codeCol<PurchaseRequestRow>("code", "Solicitação"),
          textCol<PurchaseRequestRow>("department", "Setor", { mobile: "meta" }),
          statusCol<PurchaseRequestRow>(undefined, "priority", "Prioridade", { width: "7rem", mobile: "meta" }),
          dateCol<PurchaseRequestRow>("requested_at", "Solicitada em"),
          dateCol<PurchaseRequestRow>("needed_by", "Necessária até", { overdueWhen: (row) => isRowOverdue(row, "needed_by", ["requested", "approved", "partially_ordered"]) }),
          statusCol<PurchaseRequestRow>("purchase_requests"),
        ]}
        filters={[
          combineViews<PurchaseRequestRow>(
            statusViews<PurchaseRequestRow>([{ value: "aprovacao", label: "Aguardando aprovação", statuses: ["requested"] }]),
            overdueView<PurchaseRequestRow>("needed_by", ["requested", "approved", "partially_ordered"], "Prazo vencido")
          ),
          statusFilter<PurchaseRequestRow>("purchase_requests", "status", { server: true }),
          enumFilter<PurchaseRequestRow>("priority", "Prioridade", [["low", "Baixa"], ["medium", "Média"], ["high", "Alta"], ["urgent", "Urgente"]]),
        ]}
        detail={{
          title: (row) => row.code,
          subtitle: (row) => row.department ?? undefined,
          badges: (row) => <StatusBadge entity="purchase_requests" status={row.status} />,
          render: (row) => <RequestItems key={`${row.id}-${refresh}`} id={row.id} />,
          actions: (row) => {
            const status = statusOf(row);
            const list = (Object.keys(ACTIONS) as ActionId[]).filter((key) => ACTIONS[key].statuses.includes(status) && can(ACTIONS[key].permission));
            const canOrder = ["approved", "partially_ordered"].includes(status) && can("purchase_orders.create");
            if (list.length === 0 && !canOrder) return null;
            return (
              <div className="flex flex-wrap gap-2">
                {canOrder && (
                  <Button size="sm" onClick={() => startOrder(row)}>
                    <FilePlus2 size={14} aria-hidden /> Gerar pedido de compra
                  </Button>
                )}
                {list.map((key, index) => {
                  const a = ACTIONS[key];
                  const Icon = a.icon;
                  return (
                    <Button key={key} size="sm" variant={a.tone === "danger" ? "ghost" : index === 0 && !canOrder ? "primary" : "secondary"} className={a.tone === "danger" ? "text-danger-fg" : undefined} onClick={() => setPending({ action: key, row })}>
                      <Icon size={14} aria-hidden /> {a.label}
                    </Button>
                  );
                })}
              </div>
            );
          },
        }}
        emptyDescription="Crie a primeira solicitação pelo botão Nova solicitação."
      />
      <NewPurchaseRequestDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={() => {
          setCreating(false);
          toast.success("Solicitação criada como rascunho.", "Abra a solicitação na lista para enviar para aprovação.");
          reload();
        }}
      />
      <NewOrderDialog
        kind="purchase"
        open={ordering !== null}
        initial={ordering}
        onOpenChange={(next) => !next && setOrdering(null)}
        onCreated={() => {
          setOrdering(null);
          toast.success("Pedido de compra criado como rascunho.", "Ele está em Suprimentos → Pedidos de compra.");
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
