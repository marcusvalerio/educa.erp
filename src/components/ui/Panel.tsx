import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

// Superfície padrão (antigo Card): borda, radius 6px, sem sombra. Cabeçalho
// denso com título, descrição curta e ações à direita.

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("min-w-0 rounded-md border border-border bg-surface", className)} {...props} />;
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
    <header className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", className)}>
      <div className="flex min-w-0 items-start gap-2">
        {icon && <span className="mt-0.5 text-subtle-foreground">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-subtle-foreground">{description}</p>}
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
  return <div className={cn("flex items-center justify-between gap-2 border-t border-border px-4 py-2.5", className)} {...props} />;
}
