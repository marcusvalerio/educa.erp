import { cn } from "@/lib/cn";
import { BRAND_MARK, PRODUCT_WORDMARK } from "@/lib/brand";

// Símbolo do produto — "Núcleo": quatro módulos brancos em torno de um centro
// em Merin's Fire, sobre placa escura. É o mesmo desenho de src/app/icon.svg
// (aba do navegador) e da landing, igual em tema claro e escuro.

export function BrandMark({ className, size = 22 }: { className?: string; size?: number }) {
  const { modules, core, radius } = BRAND_MARK;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className={cn("shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="#100c08" />
      <g transform="translate(16 16) scale(.64) translate(-16 -16)">
        {modules.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx={radius} fill="#f3f4f5" />
        ))}
        <rect x={core[0]} y={core[1]} width={core[2]} height={core[3]} rx={radius} fill="#ff9408" />
      </g>
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
