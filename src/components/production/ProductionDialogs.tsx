"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { Button } from "@/components/ui/Button";
import { FormDialog, filledItems, num, opt, type FieldDef, type FormValues } from "@/components/forms/FormDialog";
import { SOURCES } from "@/components/forms/sources";
import { apiSend } from "@/lib/api-client";
import { cachedGet, invalidateCache } from "@/lib/dashboard/client";
import { lookupPath } from "@/lib/useIdNameLookup";

// Estrutura de produto (BOM) e ordem de produção. O banco exige que cada
// produto tenha a unidade do catálogo (units) e que o produto da ordem seja
// "Fabricado"; aqui a unidade vem do cadastro (ou do código, ex.: "UN").

type Row = Record<string, unknown>;

/** Unidade do catálogo de um produto: vínculo do cadastro ou o código da unidade. */
function useUnitResolver(open: boolean) {
  const [units, setUnits] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    invalidateCache("/api/products");
    Promise.all([cachedGet<Row[]>(lookupPath("/api/units")), cachedGet<Row[]>(lookupPath("/api/products"))])
      .then(([u, p]) => {
        if (cancelled) return;
        setUnits(u ?? []);
        setProducts(p ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);
  return useMemo(() => {
    const byCode = new Map(units.map((u) => [String(u.codigo ?? "").toUpperCase(), String(u.id)]));
    const byId = new Map(products.map((p) => [String(p.id), p]));
    const unitOf = (productId: string) => {
      const p = byId.get(productId);
      if (!p) return "";
      return String(p.unidadeId || "") || byCode.get(String(p.unidade ?? "").toUpperCase()) || "";
    };
    const nameOf = (productId: string) => String(byId.get(productId)?.descricao ?? "produto");
    return { unitOf, nameOf, product: (id: string) => byId.get(id) };
  }, [units, products]);
}

const BOM_FIELDS: FieldDef[] = [
  { key: "productId", label: "Produto acabado", type: "lookup", source: SOURCES.products, required: true, help: "O que é fabricado com estes componentes." },
  { key: "referenceQuantity", label: "Quantidade de referência", type: "number", default: "1", help: "Os componentes abaixo fazem esta quantidade do produto." },
  {
    key: "items",
    label: "Componentes",
    type: "items",
    required: true,
    source: SOURCES.products,
    columns: [
      { key: "quantity", label: "Quantidade", default: "1" },
      { key: "scrap", label: "Perda %", default: "0" },
    ],
  },
  { key: "notes", label: "Observações", type: "textarea" },
];

export function NewBomDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { can } = useSession();
  const units = useUnitResolver(open);
  const canActivate = can("production_boms.approve");

  // O FormDialog cria só o cabeçalho; os componentes vêm em seguida, um a um
  // (rota própria), e a estrutura é ativada se quem cria pode aprovar.
  async function afterCreate(created: Row, values: FormValues) {
    const bomId = String(created.id ?? "");
    const items = filledItems(values, "items");
    let seq = 10;
    try {
      for (const i of items) {
        await apiSend(`/api/product-boms/${bomId}/items`, "POST", {
          componentProductId: i.ref,
          quantity: num(i.quantity),
          unitId: units.unitOf(String(i.ref)),
          scrapPercentage: num(i.scrap),
          sequence: seq,
        });
        seq += 10;
      }
      if (canActivate) await apiSend(`/api/product-boms/${bomId}/activate`, "POST", {});
      toast.success(canActivate ? "Estrutura criada e vigente." : "Estrutura criada em rascunho. Peça a quem aprova para ativar.");
    } catch (e) {
      toast.error("Estrutura criada, mas um componente não foi incluído.", e instanceof Error ? e.message : undefined);
    }
    invalidateCache("/api/product-boms");
    onCreated();
  }

  return (
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Nova estrutura de produto (BOM)"
        description="A receita do produto: quais componentes e quanto de cada um."
        submitLabel="Criar estrutura"
        fields={BOM_FIELDS}
        path="/api/product-boms"
        validate={(v) => {
          const product = String(v.productId);
          if (!units.unitOf(product)) return `Defina a unidade de medida de "${units.nameOf(product)}" no cadastro do produto.`;
          for (const i of filledItems(v, "items")) {
            if (String(i.ref) === product) return "O produto não pode ser componente da própria estrutura.";
            if (num(i.quantity) <= 0) return `Informe a quantidade de "${units.nameOf(String(i.ref))}".`;
            if (!units.unitOf(String(i.ref))) return `Defina a unidade de medida de "${units.nameOf(String(i.ref))}" no cadastro do produto.`;
          }
          return null;
        }}
        toBody={(v) => ({ productId: v.productId, referenceQuantity: num(v.referenceQuantity) || 1, unitId: units.unitOf(String(v.productId)), notes: opt(v.notes) })}
        onCreated={afterCreate}
      />
  );
}

const OP_FIELDS = (manufactured: (r: Row) => boolean): FieldDef[] => [
  { key: "productId", label: "Produto a fabricar", type: "lookup", source: { ...SOURCES.products, filter: (r: Row) => r.status === "Ativo" && manufactured(r) }, required: true, help: "Só produtos com origem Fabricado e estrutura vigente." },
  { key: "plannedQuantity", label: "Quantidade", type: "number", required: true, default: "1" },
  { key: "consumptionLocationId", label: "Local dos materiais", type: "lookup", source: SOURCES.locations, required: true, help: "De onde saem os componentes." },
  { key: "outputLocationId", label: "Local do produto pronto", type: "lookup", source: SOURCES.locations, required: true },
  { key: "plannedDate", label: "Data planejada", type: "date" },
  {
    key: "priority",
    label: "Prioridade",
    type: "select",
    default: "medium",
    options: [
      { value: "low", label: "Baixa" },
      { value: "medium", label: "Média" },
      { value: "high", label: "Alta" },
      { value: "urgent", label: "Urgente" },
    ],
  },
  { key: "notes", label: "Observações", type: "textarea" },
];

export function NewProductionOrderDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const units = useUnitResolver(open);
  const [locations, setLocations] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    cachedGet<Row[]>(lookupPath(SOURCES.locations.path))
      .then((rows) => !cancelled && setLocations(new Map((rows ?? []).map((r) => [String(r.id), String(r.depositoId ?? "")]))))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);
  const fields = useMemo(() => OP_FIELDS((r) => r.origem === "Fabricado" || r.origem === "Comprado e fabricado"), []);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova ordem de produção"
      description="Os materiais são calculados pela estrutura vigente do produto. A ordem nasce em rascunho."
      submitLabel="Criar ordem"
      fields={fields}
      path="/api/production-orders"
      validate={(v) => {
        if (num(v.plannedQuantity) <= 0) return "Informe a quantidade a fabricar.";
        if (!units.unitOf(String(v.productId))) return `Defina a unidade de medida de "${units.nameOf(String(v.productId))}" no cadastro do produto.`;
        if (!locations.get(String(v.consumptionLocationId)) || !locations.get(String(v.outputLocationId))) return "Local sem depósito vinculado. Revise o cadastro do local.";
        return null;
      }}
      toBody={(v) => ({
        productId: v.productId,
        plannedQuantity: num(v.plannedQuantity),
        unitId: units.unitOf(String(v.productId)),
        sourceWarehouseId: locations.get(String(v.consumptionLocationId)),
        consumptionLocationId: v.consumptionLocationId,
        targetWarehouseId: locations.get(String(v.outputLocationId)),
        outputLocationId: v.outputLocationId,
        priority: v.priority || "medium",
        plannedDate: opt(v.plannedDate),
        notes: opt(v.notes),
      })}
      onCreated={() => {
        toast.success("Ordem de produção criada.");
        onCreated();
      }}
    />
  );
}

