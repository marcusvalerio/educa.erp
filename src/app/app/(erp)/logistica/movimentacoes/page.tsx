"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { FormDialog, num, opt, type FieldDef } from "@/components/forms/FormDialog";
import { SOURCES } from "@/components/forms/sources";
import { invalidateCache } from "@/lib/dashboard/client";
import { textCol, dateTimeCol, numberCol, refCol, enumFilter } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockMovementRow } from "@/lib/database/schema";
import { MOVEMENT_TYPE_OPTIONS, movementTypeLabel, referenceTypeLabel } from "@/lib/stock-labels";

// Entrada e saída avulsas (ajustes, consumo, saldo inicial). Compra entra
// pelo Recebimento; venda sai pela expedição do pedido.
const ENTRY: FieldDef[] = [
  { key: "productId", label: "Produto", type: "lookup", source: SOURCES.products, required: true },
  { key: "locationId", label: "Local", type: "lookup", source: SOURCES.locations, required: true },
  { key: "quantity", label: "Quantidade", type: "number", required: true },
  { key: "unitCost", label: "Custo unitário (R$)", type: "money", help: "Opcional: entra no custo médio." },
  { key: "notes", label: "Motivo / observação", type: "textarea", placeholder: "Ex.: saldo inicial, devolução interna" },
];
const EXIT: FieldDef[] = ENTRY.filter((f) => f.key !== "unitCost").map((f) => (f.key === "notes" ? { ...f, placeholder: "Ex.: consumo interno, perda, amostra" } : f));
const body = (v: Record<string, unknown>) => ({ productId: v.productId, locationId: v.locationId, quantity: num(v.quantity), unitCost: opt(v.unitCost) ? num(v.unitCost) : undefined, notes: opt(v.notes) });
const positive = (v: Record<string, unknown>) => (num(v.quantity) > 0 ? null : "A quantidade deve ser maior que zero.");

export default function MovimentacoesPage() {
  const products = useIdNameLookup("/api/products");
  const locations = useIdNameLookup("/api/warehouse-locations");
  const { can } = useSession();
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [refresh, setRefresh] = useState(0);
  const done = (msg: string) => {
    setMode(null);
    toast.success(msg);
    invalidateCache("/api/stock-movements");
    invalidateCache("/api/stock-balances");
    setRefresh((n) => n + 1);
  };

  return (
    <>
    <ResourceListPage<StockMovementRow>
      title="Movimentações de estoque"
      description="Ledger de estoque — imutável, nunca editado por esta tela."
      apiPath="/api/stock-movements"
      searchPlaceholder="Buscar produto, local ou origem..."
      refreshToken={refresh}
      actions={
        <div className="flex gap-2">
          {can("stock.create") && (
            <Button size="sm" onClick={() => setMode("in")}>
              <ArrowDownToLine size={14} aria-hidden /> Entrada
            </Button>
          )}
          {can("stock.adjust") && (
            <Button size="sm" variant="secondary" onClick={() => setMode("out")}>
              <ArrowUpFromLine size={14} aria-hidden /> Saída
            </Button>
          )}
        </div>
      }
      columns={[
        dateTimeCol<StockMovementRow>("created_at", "Data", { mobile: "meta" }),
        textCol<StockMovementRow>("movement_type", "Tipo", { cell: (row) => movementTypeLabel(row.movement_type), value: (row) => movementTypeLabel(row.movement_type), mobile: "title" }),
        refCol<StockMovementRow>("product_id", "Produto", products, { mobile: "meta" }),
        refCol<StockMovementRow>("location_id", "Local", locations),
        numberCol<StockMovementRow>("quantity", "Quantidade", { mobile: "meta" }),
        textCol<StockMovementRow>("reference_type", "Origem", { cell: (row) => referenceTypeLabel(row.reference_type), value: (row) => referenceTypeLabel(row.reference_type) }),
      ]}
      filters={[enumFilter<StockMovementRow>("movement_type", "Tipo", MOVEMENT_TYPE_OPTIONS)]}
      detail={{
        title: (row) => movementTypeLabel(row.movement_type),
        subtitle: (row) => products.get(row.product_id) ?? undefined,
      }}
      emptyDescription="Registre a primeira entrada pelo botão Entrada."
    />
    <FormDialog
      open={mode === "in"}
      onOpenChange={(o) => !o && setMode(null)}
      title="Entrada de estoque"
      description="Entrada avulsa num local. Compras entram pelo Recebimento de mercadorias."
      submitLabel="Dar entrada"
      fields={ENTRY}
      path="/api/stock-movements/receive"
      toBody={body}
      validate={positive}
      invalidate={["/api/stock-balances"]}
      onCreated={() => done("Entrada registrada.")}
      size="md"
    />
    <FormDialog
      open={mode === "out"}
      onOpenChange={(o) => !o && setMode(null)}
      title="Saída de estoque"
      description="Saída avulsa de um local. Vendas saem pela expedição do pedido."
      submitLabel="Dar saída"
      fields={EXIT}
      path="/api/stock-movements/issue"
      toBody={body}
      validate={positive}
      invalidate={["/api/stock-balances"]}
      onCreated={() => done("Saída registrada.")}
      size="md"
    />
    </>
  );
}
