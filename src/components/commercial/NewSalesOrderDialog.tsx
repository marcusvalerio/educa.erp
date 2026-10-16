"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL } from "@/lib/format";
import type { Cliente, Produto } from "@/lib/cadastros/types";

// Novo pedido de venda com itens do cadastro de produtos. A regra (cliente
// da empresa, permissão sales_orders.create, totais, código do pedido) é do
// banco — fn_create_sales_order; aqui só se monta o corpo de POST /api/sales-orders.

type Line = { key: number; productId: string; quantity: string; unitPrice: string; discount: string };

const toNumber = (value: string) => Number(String(value).replace(",", ".")) || 0;
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1", unitPrice: "", discount: "" });

export function NewSalesOrderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void }) {
  const [customers, setCustomers] = useState<Cliente[]>([]);
  const [products, setProducts] = useState<Produto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [freight, setFreight] = useState("");
  const [discount, setDiscount] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lê a lista na hora de abrir (sem o cache de 1 min): produto ou cliente
  // recém-cadastrado precisa aparecer aqui imediatamente.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invalidateCache("/api/products");
    invalidateCache("/api/customers");
    Promise.all([cachedGet<Cliente[]>(lookupPath("/api/customers")), cachedGet<Produto[]>(lookupPath("/api/products"))])
      .then(([c, p]) => {
        if (cancelled) return;
        setCustomers(c.filter((x) => x.status === "Ativo"));
        setProducts(p.filter((x) => x.status === "Ativo"));
        setLoadError(null);
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : "Não foi possível carregar clientes e produtos."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` })), [products]);
  const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.nome })), [customers]);

  const itemsTotal = lines.reduce((sum, l) => sum + Math.max(0, toNumber(l.quantity) * toNumber(l.unitPrice) - toNumber(l.discount)), 0);
  const total = Math.max(0, itemsTotal - toNumber(discount) + toNumber(freight));

  function reset() {
    setCustomerId("");
    setLines([emptyLine()]);
    setFreight("");
    setDiscount("");
    setExpected("");
    setNotes("");
    setError(null);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function pickProduct(key: number, productId: string) {
    const product = byId.get(productId);
    updateLine(key, { productId, unitPrice: product && product.precoVenda > 0 ? String(product.precoVenda) : "" });
  }

  async function submit() {
    if (!customerId) return setError("Selecione o cliente.");
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("Adicione ao menos um produto.");
    for (const l of filled) {
      const name = byId.get(l.productId)?.descricao ?? "item";
      if (toNumber(l.quantity) <= 0) return setError(`Informe a quantidade de ${name}.`);
      if (l.unitPrice === "" || toNumber(l.unitPrice) < 0) return setError(`Informe o preço de ${name}.`);
    }
    setBusy(true);
    try {
      const created = await apiSend<{ id: string }>("/api/sales-orders", "POST", {
        customerId,
        items: filled.map((l) => {
          const p = byId.get(l.productId)!;
          return { productId: p.id, description: p.descricao, unit: p.unidade || undefined, quantity: toNumber(l.quantity), unitPrice: toNumber(l.unitPrice), discount: toNumber(l.discount) };
        }),
        discount: toNumber(discount),
        freightCost: toNumber(freight),
        expectedDeliveryAt: expected || undefined,
        notes: notes.trim() || undefined,
      });
      invalidateCache("/api/sales-orders");
      reset();
      onCreated(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o pedido.");
    } finally {
      setBusy(false);
    }
  }

  const noProducts = !loadError && products.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Novo pedido de venda"
      description="O pedido nasce como rascunho. Depois, envie para aprovação e reserve o estoque no detalhe do pedido."
      size="xl"
      footer={
        <>
          <span className="mr-auto text-sm text-muted-foreground tabular-nums">Total estimado: {formatCurrencyBRL(total)}</span>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!!loadError}>
            Criar pedido
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {(error || loadError) && <Alert tone="danger">{error ?? loadError}</Alert>}
        {noProducts && <Alert tone="info">Nenhum produto ativo cadastrado. Cadastre em Cadastros → Produtos.</Alert>}

        <FormField label="Cliente" required>
          <Combobox value={customerId} onValueChange={(v) => { setCustomerId(v); setError(null); }} options={customerOptions} placeholder="Selecione o cliente" searchPlaceholder="Buscar cliente..." emptyText="Nenhum cliente ativo." />
        </FormField>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Itens</span>
          {lines.map((l) => {
            const product = byId.get(l.productId);
            return (
              <div key={l.key} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border-subtle p-2 sm:grid-cols-[minmax(0,1fr)_90px_120px_110px_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <FormField label="Produto">
                    <Combobox value={l.productId} onValueChange={(v) => pickProduct(l.key, v)} options={productOptions} placeholder="Selecione o produto" searchPlaceholder="Buscar por código ou nome..." emptyText="Nenhum produto encontrado." />
                  </FormField>
                </div>
                <FormField label={product?.unidade ? `Qtd. (${product.unidade})` : "Qtd."}>
                  <Input type="number" inputMode="decimal" min={0} step="any" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
                </FormField>
                <FormField label="Preço unit. (R$)">
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={l.unitPrice} onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })} />
                </FormField>
                <FormField label="Desconto (R$)">
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={l.discount} onChange={(e) => updateLine(l.key, { discount: e.target.value })} />
                </FormField>
                <Button variant="ghost" size="sm" aria-label="Remover item" disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              </div>
            );
          })}
          <div>
            <Button variant="secondary" size="sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <Plus size={14} aria-hidden /> Adicionar item
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField label="Desconto do pedido (R$)">
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </FormField>
          <FormField label="Frete (R$)">
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={freight} onChange={(e) => setFreight(e.target.value)} />
          </FormField>
          <FormField label="Entrega prevista">
            <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Observações">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}
