"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, CheckCircle2, PackageCheck, PackageOpen, Receipt, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { Progress } from "@/components/ui/Feedback";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Controls";
import { FormField } from "@/components/ui/FormField";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useBreadcrumbTail } from "@/components/shell/Breadcrumbs";
import { RecordHistory } from "@/components/resource/RecordHistory";
import { DetailError, DetailHeader, DetailSection, DetailSkeleton, InfoGrid, MiniTable } from "@/components/resource/DetailLayout";
import { useCached, invalidateCache } from "@/lib/dashboard/client";
import { apiSend } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { dbStatusCode } from "@/lib/status";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { AccountsReceivableRow, SalesOrderItemRow, SalesOrderRow, ShipmentRow } from "@/lib/database/schema";

// Detalhe do pedido de venda. As ações mostradas dependem do status
// atual E da permissão do usuário; a regra de transição continua no
// banco (fn_*_sales_order), que rejeita qualquer passo inválido.

type Order = SalesOrderRow & { items: SalesOrderItemRow[] };
type ActionId = "submit" | "approve" | "release" | "cancel" | "receivable";

const ACTIONS: Record<ActionId, { label: string; path: string; permission: string; statuses: string[]; confirm: string; tone?: "danger"; icon: typeof Send; success: string }> = {
  submit: { label: "Enviar para aprovação", path: "submit", permission: "sales_orders.update", statuses: ["draft"], confirm: "O pedido segue para aprovação e deixa de ser editável como rascunho.", icon: Send, success: "Pedido enviado para aprovação." },
  approve: { label: "Aprovar", path: "approve", permission: "sales_orders.approve", statuses: ["pending_approval"], confirm: "Aprovar libera o pedido para reserva de estoque.", icon: CheckCircle2, success: "Pedido aprovado." },
  release: { label: "Liberar reserva", path: "release-reservation", permission: "sales_orders.update", statuses: ["reserved", "reservation_pending"], confirm: "As quantidades reservadas voltam a ficar disponíveis no estoque.", icon: PackageOpen, success: "Reserva liberada." },
  receivable: { label: "Gerar conta a receber", path: "generate-receivable", permission: "accounts_receivable.approve", statuses: ["approved", "reserved", "picking", "ready_to_ship", "partially_shipped", "shipped", "completed"], confirm: "Gera o título a receber a partir do valor do pedido e das condições de pagamento.", icon: Receipt, success: "Conta a receber gerada." },
  cancel: { label: "Cancelar pedido", path: "cancel", permission: "sales_orders.cancel", statuses: ["draft", "pending_approval", "approved", "reservation_pending", "reserved"], confirm: "O cancelamento libera reservas e não pode ser desfeito.", tone: "danger", icon: Ban, success: "Pedido cancelado." },
};

