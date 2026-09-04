"use client";

import type { FormSection } from "@/lib/cadastros/form-types";
import type { FieldErrors } from "@/lib/cadastros/validation";
import { resolveOptionsSource } from "@/lib/cadastros/options-source";
import { Field } from "@/components/ui/Field";

export type EntityFormMode = "create" | "edit" | "view";

type EntityFormProps = {
  sections: FormSection[];
  values: Record<string, unknown>;
  errors: FieldErrors;
  mode: EntityFormMode;
  onChange: (key: string, value: string | number | boolean) => void;
};

export function EntityForm({ sections, values, errors, mode, onChange }: EntityFormProps) {
  const readOnly = mode === "view";

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <fieldset key={section.title} className="flex flex-col gap-3">
          <legend className="mb-1 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
            {section.title}
          </legend>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            {section.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key] as string | number | boolean | undefined}
                error={errors[field.key]}
                readOnly={readOnly || (mode === "edit" && field.disabledOnEdit)}
                options={field.optionsSource ? resolveOptionsSource(field.optionsSource) : undefined}
                onChange={onChange}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
