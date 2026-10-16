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
import type { Cliente, Fornecedor, Produto } from "@/lib/cadastros/types";

// Novo pedido (venda ou compra) com itens do cadastro de produtos. A regra
// (cliente/fornecedor da empresa, permissão *.create, totais, código do
// pedido) é do banco — fn_create_sales_order / fn_create_purchase_order;
// aqui só se monta o corpo de POST /api/sales-orders ou /api/purchase-orders.

type Party = { id: string; status: string; label: string };

const KINDS = {
  sale: {
    title: "Novo pedido de venda",
    description: "O pedido nasce como rascunho. Depois, envie para aprovação e reserve o estoque no detalhe do pedido.",
    partyPath: "/api/customers",
    partyLabel: "Cliente",
    partyEmpty: "Nenhum cliente ativo.",
    partyKey: "customerId",
    apiPath: "/api/sales-orders",
    toParty: (c: Cliente): Party => ({ id: c.id, status: c.status, label: c.nome }),
    priceOf: (p: Produto) => p.precoVenda,
  },
  purchase: {
    title: "Novo pedido de compra",
    description: "O pedido nasce como rascunho. Depois, envie para aprovação e, aprovado, envie ao fornecedor.",
    partyPath: "/api/suppliers",
    partyLabel: "Fornecedor",
    partyEmpty: "Nenhum fornecedor ativo.",
    partyKey: "supplierId",
    apiPath: "/api/purchase-orders",
    toParty: (f: Fornecedor): Party => ({ id: f.id, status: f.status, label: f.nomeFantasia ? `${f.razaoSocial} (${f.nomeFantasia})` : f.razaoSocial }),
    priceOf: (p: Produto) => p.precoCusto,
  },
} as const;
export type OrderKind = keyof typeof KINDS;

type Line = { key: number; productId: string; quantity: string; unitPrice: string; discount: string };

const toNumber = (value: string) => Number(String(value).replace(",", ".")) || 0;
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1", unitPrice: "", discount: "" });

/** Pedido a partir de uma solicitação de compra aprovada: itens já preenchidos. */
export type OrderInitial = { purchaseRequestId?: string; items: { productId: string; quantity: number }[] };

export function NewOrderDialog({ kind, open, onOpenChange, onCreated, initial }: { kind: OrderKind; open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void; initial?: OrderInitial | null }) {
  const cfg = KINDS[kind];
  const [customers, setCustomers] = useState<Party[]>([]);
  const [products, setProducts] = useState<Produto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [freight, setFreight] = useState("");
  const [discount, setDiscount] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lê a lista na hora de abrir (sem o cache de 1 min): produto ou cliente
  // recém-cadastrado precisa aparecer aqui imediatamente.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invalidateCache("/api/products");
    invalidateCache(cfg.partyPath);
    Promise.all([cachedGet<(Cliente & Fornecedor)[]>(lookupPath(cfg.partyPath)), cachedGet<Produto[]>(lookupPath("/api/products"))])
      .then(([c, p]) => {
        if (cancelled) return;
        setCustomers(c.map((x) => cfg.toParty(x)).filter((x) => x.status === "Ativo"));
        const active = p.filter((x) => x.status === "Ativo");
        setProducts(active);
        if (initial?.items.length) {
          const prices = new Map(active.map((x) => [x.id, cfg.priceOf(x)]));
          setLines(
            initial.items
              .filter((i) => prices.has(i.productId))
              .map((i) => ({ ...emptyLine(), productId: i.productId, quantity: String(i.quantity), unitPrice: (prices.get(i.productId) ?? 0) > 0 ? String(prices.get(i.productId)) : "" }))
          );
        }
        setLoadError(null);
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : "Não foi possível carregar os cadastros e os produtos."));
    return () => {
      cancelled = true;
    };
  }, [open, cfg, initial]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productOptions = useMemo(() => products.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` })), [products]);
  const customerOptions = useMemo(() => customers.map((c) => ({ value: c.id, label: c.label })), [customers]);

  const itemsTotal = lines.reduce((sum, l) => sum + Math.max(0, toNumber(l.quantity) * toNumber(l.unitPrice) - toNumber(l.discount)), 0);
  const total = Math.max(0, itemsTotal - toNumber(discount) + toNumber(freight));

  function reset() {
    setCustomerId("");
    setLines([emptyLine()]);
    setFreight("");
    setDiscount("");
    setExpected("");
    setNotes("");
    setPaymentTerms("");
    setError(null);
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  function pickProduct(key: number, productId: string) {
    const product = byId.get(productId);
    const price = product ? cfg.priceOf(product) : 0;
    updateLine(key, { productId, unitPrice: price > 0 ? String(price) : "" });
  }

  async function submit() {
    if (!customerId) return setError(`Selecione o ${cfg.partyLabel.toLowerCase()}.`);
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("Adicione ao menos um produto.");
    for (const l of filled) {
      const name = byId.get(l.productId)?.descricao ?? "item";
      if (toNumber(l.quantity) <= 0) return setError(`Informe a quantidade de ${name}.`);
      if (l.unitPrice === "" || toNumber(l.unitPrice) < 0) return setError(`Informe o preço de ${name}.`);
    }
    setBusy(true);
    try {
      const created = await apiSend<{ id: string }>(cfg.apiPath, "POST", {
        [cfg.partyKey]: customerId,
        ...(kind === "purchase" && paymentTerms.trim() ? { paymentTerms: paymentTerms.trim() } : {}),
        ...(kind === "purchase" && initial?.purchaseRequestId ? { purchaseRequestId: initial.purchaseRequestId } : {}),
        items: filled.map((l) => {
          const p = byId.get(l.productId)!;
          return { productId: p.id, description: p.descricao, unit: p.unidade || undefined, quantity: toNumber(l.quantity), unitPrice: toNumber(l.unitPrice), discount: toNumber(l.discount) };
        }),
        discount: toNumber(discount),
        freightCost: toNumber(freight),
        expectedDeliveryAt: expected || undefined,
        notes: notes.trim() || undefined,
      });
      invalidateCache(cfg.apiPath);
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
      title={cfg.title}
      description={cfg.description}
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

        <FormField label={cfg.partyLabel} required>
          <Combobox value={customerId} onValueChange={(v) => { setCustomerId(v); setError(null); }} options={customerOptions} placeholder={`Selecione o ${cfg.partyLabel.toLowerCase()}`} searchPlaceholder={`Buscar ${cfg.partyLabel.toLowerCase()}...`} emptyText={cfg.partyEmpty} />
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
        {kind === "purchase" && (
          <FormField label="Condição de pagamento">
            <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} maxLength={120} placeholder="Ex.: 30/60 dias" />
          </FormField>
        )}
        <FormField label="Observações">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </FormField>
      </div>
    </Dialog>
  );
}
