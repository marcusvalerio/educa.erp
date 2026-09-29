import { cn } from "@/lib/cn";
import { PRODUCT_WORDMARK } from "@/lib/brand";

// Símbolo do produto: três barras sobre um quadrado arredondado — a do meio
// em Merin's Fire. Desenho mantido da identidade anterior até haver um
// símbolo definido para o ATLAS.ERP (o mesmo SVG está em src/app/icon.svg,
// scripts/build-landing.mjs e scripts/build-manuals.mjs).
// Usa currentColor para a estrutura (funciona sobre claro e escuro).

export function BrandMark({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <rect x="1" y="1" width="22" height="22" rx="5" className="fill-current" />
      <rect x="7" y="6.5" width="11" height="2.5" rx="1" className="fill-[var(--mark-bar,var(--color-background))]" />
      <rect x="7" y="10.75" width="8" height="2.5" rx="1" className="fill-accent" />
      <rect x="7" y="15" width="11" height="2.5" rx="1" className="fill-[var(--mark-bar,var(--color-background))]" />
    </svg>
  );
}

/** "ATLAS" + ".ERP" com o sufixo em tom menor. */
export function ProductName({ dimClassName = "text-subtle-foreground" }: { dimClassName?: string }) {
  return (
    <>
      {PRODUCT_WORDMARK.name}
      <span className={dimClassName}>{PRODUCT_WORDMARK.suffix}</span>
    </>
  );
}

// Identidade no topo da navegação: a empresa (contexto de trabalho) em
// primeiro plano e a marca ATLAS.ERP como assinatura discreta.
export function BrandWordmark({ className, context }: { className?: string; context?: string }) {
  if (context) {
    return (
      <span className={cn("flex min-w-0 flex-col leading-none", className)}>
        <span className="truncate text-sm font-semibold tracking-title">{context}</span>
        <span className="mt-1 text-2xs font-medium tracking-label uppercase opacity-60">
          <ProductName dimClassName="opacity-70" />
        </span>
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0 flex-col leading-none", className)}>
      <span className="text-sm font-semibold tracking-title">
        <ProductName />
      </span>
    </span>
  );
}
