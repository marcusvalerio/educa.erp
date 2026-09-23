import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Botão do EDUCA. Primário = Smoky Black (claro) / Chef's Hat (escuro) —
// nunca laranja. "danger" só para ações destrutivas confirmadas.

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "xs" | "sm" | "md" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "border border-border-strong bg-surface text-foreground hover:bg-surface-hover",
  ghost: "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
  danger: "bg-danger text-danger-contrast hover:opacity-90",
  link: "h-auto px-0 text-foreground underline-offset-4 hover:underline",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 gap-1.5 px-2 text-xs",
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-9 gap-2 px-3.5 text-sm",
  icon: "h-9 w-9 justify-center",
  "icon-sm": "h-7 w-7 justify-center",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center rounded-md font-medium whitespace-nowrap select-none",
    "transition-[background-color,color,border-color,opacity] duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:shrink-0",
    VARIANTS[variant],
    variant !== "link" && SIZES[size],
    className
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, asChild = false, className, children, disabled, type, ...props },
  ref
) {
  if (asChild) {
    return (
      <Slot.Root ref={ref} className={buttonClasses(variant, size, className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
