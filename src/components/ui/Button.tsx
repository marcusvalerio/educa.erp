import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-brand text-white hover:bg-brand-hover shadow-sm shadow-brand/20",
        variant === "secondary" &&
          "bg-surface text-ink border border-border-strong hover:bg-surface-hover",
        variant === "ghost" && "text-ink-muted hover:text-ink hover:bg-surface-hover",
        className
      )}
      {...props}
    />
  );
}
