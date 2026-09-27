import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Campo base: 32px de altura (densidade de ERP), radius de controle (7px),
// foco com borda no token ring e halo suave de 4px. `invalid` pinta a borda de perigo e expõe
// aria-invalid para leitores de tela.

export const fieldBase =
  "w-full rounded-md border border-border-strong bg-surface text-sm text-foreground shadow-xs placeholder:text-subtle-foreground " +
  "transition-[border-color,box-shadow] duration-150 " +
  "hover:border-subtle-foreground/50 focus:border-ring focus:outline-none focus:ring-4 focus:ring-ring/15 " +
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
