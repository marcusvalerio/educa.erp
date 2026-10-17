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
import { lookupPath, pickName } from "@/lib/useIdNameLookup";

// Formulário de criação montado por configuração (campos simples, listas de
// outros cadastros e itens com produto/quantidade). Só monta o corpo e faz o
// POST: validação de negócio, permissão e numeração continuam no servidor e
// no banco. Usado pelas telas que antes só listavam.

type Row = Record<string, unknown>;

export type LookupSource = {
  path: string;
  /** Campo de nome preferido (cai nos equivalentes conhecidos). */
  nameField?: string;
  /** Rótulo da opção; padrão: nome. */
  label?: (row: Row) => string;
  /** Filtra as opções (ex.: só ativos). */
  filter?: (row: Row) => boolean;
};

export type FieldDef =
  | { key: string; label: string; type: "text" | "textarea"; required?: boolean; help?: string; placeholder?: string; maxLength?: number; default?: string }
  | { key: string; label: string; type: "number" | "money"; required?: boolean; help?: string; min?: number; default?: string }
  | { key: string; label: string; type: "date"; required?: boolean; help?: string; default?: string }
  | { key: string; label: string; type: "select"; required?: boolean; help?: string; options: { value: string; label: string }[]; default?: string }
  | { key: string; label: string; type: "lookup"; required?: boolean; help?: string; source: LookupSource; default?: string }
  | {
      key: string;
      label: string;
      type: "items";
      required?: boolean;
      help?: string;
      source: LookupSource;
      /** Rótulo do campo de cada linha (padrão: Produto). */
      itemLabel?: string;
      /** Colunas numéricas por item além do produto (ex.: quantidade, preço). */
      columns: { key: string; label: string; default?: string; money?: boolean; fill?: (row: Row) => string }[];
    };

export type ItemValue = { id: number; ref: string; [key: string]: string | number };
export type FormValues = Record<string, string | ItemValue[]>;

export const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
export const opt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? undefined : s;
};

let nextId = 1;

function useOptions(source: LookupSource | null, open: boolean) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (!open || !source) return;
    let cancelled = false;
    // Cadastro novo precisa aparecer já: lê sem o cache curto.
    invalidateCache(source.path);
    cachedGet<Row[]>(lookupPath(source.path))
      .then((data) => !cancelled && setRows((Array.isArray(data) ? data : []).filter(source.filter ?? (() => true))))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [open, source]);
  return rows;
}

function optionLabel(source: LookupSource, row: Row) {
  return source.label ? source.label(row) : (pickName(row, source.nameField ?? "name") ?? String(row.id));
}

function LookupField({ field, value, onChange, open }: { field: Extract<FieldDef, { type: "lookup" }>; value: string; onChange: (v: string) => void; open: boolean }) {
  const rows = useOptions(field.source, open);
  const options = useMemo(() => rows.map((r) => ({ value: String(r.id), label: optionLabel(field.source, r) })), [rows, field.source]);
  return <Combobox value={value} onValueChange={onChange} options={options} placeholder="Selecione" searchPlaceholder="Buscar..." emptyText="Nada encontrado." />;
}

function ItemsField({ field, value, onChange, open }: { field: Extract<FieldDef, { type: "items" }>; value: ItemValue[]; onChange: (v: ItemValue[]) => void; open: boolean }) {
  const rows = useOptions(field.source, open);
  const byId = useMemo(() => new Map(rows.map((r) => [String(r.id), r])), [rows]);
  const options = useMemo(() => rows.map((r) => ({ value: String(r.id), label: optionLabel(field.source, r) })), [rows, field.source]);
  const blank = (): ItemValue => ({ id: nextId++, ref: "", ...Object.fromEntries(field.columns.map((c) => [c.key, c.default ?? ""])) });
  const lines = value.length ? value : [blank()];
  const set = (id: number, patch: Partial<ItemValue>) => onChange(lines.map((l) => (l.id === id ? ({ ...l, ...patch } as ItemValue) : l)));
  const pick = (id: number, ref: string) => {
    const row = byId.get(ref);
    const fills = Object.fromEntries(field.columns.filter((c) => c.fill && row).map((c) => [c.key, c.fill!(row!)]));
    set(id, { ref, ...fills });
  };
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l) => (
        <div key={l.id} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border-subtle p-2 sm:flex sm:flex-wrap">
          <div className="col-span-2 sm:min-w-[14rem] sm:flex-1">
            <FormField label={field.itemLabel ?? "Produto"}>
              <Combobox value={l.ref} onValueChange={(v) => pick(l.id, v)} options={options} placeholder="Selecione" searchPlaceholder="Buscar por código ou nome..." emptyText="Nada encontrado." />
            </FormField>
          </div>
          {field.columns.map((c) => (
            <div key={c.key} className="sm:w-28">
              <FormField label={c.label}>
                <Input type="number" inputMode="decimal" min={0} step={c.money ? "0.01" : "any"} value={String(l[c.key] ?? "")} onChange={(e) => set(l.id, { [c.key]: e.target.value })} />
              </FormField>
            </div>
          ))}
          <Button variant="ghost" size="sm" aria-label="Remover item" disabled={lines.length === 1} onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" onClick={() => onChange([...lines, blank()])}>
          <Plus size={14} aria-hidden /> Adicionar item
        </Button>
      </div>
    </div>
  );
}

