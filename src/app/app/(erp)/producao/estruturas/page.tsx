"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useSession } from "@/components/shell/SessionProvider";
import { invalidateCache } from "@/lib/dashboard/client";
import { NewBomDialog } from "@/components/production/ProductionDialogs";
import { WorkflowActions, type WorkflowAction } from "@/components/forms/WorkflowActions";
import { dbStatusCode } from "@/lib/status";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { codeCol, dateCol, numberCol, statusCol, refCol, statusFilter } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { ProductBomRow } from "@/lib/database/schema";

const BOM_ACTIONS: WorkflowAction[] = [
  { id: "activate", label: "Ativar", path: "activate", permission: "production_boms.approve", statuses: ["draft"], confirm: "A estrutura passa a valer para novas ordens de produção.", success: "Estrutura vigente." },
  { id: "obsolete", label: "Tornar obsoleta", path: "obsolete", permission: "production_boms.approve", statuses: ["active"], confirm: "Novas ordens não usam mais esta estrutura.", success: "Estrutura obsoleta.", tone: "danger" },
];

export default function EstruturasPage() {
  const { can } = useSession();
  const [creating, setCreating] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const reload = () => {
    invalidateCache("/api/product-boms");
    setRefresh((n) => n + 1);
  };
  const products = useIdNameLookup("/api/products");

  return (
    <>
    <ResourceListPage<ProductBomRow>
      title="Estruturas de produto (BOM)"
      description="Fichas técnicas por produto e versão — base das ordens de produção."
      apiPath="/api/product-boms"
      refreshToken={refresh}
      actions={
        can("production_boms.create") ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> Nova estrutura
          </Button>
        ) : undefined
      }
      searchPlaceholder="Buscar estrutura ou produto..."
      columns={[
        codeCol<ProductBomRow>("code", "Estrutura"),
        refCol<ProductBomRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<ProductBomRow>("version", "Versão", { digits: 0, width: "5rem" }),
        numberCol<ProductBomRow>("reference_quantity", "Qtd. referência"),
        dateCol<ProductBomRow>("valid_from", "Vigência"),
        statusCol<ProductBomRow>("product_boms"),
      ]}
      filters={[statusFilter<ProductBomRow>("product_boms", "status", { server: true })]}
      detail={{
        actions: (row) => <WorkflowActions base="/api/product-boms" id={row.id} status={dbStatusCode("product_boms", String(row.status ?? ""))} actions={BOM_ACTIONS} onDone={reload} />,
        title: (row) => row.code,
        subtitle: (row) => products.get(row.product_id) ?? undefined,
        badges: (row) => <StatusBadge entity="product_boms" status={row.status} />,
      }}
      emptyDescription="Crie a primeira estrutura pelo botão Nova estrutura."
    />
    <NewBomDialog open={creating} onOpenChange={setCreating} onCreated={() => { setCreating(false); reload(); }} />
    </>
  );
}
