import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Tons semânticos. "neutral" é o padrão — cor só quando carrega sentido.
export type Tone = "neutral" | "success" | "warning" | "danger" | "critical" | "info" | "accent";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  success: "bg-success-soft text-success-fg border-success/25",
  warning: "bg-warning-soft text-warning-fg border-warning/35",
  danger: "bg-danger-soft text-danger-fg border-danger/25",
  critical: "bg-critical-soft text-critical-fg border-critical/25",
  info: "bg-info-soft text-info-fg border-info/25",
  accent: "bg-accent-soft text-warning-fg border-accent/35",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-subtle-foreground",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  critical: "bg-critical",
  info: "bg-info",
  accent: "bg-accent",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
};

export function Badge({ tone = "neutral", dot = false, icon, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOTS[tone])} />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function toneDotClass(tone: Tone): string {
  return DOTS[tone];
}

export function toneTextClass(tone: Tone): string {
  return {
    neutral: "text-muted-foreground",
    success: "text-success-fg",
    warning: "text-warning-fg",
    danger: "text-danger-fg",
    critical: "text-critical-fg",
    info: "text-info-fg",
    accent: "text-warning-fg",
  }[tone];
}
