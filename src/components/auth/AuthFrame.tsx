import type { ReactNode } from "react";
import { EducaMark } from "@/components/shell/Brand";
import { ThemeToggle } from "@/components/shell/ShellControls";
import { cn } from "@/lib/cn";

// Moldura das telas de identidade (login, convite, primeiro acesso,
// recuperação de senha, acesso pendente): marca, tema, um painel central
// e — só no login — o painel institucional à direita. Mesmo Design
// System do app; nenhuma navegação operacional.

export type AuthTone = "default" | "success" | "warning" | "danger";

const TONE_ICON: Record<AuthTone, string> = {
  default: "border-border bg-surface-muted text-muted-foreground",
  success: "border-success/30 bg-success-soft text-success-fg",
  warning: "border-warning/40 bg-warning-soft text-warning-fg",
  danger: "border-danger/30 bg-danger-soft text-danger-fg",
};

export function AuthFrame({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={cn("grid min-h-dvh", aside && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]")}>
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-foreground">
            <EducaMark />
            <span className="text-sm font-semibold tracking-tight">
              EDUCA<span className="text-subtle-foreground">.ERP</span>
            </span>
          </span>
          <ThemeToggle />
        </div>
        <main id="conteudo" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <p className="text-2xs text-subtle-foreground">© EDUCA.ERP</p>
      </div>
      {aside}
    </div>
  );
}

/** Cabeçalho de uma etapa: ícone opcional, título, descrição. */
export function AuthHeading({ icon, tone = "default", title, description }: { icon?: ReactNode; tone?: AuthTone; title: string; description?: ReactNode }) {
  return (
    <div>
      {icon && <span className={cn("mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md border", TONE_ICON[tone])}>{icon}</span>}
      <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}
