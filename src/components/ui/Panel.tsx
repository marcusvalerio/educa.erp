import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Superfície padrão (antigo Card): classe .surface — borda de 1px, raio de
// superfície, shadow-sm (docs/design/SUPERFICIES.md). Dentro de outra
// superfície (Surface), perde a própria caixa e vira seção: a composição
// fica uma peça só, sem "card dentro de card". Cabeçalho com título,
// descrição curta e ações à direita; divisória interna em border-subtle.

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("surface", className)} {...props} />;
}

/** Superfície composta: agrupa seções (Panels, faixas, listas) numa peça só. */
export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("surface overflow-hidden", className)} {...props} />;
}

/**
 * Divide uma Surface em seções com linhas de 1px. As colunas vêm por
 * className (ex.: "lg:grid-cols-[3fr_2fr]"); em telas estreitas empilha.
 */
export function SurfaceSplit({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface-split", className)} {...props} />;
}

type PanelHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function PanelHeader({ title, description, actions, icon, className }: PanelHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {icon && <span className="mt-0.5 text-subtle-foreground">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-title text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function PanelFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5", className)} {...props} />;
}
