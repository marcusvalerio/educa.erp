"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Select } from "@/components/ui/Controls";
import { Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Feedback";
import { apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";
import type { Produto } from "@/lib/cadastros/types";

// Nova solicitação de compra (necessidade interna, sem fornecedor nem preço).
// A regra — permissão purchase_requests.create, código, auditoria — é do
// banco (fn_create_purchase_request), via POST /api/purchase-requests.

type Line = { key: number; productId: string; quantity: string };
const toNumber = (value: string) => Number(String(value).replace(",", ".")) || 0;
let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, productId: "", quantity: "1" });

const PRIORITIES = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function NewPurchaseRequestDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [products, setProducts] = useState<Produto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("medium");
  const [neededBy, setNeededBy] = useState("");
  const [justification, setJustification] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invalidateCache("/api/products");
    cachedGet<Produto[]>(lookupPath("/api/products"))
      .then((p) => {
        if (cancelled) return;
        setProducts(p.filter((x) => x.status === "Ativo"));
        setLoadError(null);
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : "Não foi possível carregar os produtos."));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const options = useMemo(() => products.map((p) => ({ value: p.id, label: `${p.codigo} — ${p.descricao}` })), [products]);

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setError(null);
  }

  async function submit() {
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setError("Adicione ao menos um produto.");
    for (const l of filled) if (toNumber(l.quantity) <= 0) return setError(`Informe a quantidade de ${byId.get(l.productId)?.descricao ?? "item"}.`);
    setBusy(true);
    try {
      await apiSend("/api/purchase-requests", "POST", {
        department: department.trim() || undefined,
        priority,
        neededBy: neededBy || undefined,
        justification: justification.trim() || undefined,
        items: filled.map((l) => {
          const p = byId.get(l.productId)!;
          return { productId: p.id, description: p.descricao, unit: p.unidade || undefined, quantity: toNumber(l.quantity) };
        }),
      });
      invalidateCache("/api/purchase-requests");
      setLines([emptyLine()]);
      setDepartment("");
      setPriority("medium");
      setNeededBy("");
      setJustification("");
      setError(null);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a solicitação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title="Nova solicitação de compra"
      description="Registre o que precisa ser comprado. Depois de aprovada, a solicitação vira pedido de compra para um fornecedor."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy} disabled={!!loadError}>
            Criar solicitação
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {(error || loadError) && <Alert tone="danger">{error ?? loadError}</Alert>}
        {!loadError && products.length === 0 && <Alert tone="info">Nenhum produto ativo cadastrado. Cadastre em Cadastros → Produtos.</Alert>}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Itens</span>
          {lines.map((l) => {
            const product = byId.get(l.productId);
            return (
              <div key={l.key} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-end gap-2 rounded-lg border border-border-subtle p-2">
                <FormField label="Produto">
                  <Combobox value={l.productId} onValueChange={(v) => updateLine(l.key, { productId: v })} options={options} placeholder="Selecione o produto" searchPlaceholder="Buscar por código ou nome..." emptyText="Nenhum produto encontrado." />
                </FormField>
                <FormField label={product?.unidade ? `Qtd. (${product.unidade})` : "Qtd."}>
                  <Input type="number" inputMode="decimal" min={0} step="any" value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} />
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
          <FormField label="Setor">
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={80} placeholder="Ex.: Produção" />
          </FormField>
          <FormField label="Prioridade">
            <Select value={priority} onValueChange={(v) => setPriority(v || "medium")} options={PRIORITIES} />
          </FormField>
          <FormField label="Necessária até">
            <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Justificativa">
          <Input value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={500} placeholder="Para que serve a compra" />
        </FormField>
      </div>
    </Dialog>
  );
}
