"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { SimpleCreateDialog } from "@/components/forms/simple-forms";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { QuoteSuppliers } from "@/components/forms/StepPanels";
import { dbStatusCode } from "@/lib/status";

const ACTIONS: WorkflowAction[] = [
  { id: "order", label: "Gerar pedido de compra", path: "generate-order", permission: "purchase_orders.create", statuses: ["closed"], confirm: "Cria o pedido de compra com o fornecedor vencedor: itens, preços, condição e frete da proposta escolhida. Se já existir, nada é duplicado.", success: "Pedido de compra criado: siga em Suprimentos › Pedidos de compra." },
  { id: "cancel", label: "Cancelar cotação", path: "cancel", permission: "purchase_quotes.update", statuses: ["draft", "sent"], confirm: "A cotação é cancelada.", success: "Cotação cancelada.", tone: "danger" },
];
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, statusCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PurchaseQuoteRow } from "@/lib/database/schema";

export default function CotacoesPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/purchase-quotes");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<PurchaseQuoteRow>
      title="Cotações de compra"
      description="Cotações enviadas a fornecedores a partir de solicitações aprovadas."
      apiPath="/api/purchase-quotes"
      refreshToken={refresh}
      actions={
        can("purchase_quotes.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova cotação
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar cotação..."
      columns={[
        codeCol<PurchaseQuoteRow>("code", "Cotação"),
        dateCol<PurchaseQuoteRow>("created_at", "Criada em", { mobile: "meta" }),
        dateCol<PurchaseQuoteRow>("closed_at", "Encerrada em"),
        statusCol<PurchaseQuoteRow>("purchase_quotes"),
      ]}
      filters={[statusFilter<PurchaseQuoteRow>("purchase_quotes", "status", { server: true })]}
      detail={{
        render: (row) => <QuoteSuppliers key={`${String(row.id)}-${refresh}`} quoteId={String(row.id)} status={dbStatusCode("purchase_quotes", String(row.status ?? "")).toLowerCase()} onChanged={reload} />,
        actions: (row) => <WorkflowActions base="/api/purchase-quotes" id={String(row.id)} status={dbStatusCode("purchase_quotes", String(row.status ?? ""))} actions={ACTIONS} onDone={reload} />,
        title: (row) => row.code,
        badges: (row) => <StatusBadge entity="purchase_quotes" status={row.status} />,
      }}
      emptyDescription="Crie o primeiro pelo botão Nova cotação."
    />
    <SimpleCreateDialog form="purchaseQuotes" open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
