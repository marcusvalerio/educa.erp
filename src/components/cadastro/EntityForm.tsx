"use client";

import type { FormField as FormFieldDef, FormSection as FormSectionDef } from "@/lib/cadastros/form-types";
import type { FieldErrors } from "@/lib/cadastros/validation";
import { resolveOptionsSource, type SelectOption } from "@/lib/cadastros/options-source";
import { cn } from "@/lib/cn";
import { FormField, FormSection } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { Checkbox, Select } from "@/components/ui/Controls";
import { Combobox } from "@/components/ui/Combobox";
import { DatePicker } from "@/components/ui/DatePicker";

export type EntityFormMode = "create" | "edit" | "view";

const SPAN: Record<number, string> = { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4" };

type EntityFormProps = {
  sections: FormSectionDef[];
  values: Record<string, unknown>;
  errors: FieldErrors;
  mode: EntityFormMode;
  onChange: (key: string, value: string | number | boolean) => void;
};

function FieldControl({
  field,
  value,
  readOnly,
  options,
  onChange,
}: {
  field: FormFieldDef;
  value: unknown;
  readOnly: boolean;
  options?: SelectOption[];
  onChange: (key: string, value: string | number | boolean) => void;
}) {
  if (field.type === "select") {
    const opts = options ?? field.options?.map((o) => ({ value: o, label: o })) ?? [];
    // Listas longas (clientes, transportadoras...) ganham busca.
    return opts.length > 8 ? (
      <Combobox value={(value as string) ?? ""} onValueChange={(v) => onChange(field.key, v)} options={opts} disabled={readOnly} />
    ) : (
      <Select value={(value as string) ?? ""} onValueChange={(v) => onChange(field.key, v)} options={opts} disabled={readOnly} />
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea value={(value as string) ?? ""} placeholder={field.placeholder} readOnly={readOnly} onChange={(e) => onChange(field.key, e.target.value)} />
    );
  }
  if (field.type === "date") {
    return <DatePicker value={(value as string) ?? ""} onChange={(v) => onChange(field.key, v)} disabled={readOnly} />;
  }
  return (
    <Input
      type={field.type}
      value={(value as string | number) ?? ""}
      placeholder={field.placeholder}
      step={field.step}
      min={field.min}
      readOnly={readOnly}
      onChange={(e) => onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

// Formulário de cadastro a partir da definição declarativa (forms.ts):
// seções, grade de 4 colunas (1 no mobile) e erro junto ao campo.
export function EntityForm({ sections, values, errors, mode, onChange }: EntityFormProps) {
  const readOnlyAll = mode === "view";
  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <FormSection key={section.title} title={section.title}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-4">
            {section.fields.map((field) => {
              const readOnly = readOnlyAll || (mode === "edit" && !!field.disabledOnEdit);
              const options = field.optionsSource ? resolveOptionsSource(field.optionsSource) : undefined;
              if (field.type === "checkbox") {
                return (
                  <label key={field.key} className={cn("flex items-center gap-2 self-end pb-1.5 text-sm", SPAN[field.span ?? 1])}>
                    <Checkbox checked={Boolean(values[field.key])} disabled={readOnly} onCheckedChange={(c) => onChange(field.key, c === true)} />
                    {field.label}
                  </label>
                );
              }
              return (
                <FormField
                  key={field.key}
                  label={field.label}
                  required={field.required && !readOnlyAll}
                  help={readOnlyAll ? undefined : field.helpText}
                  error={errors[field.key]}
                  className={SPAN[field.span ?? 1]}
                >
                  <FieldControl field={field} value={values[field.key]} readOnly={readOnly} options={options} onChange={onChange} />
                </FormField>
              );
            })}
          </div>
        </FormSection>
      ))}
    </div>
  );
}
