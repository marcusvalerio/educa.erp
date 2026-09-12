"use client";

import { useEffect, useState } from "react";
import { Plus, Star, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { Fornecedor, ProdutoFornecedor, ProdutoPreco, ProdutoEmbalagem } from "@/lib/cadastros/types";
import {
  fetchProductSuppliers,
  createProductSupplier,
  deleteProductSupplier,
  fetchProductPrices,
  createProductPrice,
  fetchProductUnits,
  createProductUnit,
  deleteProductUnit,
  ApiRequestError,
} from "@/lib/produtos/api";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

function SectionShell({
  title,
  loading,
  error,
  onRetry,
  children,
}: {
  title: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">{title}</h3>
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-[13px] text-ink-subtle">
          <Loader2 size={14} className="animate-spin" /> Carregando...
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-soft/50 px-3 py-2.5 text-[12.5px] text-danger">
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} className="shrink-0" /> {error}
          </span>
          <button onClick={onRetry} className="shrink-0 font-medium underline">
            Tentar novamente
          </button>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ---------------------------------------------------------- Fornecedores
export function ProductSuppliersSection({
  productId,
  suppliers,
  canEdit,
}: {
  productId: string;
  suppliers: Fornecedor[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<ProdutoFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    fetchProductSuppliers(productId)
      .then(({ data }) => {
        setItems(data);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Não foi possível carregar os fornecedores.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [productId]);

  const linkedIds = new Set(items.map((i) => i.fornecedorId));
  const availableSuppliers = suppliers.filter((s) => !linkedIds.has(s.id));

  async function handleAdd() {
    if (!newSupplierId) {
      setAddError("Selecione um fornecedor.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createProductSupplier({ produtoId: productId, fornecedorId: newSupplierId, preferencial: items.length === 0 });
      setNewSupplierId("");
      setShowForm(false);
      load();
    } catch (err) {
      setAddError(errorMessage(err, "Não foi possível vincular o fornecedor."));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await deleteProductSupplier(id);
      load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover o vínculo."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <SectionShell title="Fornecedores" loading={loading} error={error} onRetry={load}>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">Nenhum fornecedor vinculado a este produto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const supplier = suppliers.find((s) => s.id === item.fornecedorId);
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-sunken/30 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-ink">
                      {item.preferencial && <Star size={12} className="shrink-0 fill-warning text-warning" />}
                      {supplier?.razaoSocial ?? "Fornecedor removido"}
                    </span>
                    <span className="truncate text-[12px] text-ink-subtle">
                      {item.custo > 0 && `Custo: ${item.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                      {item.custo > 0 && item.prazoEntregaDias > 0 && " · "}
                      {item.prazoEntregaDias > 0 && `Prazo: ${item.prazoEntregaDias}d`}
                      {item.custo === 0 && item.prazoEntregaDias === 0 && "Sem custo/prazo informado"}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => handleRemove(item.id)}
                      disabled={removingId === item.id}
                      aria-label="Remover fornecedor"
                      title="Remover fornecedor"
                      className="shrink-0 rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-40"
                    >
                      {removingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canEdit && !showForm && (
          <Button variant="secondary" onClick={() => setShowForm(true)} disabled={availableSuppliers.length === 0}>
            <Plus size={14} /> Vincular fornecedor
          </Button>
        )}
        {canEdit && showForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <Field
              field={{ key: "supplierId", label: "Fornecedor", type: "select", span: 4 }}
              value={newSupplierId}
              options={availableSuppliers.map((s) => ({ value: s.id, label: s.razaoSocial }))}
              onChange={(_key, value) => setNewSupplierId(String(value))}
            />
            {addError && <p className="text-xs text-danger">{addError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? "Vinculando..." : "Vincular"}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// --------------------------------------------------------------- Preços
const TIPO_PRECO_LABEL: Record<string, string> = { cost: "Custo", sale: "Venda", minimum: "Mínimo" };

export function ProductPricesSection({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [items, setItems] = useState<ProdutoPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [tipoPreco, setTipoPreco] = useState("sale");
  const [valor, setValor] = useState("");

  function load() {
    fetchProductPrices(productId)
      .then(({ data }) => {
        setItems(data);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Não foi possível carregar os preços.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [productId]);

  async function handleAdd() {
    const amount = Number(valor);
    if (!valor || Number.isNaN(amount) || amount < 0) {
      setAddError("Informe um valor válido.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createProductPrice({ produtoId: productId, tipoPreco: tipoPreco as ProdutoPreco["tipoPreco"], valor: amount, moeda: "BRL" });
      setValor("");
      setShowForm(false);
      load();
    } catch (err) {
      setAddError(errorMessage(err, "Não foi possível registrar o preço."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <SectionShell title="Preços" loading={loading} error={error} onRetry={load}>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">Nenhum preço cadastrado para este produto.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-sunken/30 px-3 py-2.5">
                <span className="text-[13px] font-medium text-ink">{TIPO_PRECO_LABEL[item.tipoPreco] ?? item.tipoPreco}</span>
                <span className="text-[13px] tabular-nums text-ink">
                  {item.valor.toLocaleString("pt-BR", { style: "currency", currency: item.moeda || "BRL" })}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canEdit && !showForm && (
          <Button variant="secondary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Registrar preço
          </Button>
        )}
        {canEdit && showForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field
                field={{ key: "tipoPreco", label: "Tipo", type: "select", span: 1 }}
                value={tipoPreco}
                options={[
                  { value: "cost", label: "Custo" },
                  { value: "sale", label: "Venda" },
                  { value: "minimum", label: "Mínimo" },
                ]}
                onChange={(_key, value) => setTipoPreco(String(value))}
              />
              <Field
                field={{ key: "valor", label: "Valor (R$)", type: "number", step: 0.01, span: 1 }}
                value={valor}
                onChange={(_key, value) => setValor(String(value))}
              />
            </div>
            {addError && <p className="text-xs text-danger">{addError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------- Unidades/embalagens
export function ProductUnitsSection({
  productId,
  units,
  canEdit,
}: {
  productId: string;
  units: { code: string; name: string }[];
  canEdit: boolean;
}) {
  const [items, setItems] = useState<ProdutoEmbalagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [unitCode, setUnitCode] = useState("");
  const [factor, setFactor] = useState("1");
  const [removingId, setRemovingId] = useState<string | null>(null);

  function load() {
    fetchProductUnits(productId)
      .then(({ data }) => {
        setItems(data);
        setError(null);
      })
      .catch((err: unknown) => setError(errorMessage(err, "Não foi possível carregar as embalagens.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [productId]);

  const linkedCodes = new Set(items.map((i) => i.unidadeCodigo));
  const availableUnits = units.filter((u) => !linkedCodes.has(u.code));

  async function handleAdd() {
    const conversionFactor = Number(factor);
    if (!unitCode) {
      setAddError("Selecione uma unidade.");
      return;
    }
    if (!factor || Number.isNaN(conversionFactor) || conversionFactor <= 0) {
      setAddError("O fator de conversão deve ser maior que zero.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await createProductUnit({ produtoId: productId, unidadeCodigo: unitCode, fatorConversao: conversionFactor });
      setUnitCode("");
      setFactor("1");
      setShowForm(false);
      load();
    } catch (err) {
      setAddError(errorMessage(err, "Não foi possível cadastrar a embalagem."));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    try {
      await deleteProductUnit(id);
      load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover a embalagem."));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <SectionShell title="Unidades / embalagens" loading={loading} error={error} onRetry={load}>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">Nenhuma embalagem adicional cadastrada — o produto usa só a unidade padrão.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-sunken/30 px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-ink">{item.unidadeCodigo}</span>
                  <span className="text-[12px] text-ink-subtle">
                    1 {item.unidadeCodigo} = {item.fatorConversao} unidade(s) base
                    {item.codigoBarras && ` · ${item.codigoBarras}`}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={removingId === item.id}
                    aria-label="Remover embalagem"
                    title="Remover embalagem"
                    className="shrink-0 rounded-md p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger transition-colors disabled:opacity-40"
                  >
                    {removingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && !showForm && (
          <Button variant="secondary" onClick={() => setShowForm(true)} disabled={availableUnits.length === 0}>
            <Plus size={14} /> Adicionar embalagem
          </Button>
        )}
        {canEdit && showForm && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field
                field={{ key: "unitCode", label: "Unidade", type: "select", span: 1 }}
                value={unitCode}
                options={availableUnits.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))}
                onChange={(_key, value) => setUnitCode(String(value))}
              />
              <Field
                field={{ key: "factor", label: "Fator de conversão", type: "number", step: 0.01, span: 1 }}
                value={factor}
                onChange={(_key, value) => setFactor(String(value))}
              />
            </div>
            {addError && <p className="text-xs text-danger">{addError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? "Salvando..." : "Salvar"}
              </Button>
              <Button variant="secondary" onClick={() => setShowForm(false)} disabled={adding}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}
