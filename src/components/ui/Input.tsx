import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Campo base: 32px de altura (densidade de ERP), radius 4px, foco com
// anel de 2px no token ring. `invalid` pinta a borda de perigo e expõe
// aria-invalid para leitores de tela.

export const fieldBase =
  "w-full rounded-sm border border-border-strong bg-surface text-sm text-foreground placeholder:text-subtle-foreground " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-subtle-foreground/60 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted-foreground " +
  "read-only:bg-surface-muted aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, "h-8 px-2.5", props.type === "number" && "tabular-nums", className)}
      {...props}
    />
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 3, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(fieldBase, "min-h-16 resize-y px-2.5 py-1.5 leading-5", className)}
      {...props}
    />
  );
});