export default function PedidoVendaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const order = useCached<Order>(`/api/sales-orders/${id}`);
  const shipmentsOk = can("shipments.view");
  const receivablesOk = can("accounts_receivable.view");
  const shipments = useCached<ShipmentRow[]>(`/api/shipments?salesOrderId=${id}`, shipmentsOk);
  const receivables = useCached<AccountsReceivableRow[]>(receivablesOk && order.data ? `/api/accounts-receivable?customerId=${order.data.customer_id}` : null, receivablesOk);
  const customers = useIdNameLookup("/api/customers");
  const locations = useIdNameLookup("/api/warehouse-locations");
  const [pending, setPending] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [reserveError, setReserveError] = useState<string | null>(null);
  useBreadcrumbTail(order.data?.code);

  const status = order.data ? dbStatusCode("sales_orders", order.data.status).toLowerCase() : "";
  const available = useMemo(
    () => (Object.keys(ACTIONS) as ActionId[]).filter((key) => ACTIONS[key].statuses.includes(status) && can(ACTIONS[key].permission)),
    [status, can]
  );
  const canReserve = ["approved", "reservation_pending"].includes(status) && can("sales_orders.reserve");

  function refresh() {
    invalidateCache(`/api/sales-orders`);
    invalidateCache(`/api/shipments`);
    invalidateCache(`/api/accounts-receivable`);
    order.reload();
    shipments.reload();
    receivables.reload();
  }

  async function run(action: ActionId) {
    setBusy(true);
    try {
      await apiSend(`/api/sales-orders/${id}/${ACTIONS[action].path}`, "POST", action === "receivable" ? {} : undefined);
      toast.success(ACTIONS[action].success);
      setPending(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  async function reserve() {
    if (!locationId) {
      setReserveError("Selecione o local de onde reservar.");
      return;
    }
    setBusy(true);
    try {
      await apiSend(`/api/sales-orders/${id}/reserve`, "POST", { locationId });
      toast.success("Estoque reservado.");
      setReserveOpen(false);
      refresh();
    } catch (error) {
      setReserveError(error instanceof Error ? error.message : "Não foi possível reservar.");
    } finally {
      setBusy(false);
    }
  }

  if (order.loading && !order.data) return <DetailSkeleton />;
  if (order.error || !order.data) return <DetailError error={order.error ?? "Registro não encontrado."} onRetry={order.reload} backHref="/comercial/pedidos-venda" />;

  const o = order.data;
  const items = o.items ?? [];
  const ordered = items.reduce((a, i) => a + Number(i.ordered_quantity || 0), 0);
  const shipped = items.reduce((a, i) => a + Number(i.shipped_quantity || 0), 0);
  const reserved = items.reduce((a, i) => a + Number(i.reserved_quantity || 0), 0);
  const itemsTotal = items.reduce((a, i) => a + Number(i.line_total || 0), 0);
  const address = [o.delivery_address, o.delivery_address_number, o.delivery_address_complement, o.delivery_neighborhood, o.delivery_city, o.delivery_state].filter(Boolean).join(", ");
  const orderReceivables = (receivables.data ?? []).filter((r) => r.origin_id === o.id);
  const customerName = customers.get(o.customer_id);

  return (
    <div className="flex flex-col gap-4">
      <DetailHeader
        backHref="/comercial/pedidos-venda"
        backLabel="Pedidos de venda"
        code={o.code}
        title={customerName ?? `Pedido ${o.code}`}
        status={<StatusBadge entity="sales_orders" status={o.status} />}
        meta={
          <>
            <span className="tabular-nums">Emitido em {formatDate(o.order_date)}</span>
            {o.expected_delivery_at && <span className="tabular-nums">Entrega prevista {formatDate(o.expected_delivery_at)}</span>}
          </>
        }
        actions={
          <>
            {canReserve && (
              <Button size="sm" onClick={() => { setReserveError(null); setReserveOpen(true); }}>
                <PackageCheck size={14} aria-hidden />
                Reservar estoque
              </Button>
            )}
            {available.map((key, index) => {
              const action = ACTIONS[key];
              const Icon = action.icon;
              const primary = !canReserve && index === 0 && action.tone !== "danger";
              return (
                <Button key={key} size="sm" variant={action.tone === "danger" ? "ghost" : primary ? "primary" : "secondary"} className={action.tone === "danger" ? "text-danger-fg" : undefined} onClick={() => setPending(key)}>
                  <Icon size={14} aria-hidden />
                  {action.label}
                </Button>
              );
            })}
          </>
        }
      />

      <StatStrip columns={4}>
        <Stat label="Total do pedido" value={formatCurrencyBRL(o.total_amount)} hint={`Itens ${formatCurrencyBRL(itemsTotal)} · frete ${formatCurrencyBRL(o.freight_cost)} · desconto ${formatCurrencyBRL(o.discount)}`} />
        <Stat label="Itens" value={items.length.toLocaleString("pt-BR")} hint={`${ordered.toLocaleString("pt-BR")} unidade(s) pedidas`} />
        <Stat label="Reservado" value={ordered > 0 ? `${Math.round((reserved / ordered) * 100)}%` : "—"} hint={`${reserved.toLocaleString("pt-BR")} de ${ordered.toLocaleString("pt-BR")}`} />
        <Stat label="Expedido" value={ordered > 0 ? `${Math.round((shipped / ordered) * 100)}%` : "—"} hint={`${shipped.toLocaleString("pt-BR")} de ${ordered.toLocaleString("pt-BR")}`} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-3">
        <DetailSection title="Informações" className="xl:col-span-2">
          <InfoGrid
            columns={3}
            items={[
              { label: "Cliente", value: customerName ?? "—" },
              { label: "Data do pedido", value: formatDate(o.order_date) },
              { label: "Entrega prevista", value: formatDate(o.expected_delivery_at) },
              { label: "Endereço de entrega", value: address || "—", wide: true },
              { label: "CEP", value: o.delivery_zip_code ?? "—", mono: true },
              { label: "Documento fiscal", value: o.fiscal_document_number ? `${o.fiscal_document_type ?? ""} ${o.fiscal_document_number}${o.fiscal_document_series ? `/${o.fiscal_document_series}` : ""}` : "—" },
              { label: "Chave de acesso", value: o.fiscal_access_key ?? "—", mono: true, wide: true },
              { label: "Observações", value: o.notes ?? "—", wide: true },
            ]}
          />
        </DetailSection>
        <DetailSection title="Andamento">
          <div className="flex flex-col gap-4 p-4">
            <ProgressRow label="Reserva" value={reserved} total={ordered} />
            <ProgressRow label="Expedição" value={shipped} total={ordered} />
            <p className="text-xs text-muted-foreground">
              Separação e expedição são registradas em{" "}
              <Link href="/logistica/picking" className="font-medium text-foreground underline underline-offset-2">Logística</Link>.
            </p>
          </div>
        </DetailSection>
      </div>

      <DetailSection title="Itens" description={`${items.length} item(ns)`}>
        <MiniTable
          rows={items}
          rowKey={(i) => i.id}
          empty="Pedido sem itens."
          columns={[
            { label: "Descrição", cell: (i) => <span className="line-clamp-1">{i.description}</span> },
            { label: "Un.", cell: (i) => i.unit ?? "—" },
            { label: "Pedida", align: "right", cell: (i) => Number(i.ordered_quantity).toLocaleString("pt-BR") },
            { label: "Reservada", align: "right", cell: (i) => Number(i.reserved_quantity).toLocaleString("pt-BR") },
            { label: "Expedida", align: "right", cell: (i) => Number(i.shipped_quantity).toLocaleString("pt-BR") },
            { label: "Preço unit.", align: "right", cell: (i) => formatCurrencyBRL(i.unit_price) },
            { label: "Total", align: "right", cell: (i) => <span className="font-medium">{formatCurrencyBRL(i.line_total)}</span> },
          ]}
        />
      </DetailSection>

      <div className="grid gap-4 xl:grid-cols-2">
        {shipmentsOk && (
          <DetailSection title="Expedições" description="Remessas geradas a partir deste pedido.">
            <MiniTable
              rows={shipments.data ?? []}
              rowKey={(s) => s.id}
              empty={shipments.loading ? "Carregando…" : shipments.error ?? "Nenhuma expedição para este pedido."}
              columns={[
                { label: "Código", cell: (s) => <span className="code">{s.code}</span> },
                { label: "Saída", cell: (s) => <span className="tabular-nums">{formatDate(s.shipped_at ?? s.expected_ship_date)}</span> },
                { label: "Status", cell: (s) => <StatusBadge entity="shipments" status={s.status} /> },
              ]}
            />
          </DetailSection>
        )}
        {receivablesOk && (
          <DetailSection title="Financeiro" description="Títulos a receber originados deste pedido.">
            <MiniTable
              rows={orderReceivables}
              rowKey={(r) => r.id}
              empty={receivables.loading ? "Carregando…" : receivables.error ?? "Nenhum título gerado para este pedido."}
              columns={[
                { label: "Título", cell: (r) => <span className="code">{r.code}</span> },
                { label: "Vencimento", cell: (r) => <span className="tabular-nums">{formatDate(r.due_date)}</span> },
                { label: "Valor", align: "right", cell: (r) => formatCurrencyBRL(r.updated_amount) },
                { label: "Status", cell: (r) => <StatusBadge entity="accounts_receivable" status={r.status} /> },
              ]}
            />
          </DetailSection>
        )}
      </div>

      <DetailSection title="Histórico" description="Alterações registradas na auditoria.">
        <div className="p-4">
          <RecordHistory entityId={o.id} />
        </div>
      </DetailSection>

      {pending && (
        <ConfirmDialog
          open
          title={`${ACTIONS[pending].label}?`}
          description={ACTIONS[pending].confirm}
          confirmLabel={ACTIONS[pending].label}
          tone={ACTIONS[pending].tone === "danger" ? "danger" : "default"}
          loading={busy}
          onConfirm={() => run(pending)}
          onCancel={() => setPending(null)}
        />
      )}

      <Dialog
        open={reserveOpen}
        onOpenChange={(next) => !busy && setReserveOpen(next)}
        title="Reservar estoque"
        description="Reserva as quantidades pendentes do pedido no local escolhido. Itens sem saldo ficam com reserva pendente."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReserveOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={reserve} loading={busy}>
              Reservar
            </Button>
          </>
        }
      >
        <FormField label="Local de estoque" required error={reserveError ?? undefined}>
          <Select
            value={locationId}
            onValueChange={(v) => { setLocationId(v); setReserveError(null); }}
            placeholder={locations.size === 0 ? "Nenhum local disponível" : "Selecione o local"}
            options={[...locations.entries()].map(([value, label]) => ({ value, label }))}
          />
        </FormField>
      </Dialog>
    </div>
  );
}

function ProgressRow({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} label={`${label}: ${pct}%`} />
    </div>
  );
}
