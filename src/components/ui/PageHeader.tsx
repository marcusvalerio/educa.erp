import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";

// Cabeçalho de página. O breadcrumb vive no Topbar (global); aqui ficam
// título, contexto curto, metadados (status/badges) e ações da página.

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function PageHeader({ title, description, eyebrow, meta, actions, backHref, backLabel = "Voltar", className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={13} />
            {backLabel}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-2xs font-medium tracking-wide text-subtle-foreground uppercase">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-subtle-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}
