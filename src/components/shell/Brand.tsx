import { cn } from "@/lib/cn";
import { BRAND_MARK, PRODUCT_WORDMARK } from "@/lib/brand";

// Símbolo do produto — "Núcleo": quatro módulos em torno de um centro em
// Merin's Fire (geometria em BRAND_MARK; a mesma de src/app/icon.svg e da
// landing). Os módulos usam currentColor, então funciona sobre claro e escuro.

export function BrandMark({ className, size = 22 }: { className?: string; size?: number }) {
  const { modules, core, radius } = BRAND_MARK;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      {modules.map(([x, y, w, h]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={radius} className="fill-current" />
      ))}
      <rect x={core[0]} y={core[1]} width={core[2]} height={core[3]} rx={radius} className="fill-accent" />
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
