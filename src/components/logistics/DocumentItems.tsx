"use client";

import { MiniTable } from "@/components/resource/DetailLayout";
import { Badge } from "@/components/ui/Badge";
import { useCached } from "@/lib/dashboard/client";
import { useLabelLookup, locationLabel, productLabel } from "@/lib/useIdNameLookup";
import type { PickListItemRow, PurchaseReceiptItemRow, StockTransferItemRow } from "@/lib/database/schema";

// Itens dos documentos de logística (recebimento, separação, transferência)
// no painel de detalhe: produto "código — descrição", quantidade e local.

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

function useLabels() {
  return { products: useLabelLookup("/api/products", productLabel), locations: useLabelLookup("/api/warehouse-locations", locationLabel) };
}

function Wrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

const loadingText = <p className="px-4 py-3 text-sm text-muted-foreground">Carregando itens...</p>;

export function ReceiptItems({ id }: { id: string }) {
  const doc = useCached<{ items: PurchaseReceiptItemRow[] }>(`/api/purchase-receipts/${id}`);
  const { products, locations } = useLabels();
  if (doc.loading && !doc.data) return loadingText;
  const items = doc.data?.items ?? [];
  const rejected = items.reduce((a, i) => a + Number(i.rejected_quantity || 0), 0);
  return (
    <Wrap title="Itens recebidos">
      {rejected > 0 && <p className="text-sm text-warning-fg">Recebimento com divergência: {n(rejected)} unidade(s) recusada(s).</p>}
      <MiniTable<PurchaseReceiptItemRow>
        rows={items}
        rowKey={(i) => i.id}
        empty="Sem itens."
        columns={[
          { label: "Produto", cell: (i) => products.get(i.product_id) ?? "Produto" },
          { label: "Recebido", align: "right", cell: (i) => `${n(i.quantity_received)}${i.unit ? ` ${i.unit}` : ""}` },
          { label: "Aceito", align: "right", cell: (i) => n(i.accepted_quantity) },
          { label: "Recusado", align: "right", cell: (i) => (Number(i.rejected_quantity) > 0 ? <Badge tone="warning">{n(i.rejected_quantity)}</Badge> : "—") },
          { label: "Destino", cell: (i) => locations.get(i.destination_location_id) ?? "—" },
        ]}
      />
    </Wrap>
  );
}

export function PickListItems({ id }: { id: string }) {
  const doc = useCached<{ items: PickListItemRow[] }>(`/api/pick-lists/${id}`);
  const { products, locations } = useLabels();
  if (doc.loading && !doc.data) return loadingText;
  return (
    <Wrap title="Itens a separar">
      <MiniTable<PickListItemRow>
        rows={doc.data?.items ?? []}
        rowKey={(i) => i.id}
        empty="Sem itens."
        columns={[
          { label: "Produto", cell: (i) => products.get(i.product_id) ?? "Produto" },
          { label: "Local", cell: (i) => locations.get(i.location_id) ?? "—" },
          { label: "A separar", align: "right", cell: (i) => n(i.requested_quantity) },
          { label: "Separado", align: "right", cell: (i) => n(i.picked_quantity) },
        ]}
      />
    </Wrap>
  );
}

export function TransferItems({ id, fromLocationId, toLocationId }: { id: string; fromLocationId?: string | null; toLocationId?: string | null }) {
  const doc = useCached<{ items: StockTransferItemRow[] }>(`/api/stock-transfers/${id}`);
  const { products, locations } = useLabels();
  if (doc.loading && !doc.data) return loadingText;
  return (
    <Wrap title="Itens">
      <p className="text-xs text-muted-foreground">
        De {(fromLocationId && locations.get(fromLocationId)) || "—"} para {(toLocationId && locations.get(toLocationId)) || "—"}
      </p>
      <MiniTable<StockTransferItemRow>
        rows={doc.data?.items ?? []}
        rowKey={(i) => i.id}
        empty="Sem itens."
        columns={[
          { label: "Produto", cell: (i) => products.get(i.product_id) ?? "Produto" },
          { label: "Quantidade", align: "right", cell: (i) => n(i.quantity) },
        ]}
      />
    </Wrap>
  );
}
