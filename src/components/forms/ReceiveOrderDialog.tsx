"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { Switch } from "@/components/ui/Controls";
import { useSession } from "@/components/shell/SessionProvider";
import { apiGet, apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";
import { SOURCES } from "./sources";
import { num } from "./FormDialog";
import type { PurchaseOrderItemRow, PurchaseOrderRow } from "@/lib/database/schema";

// Recebimento de um pedido de compra: itens vêm do pedido (quantidade
// pendente sugerida), o local de destino é escolhido e, se quem recebe pode
// confirmar, a entrada no estoque já é confirmada. Regra no banco
// (fn_create_purchase_receipt / fn_confirm_purchase_receipt).

type Order = PurchaseOrderRow & { items: PurchaseOrderItemRow[] };
const RECEIVABLE = ["sent", "partially_received", "approved"];

export function ReceiveOrderDialog({ open, onOpenChange, orderId, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; orderId?: string | null; onDone: () => void }) {
  const { can } = useSession();
  const canConfirm = can("purchase_receipts.confirm");
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [locations, setLocations] = useState<{ value: string; label: string }[]>([]);
  const [selected, setSelected] = useState(orderId ?? "");
  const [order, setOrder] = useState<Order | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmNow, setConfirmNow] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invalidateCache("/api/purchase-orders");
    Promise.all([apiGet<PurchaseOrderRow[]>("/api/purchase-orders"), cachedGet<Record<string, unknown>[]>(lookupPath(SOURCES.locations.path))])
      .then(([o, l]) => {
        if (cancelled) return;
        setOrders((o ?? []).filter((x) => RECEIVABLE.includes(String(x.status).toLowerCase())));
        setLocations((l ?? []).filter(SOURCES.locations.filter!).map((r) => ({ value: String(r.id), label: SOURCES.locations.label!(r) })));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Não foi possível carregar os pedidos."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // O pai remonta o diálogo por pedido (key), então orderId só vale no início.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    apiGet<Order>(`/api/purchase-orders/${selected}`)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        setQty(Object.fromEntries((o.items ?? []).map((i) => [i.id, String(Math.max(0, num(i.ordered_quantity) - num(i.received_quantity) - num(i.cancelled_quantity)))])));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Não foi possível abrir o pedido."));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Pedido carregado só vale se for o selecionado agora.
  const current = order && order.id === selected ? order : null;
  const orderOptions = useMemo(() => orders.map((o) => ({ value: o.id, label: `${o.code} · ${String(o.status).toLowerCase() === "partially_received" ? "recebido parcial" : "aguardando"}` })), [orders]);

  async function submit() {
    const order = current;
    if (!order) return setError("Selecione o pedido de compra.");
    if (!locationId) return setError("Selecione o local de destino.");
    const items = (order.items ?? []).filter((i) => num(qty[i.id]) > 0);
    if (items.length === 0) return setError("Informe a quantidade recebida de ao menos um item.");
    setBusy(true);
    setError(null);
    try {
      const receipt = await apiSend<{ id: string }>("/api/purchase-receipts", "POST", {
        purchaseOrderId: order.id,
        documentNumber: documentNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          purchaseOrderItemId: i.id,
          productId: i.product_id ?? undefined,
          quantityReceived: num(qty[i.id]),
          unit: i.unit ?? undefined,
          destinationLocationId: locationId,
        })),
      });
      if (confirmNow && canConfirm && receipt?.id) await apiSend(`/api/purchase-receipts/${receipt.id}/confirm`, "POST", {});
      for (const p of ["/api/purchase-receipts", "/api/purchase-orders", "/api/stock-balances", "/api/stock-movements"]) invalidateCache(p);
      setSelected("");
      setOrder(null);
      setDocumentNumber("");
      setNotes("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Receber mercadoria"
      description="Dá entrada no estoque dos itens de um pedido de compra enviado ao fornecedor."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            {confirmNow && canConfirm ? "Receber e dar entrada" : "Registrar recebimento"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {!orderId && (
          <FormField label="Pedido de compra" required help={orders.length === 0 ? "Nenhum pedido aguardando recebimento. O pedido precisa estar aprovado/enviado." : undefined}>
            <Combobox value={selected} onValueChange={setSelected} options={orderOptions} placeholder="Selecione o pedido" searchPlaceholder="Buscar pedido..." emptyText="Nenhum pedido." />
          </FormField>
        )}
        {current && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Itens do pedido {current.code}</span>
            {(current.items ?? []).map((i) => {
              const pending = Math.max(0, num(i.ordered_quantity) - num(i.received_quantity) - num(i.cancelled_quantity));
              return (
                <div key={i.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-border-subtle p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{i.description}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Pedido {num(i.ordered_quantity)} · recebido {num(i.received_quantity)} · pendente {pending}
                      {i.unit ? ` ${i.unit}` : ""}
                    </p>
                  </div>
                  <div className="w-28">
                    <FormField label="Recebendo">
                      <Input type="number" inputMode="decimal" min={0} step="any" value={qty[i.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))} />
                    </FormField>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Local de destino" required>
            <Combobox value={locationId} onValueChange={setLocationId} options={locations} placeholder="Selecione o local" searchPlaceholder="Buscar local..." emptyText="Nenhum local ativo." />
          </FormField>
          <FormField label="Nº da nota fiscal">
            <Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} maxLength={40} />
          </FormField>
        </div>
        <FormField label="Observações">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </FormField>
        {canConfirm && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Confirmar a entrada no estoque agora</span>
            <Switch checked={confirmNow} onCheckedChange={setConfirmNow} aria-label="Confirmar a entrada no estoque agora" />
          </label>
        )}
      </div>
    </Dialog>
  );
}
