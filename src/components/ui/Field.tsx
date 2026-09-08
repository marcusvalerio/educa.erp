import clsx from "clsx";
import type { FormField } from "@/lib/cadastros/form-types";
import type { SelectOption } from "@/lib/cadastros/options-source";

const SPAN_CLASSES: Record<number, string> = {
  1: "sm:col-span-1",
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
};

type FieldProps = {
  field: FormField;
  value: string | number | boolean | undefined;
  error?: string;
  readOnly?: boolean;
  options?: SelectOption[];
  onChange: (key: string, value: string | number | boolean) => void;
};

const inputClasses =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-subtle transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/12 disabled:bg-surface-hover disabled:text-ink-muted";

export function Field({ field, value, error, readOnly, options, onChange }: FieldProps) {
  const span = SPAN_CLASSES[field.span ?? 1];

  if (field.type === "checkbox") {
    return (
      <div className={clsx("flex items-end pb-0.5", span)}>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={readOnly}
            onChange={(e) => onChange(field.key, e.target.checked)}
            className="h-4 w-4 rounded border-border-strong text-brand focus:ring-2 focus:ring-brand/25"
          />
          {field.label}
        </label>
      </div>
    );
  }

  const inputId = `field-${field.key}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={clsx("flex flex-col gap-1.5", span)}>
      <label htmlFor={inputId} className="text-xs font-medium text-ink-muted">
        {field.label}
        {field.required && <span className="ml-0.5 text-danger">*</span>}
      </label>

      {field.type === "select" ? (
        <select
          id={inputId}
          value={(value as string) ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange(field.key, e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={clsx(inputClasses, error && "border-danger focus:border-danger focus:ring-danger/15")}
        >
          <option value="">Selecione...</option>
          {(options ?? field.options?.map((o) => ({ value: o, label: o })) ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={inputId}
          value={(value as string) ?? ""}
          disabled={readOnly}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.key, e.target.value)}
          rows={3}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={clsx(inputClasses, "resize-none", error && "border-danger focus:border-danger focus:ring-danger/15")}
        />
      ) : (
        <input
          id={inputId}
          type={field.type}
          value={(value as string | number) ?? ""}
          disabled={readOnly}
          placeholder={field.placeholder}
          step={field.step}
          min={field.min}
          onChange={(e) =>
            onChange(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
          }
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={clsx(inputClasses, error && "border-danger focus:border-danger focus:ring-danger/15")}
        />
      )}

      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
      {!error && field.helpText && <p className="text-xs text-ink-subtle">{field.helpText}</p>}
    </div>
  );
}
