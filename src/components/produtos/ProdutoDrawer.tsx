"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Pencil } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { FormField } from "@/lib/cadastros/form-types";
import type { Produto, Categoria, Marca, Fornecedor } from "@/lib/cadastros/types";
import { fetchProduct, createProduct, updateProduct, ApiRequestError } from "@/lib/produtos/api";
import { ProductSuppliersSection, ProductPricesSection, ProductUnitsSection } from "./ProdutoRelationSections";

export type ProdutoDrawerMode = "create" | "view" | "edit";

type ProdutoDrawerProps = {
  mode: ProdutoDrawerMode;
  productId?: string;
  categories: Categoria[];
  brands: Marca[];
  units: { code: string; name: string }[];
  suppliers: Fornecedor[];
  canUpdate: boolean;
  onClose: () => void;
  onSaved: (action: "create" | "update") => void;
  onSwitchToEdit: () => void;
};

const DEFAULT_VALUES: Partial<Produto> = {
  codigo: "",
  sku: "",
  descricao: "",
  descricaoCurta: "",
  categoriaId: "",
  marcaId: "",
  unidade: "",
  ncm: "",
  codigoBarras: "",
  peso: 0,
  altura: 0,
  largura: 0,
  comprimento: 0,
  estoqueMinimo: 0,
  estoqueMaximo: 0,
  pontoReposicao: 0,
  localizacaoPadrao: "",
  fornecedorId: "",
  loteControlado: false,
  validadeControlada: false,
  status: "Ativo",
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) return error.message;
  return error instanceof Error && error.message ? error.message : fallback;
}

function validate(values: Partial<Produto>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.codigo?.trim()) errors.codigo = "Informe o código do produto.";
  if (!values.descricao?.trim()) errors.descricao = "Informe o nome do produto.";
  if (!values.unidade?.trim()) errors.unidade = "Selecione a unidade de medida.";
  if (
    values.estoqueMinimo !== undefined &&
    values.estoqueMaximo !== undefined &&
    values.estoqueMaximo > 0 &&
    values.estoqueMaximo < values.estoqueMinimo
  ) {
    errors.estoqueMaximo = "O estoque máximo deve ser maior ou igual ao mínimo.";
  }
  return errors;
}

export function ProdutoDrawer({
  mode,
  productId,
  categories,
  brands,
  units,
  suppliers,
  canUpdate,
  onClose,
  onSaved,
  onSwitchToEdit,
}: ProdutoDrawerProps) {
  const [values, setValues] = useState<Partial<Produto>>(DEFAULT_VALUES);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(Boolean(productId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    // Sem productId (modo create), os valores/estado de loading já
    // partem corretos do useState inicial (DEFAULT_VALUES / false) —
    // nada a fazer aqui além do fetch quando há um produto existente.
    if (!productId) return;
    let cancelled = false;
    fetchProduct(productId)
      .then(({ data }) => {
        if (!cancelled) {
          setValues(data);
          setLoadError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(errorMessage(error, "Não foi possível carregar o produto."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function handleChange(key: string, value: string | number | boolean) {
    setSaveError(null);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (mode === "create") {
        await createProduct(values);
        onSaved("create");
      } else if (productId) {
        await updateProduct(productId, values);
        onSaved("update");
      }
    } catch (error) {
      setSaveError(errorMessage(error, "Não foi possível salvar o produto."));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = mode === "view";
  const title = mode === "create" ? "Novo produto" : loading ? "Carregando..." : (values.descricao as string) || "Produto";
  const subtitle = mode === "view" ? "Visualização de detalhes" : mode === "edit" ? "Editando produto" : "Preencha os dados do novo produto";

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.nome }));
  const brandOptions = brands.map((b) => ({ value: b.id, label: b.nome }));
  const unitOptions = units.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }));
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.razaoSocial }));

  function field(f: FormField, options?: { value: string; label: string }[]) {
    return (
      <Field
        key={f.key}
        field={f}
        value={values[f.key as keyof Produto] as string | number | boolean | undefined}
        error={errors[f.key]}
        readOnly={readOnly || (mode === "edit" && f.disabledOnEdit)}
        options={options}
        onChange={handleChange}
      />
    );
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        mode === "view" ? (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            {canUpdate && (
              <Button onClick={onSwitchToEdit}>
                <Pencil size={15} />
                Editar
              </Button>
            )}
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="flex flex-col gap-4 animate-fade-in">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-10 animate-skeleton rounded-lg bg-surface-hover" />
          ))}
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft/60 px-3.5 py-3 text-[13px] text-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
          <span>{loadError}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {saveError && (
            <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft/60 px-3.5 py-3 text-[13px] text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" strokeWidth={1.75} />
              <span>{saveError}</span>
            </div>
          )}

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Informações gerais</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {field({ key: "codigo", label: "Código", type: "text", required: true, span: 2, disabledOnEdit: true })}
              {field({ key: "sku", label: "SKU", type: "text", span: 2 })}
              {field({ key: "descricao", label: "Nome", type: "text", required: true, span: 4 })}
              {field({ key: "descricaoCurta", label: "Descrição", type: "textarea", span: 4 })}
              {field({ key: "categoriaId", label: "Categoria", type: "select", span: 2 }, categoryOptions)}
              {field({ key: "marcaId", label: "Marca", type: "select", span: 2 }, brandOptions)}
              {field({ key: "unidade", label: "Unidade de medida", type: "select", required: true, span: 1 }, unitOptions)}
              {field({ key: "ncm", label: "NCM", type: "text", span: 1 })}
              {field({ key: "codigoBarras", label: "Código de barras", type: "text", span: 2 })}
              {field({ key: "fornecedorId", label: "Fornecedor preferencial", type: "select", span: 2 }, supplierOptions)}
              {field({ key: "status", label: "Status", type: "select", span: 1 }, [
                { value: "Ativo", label: "Ativo" },
                { value: "Inativo", label: "Inativo" },
              ])}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Dimensões e peso</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {field({ key: "peso", label: "Peso (kg)", type: "number", step: 0.01, span: 1 })}
              {field({ key: "altura", label: "Altura (cm)", type: "number", step: 0.1, span: 1 })}
              {field({ key: "largura", label: "Largura (cm)", type: "number", step: 0.1, span: 1 })}
              {field({ key: "comprimento", label: "Comprimento (cm)", type: "number", step: 0.1, span: 1 })}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">Estoque</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {field({ key: "estoqueMinimo", label: "Estoque mínimo", type: "number", span: 1 })}
              {field({ key: "estoqueMaximo", label: "Estoque máximo", type: "number", span: 1 })}
              {field({ key: "pontoReposicao", label: "Ponto de reposição", type: "number", span: 1 })}
              {field({ key: "localizacaoPadrao", label: "Localização padrão", type: "text", span: 1 })}
              {field({ key: "loteControlado", label: "Lote controlado", type: "checkbox", span: 2 })}
              {field({ key: "validadeControlada", label: "Validade controlada", type: "checkbox", span: 2 })}
            </div>
          </fieldset>

          {productId && (
            <div className="flex flex-col gap-6 border-t border-border pt-5">
              <ProductSuppliersSection productId={productId} suppliers={suppliers} canEdit={canUpdate} />
              <ProductPricesSection productId={productId} canEdit={canUpdate} />
              <ProductUnitsSection productId={productId} units={units} canEdit={canUpdate} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
