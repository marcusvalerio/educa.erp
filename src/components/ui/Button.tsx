import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center gap-2 rounded-[9px] px-4 py-2.5 text-[13.5px] font-medium transition-all duration-150 cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
        variant === "primary" && "bg-brand text-white hover:bg-brand-hover shadow-raised",
        variant === "secondary" &&
          "bg-surface text-ink border border-border-strong hover:border-ink-subtle hover:bg-surface-hover",
        variant === "ghost" && "text-ink-muted hover:text-ink hover:bg-surface-hover",
        className
      )}
      {...props}
    />
  );
}