function initialValues(fields: FieldDef[]): FormValues {
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "items" ? [] : (f.default ?? "")]));
}

export type FormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: FieldDef[];
  /** Rota do POST. */
  path: string;
  /** Corpo do POST a partir dos valores (itens: só os que têm produto). */
  toBody: (values: FormValues) => unknown;
  /** Validação simples antes de enviar (mensagem ou null). */
  validate?: (values: FormValues) => string | null;
  onCreated: (created: Row, values: FormValues) => void | Promise<void>;
  /** Coleções a invalidar depois de criar. */
  invalidate?: string[];
  size?: "sm" | "md" | "lg" | "xl";
};

export function FormDialog({ open, onOpenChange, title, description, submitLabel = "Salvar", fields, path, toBody, validate, onCreated, invalidate = [], size = "lg" }: FormDialogProps) {
  const [values, setValues] = useState<FormValues>(() => initialValues(fields));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: string, v: string | ItemValue[]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setError(null);
  };

  async function submit() {
    for (const f of fields) {
      const v = values[f.key];
      const empty = f.type === "items" ? !(v as ItemValue[]).some((i) => i.ref) : String(v ?? "").trim() === "";
      if (f.required && empty) return setError(f.type === "items" ? `Adicione ao menos um item em ${f.label}.` : `Preencha: ${f.label}.`);
    }
    const message = validate?.(values);
    if (message) return setError(message);
    setBusy(true);
    try {
      const created = await apiSend<Row>(path, "POST", toBody(values));
      for (const p of [path, ...invalidate]) invalidateCache(p);
      const submitted = values;
      setValues(initialValues(fields));
      await onCreated(created ?? {}, submitted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
      title={title}
      description={description}
      size={size}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        {fields.map((f) => {
          const wide = f.type === "items" || f.type === "textarea";
          const v = values[f.key];
          return (
            <div key={f.key} className={wide ? "sm:col-span-2" : undefined}>
              <FormField label={f.label} required={f.required} help={f.help}>
                {f.type === "items" ? (
                  <ItemsField field={f} value={v as ItemValue[]} onChange={(x) => set(f.key, x)} open={open} />
                ) : f.type === "lookup" ? (
                  <LookupField field={f} value={v as string} onChange={(x) => set(f.key, x)} open={open} />
                ) : f.type === "select" ? (
                  <Select value={v as string} onValueChange={(x) => set(f.key, x)} options={f.options} placeholder="Selecione" />
                ) : f.type === "textarea" ? (
                  <Input value={v as string} onChange={(e) => set(f.key, e.target.value)} maxLength={f.maxLength ?? 1000} placeholder={f.placeholder} />
                ) : (
                  <Input
                    type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
                    inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined}
                    step={f.type === "money" ? "0.01" : f.type === "number" ? "any" : undefined}
                    min={f.type === "number" || f.type === "money" ? (f.min ?? 0) : undefined}
                    value={v as string}
                    maxLength={f.type === "text" ? (f.maxLength ?? 200) : undefined}
                    placeholder={f.type === "text" ? f.placeholder : undefined}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </FormField>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

/** Itens preenchidos (com produto). */
export function filledItems(values: FormValues, key: string): ItemValue[] {
  return ((values[key] as ItemValue[]) ?? []).filter((i) => i.ref);
}
