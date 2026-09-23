import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

// Padrão único de campo de formulário: rótulo, obrigatório, ajuda e erro
// PRÓXIMO ao campo. O controle filho recebe id/aria-describedby/
// aria-invalid automaticamente — nenhum formulário precisa repetir isso.

type FormFieldProps = {
  label: string;
  required?: boolean;
  help?: ReactNode;
  error?: string | null;
  className?: string;
  /** Distribui rótulo e controle lado a lado em telas largas. */
  inline?: boolean;
  children: ReactElement<Record<string, unknown>>;
  labelAction?: ReactNode;
};

export function FormField({ label, required, help, error, className, inline, children, labelAction }: FormFieldProps) {
  const autoId = useId();
  const controlId = (isValidElement(children) && (children.props.id as string | undefined)) || autoId;
  const helpId = help ? `${controlId}-help` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
        "aria-required": required || undefined,
        invalid: error ? true : children.props.invalid,
      })
    : children;

  return (
    <div className={cn(inline ? "grid gap-1.5 sm:grid-cols-[180px_1fr] sm:items-start sm:gap-4" : "flex flex-col gap-1.5", className)}>
      <div className={cn("flex items-center justify-between gap-2", inline && "sm:pt-1.5")}>
        <label htmlFor={controlId} className="text-xs font-medium text-foreground">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-fg" aria-hidden>
              *
            </span>
          )}
        </label>
        {labelAction}
      </div>
      <div className="flex flex-col gap-1">
        {control}
        {error ? (
          <p id={errorId} role="alert" className="flex items-start gap-1 text-xs text-danger-fg">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
            {error}
          </p>
        ) : help ? (
          <p id={helpId} className="text-xs text-subtle-foreground">
            {help}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-4 border-t border-border pt-4 first:border-t-0 first:pt-0", className)}>
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-subtle-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}
