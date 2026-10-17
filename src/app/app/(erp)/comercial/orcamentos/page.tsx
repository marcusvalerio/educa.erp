"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api-client";
import { NewOrderDialog } from "@/components/commercial/NewOrderDialog";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { dbStatusCode } from "@/lib/status";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, moneyCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { SalesQuoteRow } from "@/lib/database/schema";

const QUOTE_ACTIONS: WorkflowAction[] = [
  { id: "send", label: "Enviar ao cliente", path: "send", permission: "sales_quotes.update", statuses: ["draft"], confirm: "O orçamento é marcado como enviado e aguarda a resposta do cliente.", success: "Orçamento enviado." },
  { id: "approve", label: "Cliente aprovou", path: "approve", permission: "sales_quotes.approve", statuses: ["sent"], confirm: "O orçamento fica aprovado e pode virar pedido de venda.", success: "Orçamento aprovado." },
  { id: "reject", label: "Cliente recusou", path: "reject", permission: "sales_quotes.approve", statuses: ["sent"], confirm: "O orçamento fica recusado.", success: "Orçamento recusado.", tone: "danger" },
  { id: "expire", label: "Marcar como expirado", path: "expire", permission: "sales_quotes.update", statuses: ["sent"], confirm: "A validade venceu sem resposta.", success: "Orçamento expirado." },
  { id: "cancel", label: "Cancelar", path: "cancel", permission: "sales_quotes.cancel", statuses: ["draft", "sent", "rejected", "expired"], confirm: "O orçamento é cancelado.", success: "Orçamento cancelado.", tone: "danger" },
];

export default function OrcamentosPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/sales-quotes");
    setRefresh((n) => n + 1);
  };
  const router = useRouter();
  const [converting, setConverting] = useState(false);
  async function toOrder(row: SalesQuoteRow) {
    setConverting(true);
    try {
      const order = await apiSend<{ id: string }>("/api/sales-orders", "POST", { customerId: row.customer_id, salesQuoteId: row.id });
      invalidateCache("/api/sales-orders");
      toast.success("Pedido de venda gerado a partir do orçamento.");
      router.push(`/app/comercial/pedidos-venda/${order.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o pedido.");
    } finally {
      setConverting(false);
    }
  }
  const customers = useIdNameLookup("/api/customers");

  return (
    <>
    <ResourceListPage<SalesQuoteRow>
      title="Orçamentos"
      description="Propostas de venda enviadas a clientes, do rascunho à aprovação ou expiração."
      apiPath="/api/sales-quotes"
      refreshToken={refresh}
      actions={
        can("sales_quotes.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Novo orçamento
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar orçamento ou cliente..."
      columns={[
        codeCol<SalesQuoteRow>("code", "Orçamento"),
        refCol<SalesQuoteRow>("customer_id", "Cliente", customers, { mobile: "meta" }),
        dateCol<SalesQuoteRow>("issued_at", "Emissão"),
        dateCol<SalesQuoteRow>("valid_until", "Validade", { overdueWhen: (row) => isRowOverdue(row, "valid_until", ["draft", "sent"]), mobile: "meta" }),
        moneyCol<SalesQuoteRow>("total_amount", "Total", { mobile: "meta" }),
        statusCol<SalesQuoteRow>("sales_quotes"),
      ]}
      filters={[
        combineViews<SalesQuoteRow>(
          overdueView<SalesQuoteRow>("valid_until", ["draft", "sent"], "Validade vencida"),
          statusViews<SalesQuoteRow>([{ value: "enviados", label: "Aguardando cliente", statuses: ["sent"] }])
        ),
        statusFilter<SalesQuoteRow>("sales_quotes", "status", { server: true }),
      ]}
      detail={{
        actions: (row) => <WorkflowActions base="/api/sales-quotes" id={row.id} status={dbStatusCode("sales_quotes", String(row.status ?? ""))} actions={QUOTE_ACTIONS} onDone={reload} extra={dbStatusCode("sales_quotes", String(row.status ?? "")).toLowerCase() === "approved" && can("sales_orders.create") ? <Button size="sm" loading={converting} onClick={() => toOrder(row)}>Gerar pedido de venda</Button> : undefined} />,
        title: (row) => row.code,
        subtitle: (row) => customers.get(row.customer_id) ?? undefined,
        badges: (row) => <StatusBadge entity="sales_quotes" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro orçamento pelo botão Novo orçamento."
    />
    <NewOrderDialog kind="quote" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); toast.success("Orçamento criado como rascunho."); reload(); }} />
    </>
  );
}
