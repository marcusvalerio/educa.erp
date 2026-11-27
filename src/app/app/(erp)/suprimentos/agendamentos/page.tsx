"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache, useCached } from "@/lib/dashboard/client";
import { dbStatusCode } from "@/lib/status";
import { formatDate, formatDateTime } from "@/lib/format";
import { FormDialog, type FieldDef } from "@/components/forms/FormDialog";
import { WorkflowActions } from "@/components/forms/WorkflowActions";
import { RECEIPT_ACTIONS } from "@/components/forms/receipt-actions";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { DetailSection, MiniTable } from "@/components/resource/DetailLayout";
import { codeCol, textCol, dateCol, statusCol, refCol, statusFilter, statusViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { PurchaseOrderRow, PurchaseReceiptRow } from "@/lib/database/schema";

// Pedidos que podem ter a entrega agendada (aprovados, enviados ou com saldo a receber).
const SCHEDULABLE = ["approved", "sent", "partially_received"];

const SCHEDULE_FIELDS: FieldDef[] = [
  { key: "date", label: "Data prevista", type: "date", required: true },
  { key: "time", label: "Hora prevista (HH:MM)", type: "text", required: true, placeholder: "08:00", maxLength: 5 },
];

/** Data/hora do agendamento: delivery_scheduled_at (0135) ou só a data prevista. */
function scheduleOf(o: PurchaseOrderRow): { at: string | null; label: string } {
  if (o.delivery_scheduled_at) return { at: o.delivery_scheduled_at, label: formatDateTime(o.delivery_scheduled_at) };
  if (o.expected_delivery_at) return { at: `${o.expected_delivery_at.slice(0, 10)}T23:59:59`, label: formatDate(o.expected_delivery_at) };
  return { at: null, label: "—" };
}

export default function AgendamentosPage() {
  const { can } = useSession();
  const [refresh, setRefresh] = useState(0);
  const [scheduling, setScheduling] = useState<PurchaseOrderRow | null>(null);
  const reload = () => {
    invalidateCache("/api/purchase-receipts");
    setRefresh((n) => n + 1);
  };
  const suppliers = useIdNameLookup("/api/suppliers", "legal_name");
  const orders = useCached<PurchaseOrderRow[]>("/api/purchase-orders");
  const open = useMemo(
    () => (orders.data ?? []).filter((o) => SCHEDULABLE.includes(dbStatusCode("purchase_orders", String(o.status ?? "")).toLowerCase())),
    [orders.data],
  );
  const now = new Date().toISOString();
  const upcoming = useMemo(
    () => open.filter((o) => { const at = scheduleOf(o).at; return at && new Date(at).toISOString() >= now; }).sort((a, b) => String(scheduleOf(a).at).localeCompare(String(scheduleOf(b).at))),
    [open, now],
  );
  const unscheduled = useMemo(() => open.filter((o) => !scheduleOf(o).at), [open]);

  const orderColumns = (withAction: boolean) => [
    { label: "Pedido", cell: (o: PurchaseOrderRow) => <span className="font-mono">{o.code}</span> },
    { label: "Fornecedor", cell: (o: PurchaseOrderRow) => suppliers.get(o.supplier_id) ?? "—" },
    { label: "Entrega prevista", cell: (o: PurchaseOrderRow) => scheduleOf(o).label },
    { label: "Status", cell: (o: PurchaseOrderRow) => <StatusBadge entity="purchase_orders" status={o.status} /> },
    ...(withAction && can("purchase_orders.update")
      ? [{ label: "", align: "right" as const, cell: (o: PurchaseOrderRow) => (
          <Button size="sm" variant="secondary" onClick={() => setScheduling(o)}>
            <CalendarClock size={14} aria-hidden /> {scheduleOf(o).at ? "Reagendar" : "Agendar entrega"}
          </Button>
        ) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <DetailSection title="Entregas agendadas" description="Próximas entregas de pedidos de compra, pela data e hora previstas.">
        <MiniTable rows={upcoming} rowKey={(o) => o.id} empty={orders.loading ? "Carregando…" : "Nenhuma entrega futura agendada."} columns={orderColumns(true)} />
      </DetailSection>
      <DetailSection title="Pedidos sem agendamento" description="Pedidos aprovados ou enviados ainda sem data de entrega.">
        <MiniTable rows={unscheduled} rowKey={(o) => o.id} empty={orders.loading ? "Carregando…" : "Todos os pedidos em aberto têm entrega prevista."} columns={orderColumns(true)} />
      </DetailSection>

      <ResourceListPage<PurchaseReceiptRow>
        title="Agendamentos de recebimento"
        description="Recebimentos agendados e confirmados junto a fornecedores para os pedidos em aberto."
        apiPath="/api/purchase-receipts"
        refreshToken={refresh}
        searchPlaceholder="Buscar recebimento, documento ou fornecedor..."
        columns={[
          codeCol<PurchaseReceiptRow>("code", "Recebimento"),
          refCol<PurchaseReceiptRow>("supplier_id", "Fornecedor", suppliers, { mobile: "meta" }),
          dateCol<PurchaseReceiptRow>("received_at", "Recebido em", { mobile: "meta" }),
          textCol<PurchaseReceiptRow>("document_number", "Documento", { mono: true }),
          statusCol<PurchaseReceiptRow>("purchase_receipts"),
        ]}
        filters={[
          statusViews<PurchaseReceiptRow>([{ value: "conferencia", label: "Em conferência", statuses: ["draft"] }]),
          statusFilter<PurchaseReceiptRow>("purchase_receipts", "status", { server: true }),
        ]}
        detail={{
          title: (row) => row.code,
          subtitle: (row) => suppliers.get(row.supplier_id) ?? undefined,
          badges: (row) => <StatusBadge entity="purchase_receipts" status={row.status} />,
          actions: (row) => <WorkflowActions base="/api/purchase-receipts" id={row.id} status={dbStatusCode("purchase_receipts", String(row.status ?? ""))} actions={RECEIPT_ACTIONS} onDone={reload} />,
        }}
        emptyDescription="Quando houver registros, eles aparecem aqui."
      />

      {scheduling && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setScheduling(null)}
          title={`Agendar entrega — ${scheduling.code}`}
          description="Data e hora em que o fornecedor deve entregar o pedido."
          submitLabel="Agendar entrega"
          fields={SCHEDULE_FIELDS}
          initial={{
            date: String(scheduling.expected_delivery_at ?? "").slice(0, 10),
            time: scheduling.delivery_scheduled_at ? new Date(scheduling.delivery_scheduled_at).toTimeString().slice(0, 5) : "08:00",
          }}
          path={`/api/purchase-orders/${scheduling.id}/schedule-delivery`}
          validate={(v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v.time).trim()) ? null : "Informe a hora no formato HH:MM (ex.: 08:30).")}
          toBody={(v) => ({ date: String(v.date), scheduledAt: new Date(`${String(v.date)}T${String(v.time).trim()}:00`).toISOString() })}
          invalidate={["/api/purchase-orders"]}
          onCreated={() => {
            toast.success("Entrega agendada.");
            setScheduling(null);
            orders.reload();
          }}
          size="sm"
        />
      )}
    </div>
  );
}
