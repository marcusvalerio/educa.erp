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

// Identidade no topo da navegação: a empresa (contexto de trabalho) em
// primeiro plano e a marca EDUCA.ERP como assinatura discreta.
export function EducaWordmark({ className, context }: { className?: string; context?: string }) {
  if (context) {
    return (
      <span className={cn("flex min-w-0 flex-col leading-none", className)}>
        <span className="truncate text-sm font-semibold tracking-title">{context}</span>
        <span className="mt-1 text-2xs font-medium tracking-label uppercase opacity-60">
          EDUCA<span className="opacity-70">.ERP</span>
        </span>
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className="text-sm font-semibold tracking-title">
        EDUCA<span className="text-subtle-foreground">.ERP</span>
      </span>
    </span>
  );
}
