"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { NewProductionOrderDialog, OrderMaterials, OutputDialog } from "@/components/production/ProductionDialogs";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { dbStatusCode } from "@/lib/status";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, numberCol, statusCol, refCol, statusFilter, overdueView, isRowOverdue, enumFilter, statusViews, combineViews } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProductionOrderRow } from "@/lib/database/schema";

const OP_ACTIONS: WorkflowAction[] = [
  { id: "plan", label: "Planejar", path: "plan", permission: "production_orders.update", statuses: ["draft"], confirm: "A ordem passa para planejada.", success: "Ordem planejada." },
  { id: "release", label: "Liberar e reservar materiais", path: "release", permission: "production_orders.release", statuses: ["draft", "planned", "released"], confirm: "Reserva os componentes no local dos materiais. Falta de saldo impede a liberação.", success: "Materiais reservados." },
  { id: "start", label: "Iniciar produção", path: "start", permission: "production_orders.start", statuses: ["materials_reserved"], confirm: "A ordem entra em produção. Depois: consumir os materiais (baixa do estoque) e apontar a produção (produto pronto entra no estoque).", success: "Produção iniciada." },
  { id: "complete", label: "Concluir", path: "complete", permission: "production_orders.complete", statuses: ["in_progress"], confirm: "Encerra a ordem com o que foi apontado. Material reservado que ainda não foi consumido é baixado do estoque agora e entra no custo da ordem.", success: "Ordem concluída: materiais baixados do estoque." },
  { id: "hold", label: "Pausar", path: "hold", permission: "production_orders.update", statuses: ["in_progress"], confirm: "A ordem fica em espera.", success: "Ordem em espera." },
  { id: "resume", label: "Retomar", path: "resume", permission: "production_orders.update", statuses: ["on_hold"], confirm: "A ordem volta para produção.", success: "Ordem retomada." },
  { id: "cancel", label: "Cancelar ordem", path: "cancel", permission: "production_orders.cancel", statuses: ["draft", "planned", "released", "materials_reserved", "on_hold"], confirm: "Reservas são liberadas. Não pode ser desfeito.", success: "Ordem cancelada.", tone: "danger" },
];

export default function OrdensProducaoPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/production-orders");
    setRefresh((n) => n + 1);
  };
  const [output, setOutput] = useState<string | null>(null);
  const products = useIdNameLookup("/api/products");

  return (
    <>
    <ResourceListPage<ProductionOrderRow>
      title="Ordens de produção"
      description="Ordens de produção a partir da estrutura (BOM), do planejamento à conclusão."
      apiPath="/api/production-orders"
      refreshToken={refresh}
      actions={
        can("production_orders.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova ordem
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar OP ou produto..."
      columns={[
        codeCol<ProductionOrderRow>("code", "OP"),
        refCol<ProductionOrderRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<ProductionOrderRow>("planned_quantity", "Planejado"),
        numberCol<ProductionOrderRow>("produced_quantity", "Produzido", { mobile: "meta" }),
        numberCol<ProductionOrderRow>("rejected_quantity", "Refugo", { defaultHidden: true }),
        statusCol<ProductionOrderRow>(undefined, "priority", "Prioridade", { width: "7rem" }),
        dateCol<ProductionOrderRow>("planned_date", "Data planejada", { overdueWhen: (row) => isRowOverdue(row, "planned_date", ["planned","released","materials_reserved","in_progress","on_hold"]) }),
        statusCol<ProductionOrderRow>("production_orders"),
      ]}
      filters={[
        combineViews<ProductionOrderRow>(
          overdueView<ProductionOrderRow>("planned_date", ["planned","released","materials_reserved","in_progress","on_hold"], "Atrasadas"),
          statusViews<ProductionOrderRow>([{ value: "producao", label: "Em produção", statuses: ["in_progress"] }, { value: "espera", label: "Em espera", statuses: ["on_hold"] }])
        ),
        statusFilter<ProductionOrderRow>("production_orders", "status", { server: true }),
        enumFilter<ProductionOrderRow>("priority", "Prioridade", [["low", "Baixa"], ["medium", "Média"], ["high", "Alta"], ["urgent", "Urgente"]]),
      ]}
      detail={{
        render: (row) => <OrderMaterials key={`${row.id}-${refresh}`} orderId={row.id} status={dbStatusCode("production_orders", String(row.status ?? "")).toLowerCase()} onChanged={reload} />,
        actions: (row) => <WorkflowActions base="/api/production-orders" id={row.id} status={dbStatusCode("production_orders", String(row.status ?? ""))} actions={OP_ACTIONS} onDone={reload} extra={dbStatusCode("production_orders", String(row.status ?? "")).toLowerCase() === "in_progress" && can("production_orders.update") ? <Button size="sm" onClick={() => setOutput(row.id)}>Apontar produção</Button> : undefined} />,
        title: (row) => row.code,
        subtitle: (row) => products.get(row.product_id) ?? undefined,
        badges: (row) => <StatusBadge entity="production_orders" status={row.status} />,
      }}
      emptyDescription="Crie a primeira ordem pelo botão Nova ordem. O produto precisa ter origem Fabricado e estrutura vigente."
    />
    <NewProductionOrderDialog open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    {output && <OutputDialog orderId={output} onClose={() => setOutput(null)} onDone={() => { setOutput(null); reload(); }} />}
    </>
  );
}