/** Apontar produção (quantidade boa e refugo) numa ordem em andamento. */
export function OutputDialog({ orderId, onClose, onDone }: { orderId: string; onClose: () => void; onDone: () => void }) {
  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Apontar produção"
      description="Registra o que foi produzido (entra no estoque) e o que foi rejeitado."
      submitLabel="Apontar"
      fields={[
        { key: "producedQuantity", label: "Quantidade boa", type: "number", required: true },
        { key: "rejectedQuantity", label: "Rejeitada", type: "number", default: "0" },
        { key: "lotNumber", label: "Lote", type: "text" },
      ]}
      path={`/api/production-orders/${orderId}/output`}
      toBody={(v) => ({ producedQuantity: num(v.producedQuantity), rejectedQuantity: num(v.rejectedQuantity), lotNumber: opt(v.lotNumber) })}
      invalidate={["/api/production-orders", "/api/stock-balances"]}
      onCreated={() => {
        toast.success("Produção apontada.");
        onDone();
      }}
      size="sm"
    />
  );
}


/** Materiais da ordem com consumo (baixa do estoque) do que falta. */
export function OrderMaterials({ orderId, status, onChanged }: { orderId: string; status: string; onChanged: () => void }) {
  const { can } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const names = useUnitResolver(true);

  useEffect(() => {
    let cancelled = false;
    cachedGet<Row[]>(`/api/production-order-materials?productionOrderId=${orderId}&r=${reload}`)
      .then((r) => !cancelled && setRows(r ?? []))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [orderId, reload]);

  const pending = (rows ?? []).map((m) => ({ m, left: Math.max(0, num(m.planned_quantity) - num(m.consumed_quantity)) })).filter((x) => x.left > 0);
  const canConsume = status === "in_progress" && can("production_materials.consume") && pending.length > 0;

  async function consumeAll() {
    setBusy(true);
    try {
      for (const { m, left } of pending) await apiSend(`/api/production-order-materials/${String(m.id)}/consume`, "POST", { quantity: left });
      toast.success("Materiais consumidos.");
      invalidateCache("/api/stock-balances");
      setReload((n) => n + 1);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível consumir os materiais.");
      setReload((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (!rows) return <p className="px-4 py-3 text-sm text-muted-foreground">Carregando materiais...</p>;
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Materiais</h3>
        {canConsume && (
          <Button size="sm" variant="secondary" loading={busy} onClick={consumeAll}>
            Consumir materiais
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem materiais.</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-sm">
          {rows.map((m) => (
            <li key={String(m.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{names.nameOf(String(m.component_product_id))}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                planejado {num(m.planned_quantity)} · reservado {num(m.reserved_quantity)} · consumido {num(m.consumed_quantity)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
