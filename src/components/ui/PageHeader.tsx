import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import { AutoEyebrow } from "@/components/shell/Breadcrumbs";

// Cabeçalho de página: onde estou (sobrelinha com o módulo, automática a
// partir da navegação) → o que é esta tela (título) → para que serve
// (descrição curta) → o que posso fazer (ações à direita). A trilha
// completa continua no topo do shell.

export const EYEBROW_CLASS = "text-2xs font-semibold tracking-label text-subtle-foreground uppercase";

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
    <header className={cn("flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft size={13} />
            {backLabel}
          </Link>
        )}
        <div className={cn("mb-1.5 empty:hidden", EYEBROW_CLASS)}>{eyebrow ?? <AutoEyebrow />}</div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-title text-balance text-foreground">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-md font-semibold tracking-title text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}
