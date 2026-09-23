import { cn } from "@/lib/cn";

// Marca EDUCA: monograma "E" em três barras — a do meio em Merin's Fire.
// Usa currentColor para a estrutura (funciona sobre claro e escuro).

export function EducaMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <rect x="1" y="1" width="22" height="22" rx="5" className="fill-current" />
      <rect x="7" y="6.5" width="11" height="2.5" rx="1" className="fill-[var(--mark-bar,var(--color-background))]" />
      <rect x="7" y="10.75" width="8" height="2.5" rx="1" className="fill-accent" />
      <rect x="7" y="15" width="11" height="2.5" rx="1" className="fill-[var(--mark-bar,var(--color-background))]" />
    </svg>
  );
}

export function EducaWordmark({ className, context }: { className?: string; context?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className="text-sm font-semibold tracking-tight">
        EDUCA<span className="text-subtle-foreground">.ERP</span>
      </span>
      {context && <span className="mt-1 truncate text-2xs font-medium tracking-wide uppercase opacity-70">{context}</span>}
    </span>
  );
}
