"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { FormDialog, num, opt, type FieldDef } from "@/components/forms/FormDialog";
import { SOURCES } from "@/components/forms/sources";
import { invalidateCache } from "@/lib/dashboard/client";
import { ResourceListPage } from "@/components/resource/ResourceListPage";
import { textCol, dateTimeCol, numberCol, refCol, enumFilter } from "@/components/data-table/columns";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import type { StockMovementRow } from "@/lib/database/schema";

const FIELDS: FieldDef[] = [
  { key: "productId", label: "Produto", type: "lookup", source: SOURCES.products, required: true },
  { key: "locationId", label: "Local", type: "lookup", source: SOURCES.locations, required: true },
  { key: "quantity", label: "Quantidade", type: "number", required: true },
  { key: "notes", label: "Motivo", type: "textarea", required: true, placeholder: "Ex.: produto com defeito, pedido PV-0004" },
];

export default function DevolucoesPage() {
  const products = useIdNameLookup("/api/products");
  const { can } = useSession();
  const [mode, setMode] = useState<"IN" | "OUT" | null>(null);
  const [refresh, setRefresh] = useState(0);

  return (
    <>
    <ResourceListPage<StockMovementRow>
      refreshToken={refresh}
      actions={
        <div className="flex flex-wrap gap-2">
          {can("stock.create") && (
            <Button size="sm" onClick={() => setMode("IN")}>
              <ArrowDownToLine size={14} aria-hidden /> Devolução de cliente
            </Button>
          )}
          {can("stock.adjust") && (
            <Button size="sm" variant="secondary" onClick={() => setMode("OUT")}>
              <ArrowUpFromLine size={14} aria-hidden /> Devolução a fornecedor
            </Button>
          )}
        </div>
      }
      title="Devoluções"
      description="Movimentações de devolução (RETURN_IN/RETURN_OUT) do ledger de estoque."
      apiPath="/api/stock-movements"
      baseFilter={(row) => row.movement_type === "RETURN_IN" || row.movement_type === "RETURN_OUT"}
      searchPlaceholder="Buscar produto ou origem..."
      columns={[
        dateTimeCol<StockMovementRow>("created_at", "Data", { mobile: "meta" }),
        textCol<StockMovementRow>("movement_type", "Tipo", { cell: (row) => (row.movement_type === "RETURN_IN" ? "Devolução de cliente" : "Devolução a fornecedor"), mobile: "title" }),
        refCol<StockMovementRow>("product_id", "Produto", products, { mobile: "meta" }),
        numberCol<StockMovementRow>("quantity", "Quantidade", { mobile: "meta" }),
        textCol<StockMovementRow>("reference_type", "Origem"),
      ]}
      filters={[enumFilter<StockMovementRow>("movement_type", "Tipo", [["RETURN_IN", "Devolução de cliente"], ["RETURN_OUT", "Devolução a fornecedor"]])]}
      detail={{
        title: () => "Devolução",
        subtitle: (row) => products.get(row.product_id) ?? undefined,
      }}
      emptyDescription="Registre devoluções pelos botões acima."
    />
    {mode && (
      <FormDialog
        open
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "IN" ? "Devolução de cliente" : "Devolução a fornecedor"}
        description={mode === "IN" ? "A mercadoria volta para o estoque, no local escolhido." : "A mercadoria sai do estoque, do local escolhido."}
        submitLabel="Registrar devolução"
        fields={FIELDS}
        path="/api/stock-movements/return"
        toBody={(v) => ({ productId: v.productId, locationId: v.locationId, quantity: num(v.quantity), direction: mode, notes: opt(v.notes) })}
        validate={(v) => (num(v.quantity) > 0 ? null : "A quantidade deve ser maior que zero.")}
        invalidate={["/api/stock-balances", "/api/stock-movements"]}
        onCreated={() => {
          toast.success("Devolução registrada.");
          setMode(null);
          invalidateCache("/api/stock-movements");
          setRefresh((n) => n + 1);
        }}
        size="md"
      />
    )}
    </>
  );
}
