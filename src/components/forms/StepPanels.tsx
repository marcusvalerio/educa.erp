"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { apiGet, apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL } from "@/lib/format";
import { FormDialog, filledItems, num, opt } from "./FormDialog";
import { SOURCES } from "./sources";

// Passos internos que pedem dados por item: digitar a contagem de
// inventário e registrar/escolher a resposta de cada fornecedor da cotação.

type Row = Record<string, unknown>;

function useNames(path: string, label: (r: Row) => string) {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let cancelled = false;
    cachedGet<Row[]>(lookupPath(path))
      .then((rows) => !cancelled && setMap(new Map((rows ?? []).map((r) => [String(r.id), label(r)]))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path, label]);
  return map;
}

/** Itens da contagem: quantidade esperada e campo para a contada. */
export function CountItems({ countId, status, onChanged }: { countId: string; status: string; onChanged: () => void }) {
  const { can } = useSession();
  const products = useNames(SOURCES.products.path, SOURCES.products.label!);
  const [items, setItems] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const editable = status === "counting" && can("stock.count");

  useEffect(() => {
    let cancelled = false;
    apiGet<Row>(`/api/stock-counts/${countId}`)
      .then((c) => !cancelled && setItems((c.items as Row[] | undefined) ?? []))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [countId, reload]);

  async function save(item: Row) {
    const value = draft[String(item.id)];
    if (value === undefined || value === "") return;
    setBusy(String(item.id));
    try {
      await apiSend(`/api/stock-counts/${countId}/items/${String(item.id)}/submit`, "POST", { countedQuantity: num(value) });
      setReload((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a contagem.");
    } finally {
      setBusy(null);
    }
  }

  if (!items) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando itens...</p>;
  const pending = items.filter((i) => i.status !== "counted").length;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-semibold">
        Itens <span className="font-normal text-muted-foreground">· {pending} a contar</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem saldo neste depósito.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-sm">
          {items.map((i) => {
            const id = String(i.id);
            const counted = i.counted_quantity === null || i.counted_quantity === undefined ? null : num(i.counted_quantity);
            const diff = counted === null ? null : counted - num(i.expected_quantity);
            return (
              <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate">{products.get(String(i.product_id)) ?? "Produto"}</span>
                <span className="text-xs text-muted-foreground tabular-nums">sistema {num(i.expected_quantity)}</span>
                {counted !== null && (
                  <Badge tone={diff === 0 ? "success" : "warning"}>
                    contado {counted}
                    {diff ? ` (${diff > 0 ? "+" : ""}${diff})` : ""}
                  </Badge>
                )}
                {editable && (
                  <span className="flex items-center gap-1">
                    <Input className="w-24" type="number" inputMode="decimal" min={0} step="any" placeholder="Contado" value={draft[id] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))} />
                    <Button size="sm" variant="secondary" loading={busy === id} disabled={!draft[id]} onClick={() => save(i)}>
                      Salvar
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Fornecedores convidados: registrar resposta (preços) e escolher o vencedor. */
export function QuoteSuppliers({ quoteId, status, onChanged }: { quoteId: string; status: string; onChanged: () => void }) {
  const { can } = useSession();
  const suppliers = useNames(SOURCES.suppliers.path, SOURCES.suppliers.label!);
  const products = useNames(SOURCES.products.path, SOURCES.products.label!);
  const [quote, setQuote] = useState<Row | null>(null);
  const [responding, setResponding] = useState<Row | null>(null);
  const [selecting, setSelecting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const open = !["closed", "cancelled"].includes(status);

  useEffect(() => {
    let cancelled = false;
    apiGet<Row>(`/api/purchase-quotes/${quoteId}`)
      .then((q) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setQuote({ suppliers: [] }));
    return () => {
      cancelled = true;
    };
  }, [quoteId, reload]);

  const rows = useMemo(() => ((quote?.suppliers as Row[] | undefined) ?? []), [quote]);
  const totalOf = (s: Row) => ((s.items as Row[] | undefined) ?? []).reduce((a, i) => a + num(i.quantity) * num(i.unit_price) - num(i.discount), 0) + num(s.freight_cost);

  async function select() {
    if (!selecting) return;
    setBusy(true);
    try {
      await apiSend(`/api/purchase-quotes/${quoteId}/suppliers/${String(selecting.id)}/select`, "POST", {});
      toast.success("Fornecedor escolhido.");
      setSelecting(null);
      invalidateCache("/api/purchase-quotes");
      setReload((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível escolher o fornecedor.");
    } finally {
      setBusy(false);
    }
  }

  if (!quote) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando fornecedores...</p>;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <h3 className="text-sm font-semibold">Fornecedores</h3>
      <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-sm">
        {rows.map((s) => (
          <li key={String(s.id)} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">{suppliers.get(String(s.supplier_id)) ?? "Fornecedor"}</span>
            {s.status !== "invited" && <span className="text-xs tabular-nums text-muted-foreground">{formatCurrencyBRL(totalOf(s))}{s.delivery_days != null ? ` · ${String(s.delivery_days)} dias` : ""}</span>}
            <Badge tone={s.status === "selected" ? "success" : s.status === "responded" ? "info" : s.status === "rejected" ? "neutral" : "warning"}>
              {s.status === "selected" ? "Escolhido" : s.status === "responded" ? "Respondeu" : s.status === "rejected" ? "Não escolhido" : "Aguardando"}
            </Badge>
            {open && can("purchase_quotes.update") && s.status !== "selected" && (
              <Button size="sm" variant="secondary" onClick={() => setResponding(s)}>
                {s.status === "responded" ? "Alterar resposta" : "Registrar resposta"}
              </Button>
            )}
            {open && can("purchase_quotes.approve") && s.status === "responded" && (
              <Button size="sm" onClick={() => setSelecting(s)}>
                Escolher
              </Button>
            )}
          </li>
        ))}
      </ul>
      {responding && (
        <FormDialog
          open
          onOpenChange={(o) => !o && setResponding(null)}
          title={`Resposta de ${suppliers.get(String(responding.supplier_id)) ?? "fornecedor"}`}
          description="Preços e condições que o fornecedor mandou."
          submitLabel="Salvar resposta"
          fields={[
            { key: "items", label: "Itens cotados", type: "items", required: true, source: SOURCES.products, columns: [{ key: "quantity", label: "Quantidade", default: "1" }, { key: "unitPrice", label: "Preço unit.", money: true }] },
            { key: "freightCost", label: "Frete (R$)", type: "money" },
            { key: "deliveryDays", label: "Prazo de entrega (dias)", type: "number" },
            { key: "paymentTerms", label: "Condição de pagamento", type: "text" },
            { key: "validUntil", label: "Proposta válida até", type: "date" },
          ]}
          path={`/api/purchase-quotes/${quoteId}/suppliers/${String(responding.id)}/respond`}
          validate={(v) => (filledItems(v, "items").every((i) => num(i.quantity) > 0 && String(i.unitPrice ?? "") !== "") ? null : "Informe quantidade e preço de cada item.")}
          toBody={(v) => ({
            items: filledItems(v, "items").map((i) => ({ productId: i.ref, description: products.get(String(i.ref)) ?? "Item", quantity: num(i.quantity), unitPrice: num(i.unitPrice) })),
            freightCost: num(v.freightCost),
            deliveryDays: opt(v.deliveryDays) ? Math.round(num(v.deliveryDays)) : undefined,
            paymentTerms: opt(v.paymentTerms),
            validUntil: opt(v.validUntil),
          })}
          onCreated={() => {
            toast.success("Resposta registrada.");
            setResponding(null);
            setReload((n) => n + 1);
            onChanged();
          }}
        />
      )}
      {selecting && (
        <ConfirmDialog
          open
          title="Escolher este fornecedor?"
          description="A cotação é encerrada com este fornecedor; os demais ficam como não escolhidos. Depois, crie o pedido de compra."
          confirmLabel="Escolher"
          loading={busy}
          onConfirm={select}
          onCancel={() => setSelecting(null)}
        />
      )}
    </div>
  );
}
