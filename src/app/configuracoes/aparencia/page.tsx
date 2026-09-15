"use client";

import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/components/theme/ThemeProvider";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; description: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", description: "Sempre usar o tema claro, independente do sistema.", icon: Sun },
  { value: "dark", label: "Escuro", description: "Sempre usar o tema escuro, independente do sistema.", icon: Moon },
  { value: "system", label: "Sistema", description: "Seguir automaticamente a preferência do sistema operacional.", icon: Monitor },
];

export default function AparenciaPage() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Configurações", href: "/configuracoes" }, { label: "Aparência" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">Aparência</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">
            Escolha como o EDUCA.ERP deve ser exibido neste navegador. A preferência é salva localmente e aplicada imediatamente, sem precisar recarregar a página.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <p className="text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Tema</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPreference(option.value)}
                aria-pressed={active}
                className={clsx(
                  "relative flex flex-col gap-2 rounded-[9px] border p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20",
                  active ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong hover:bg-surface-hover"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={clsx(
                      "flex h-9 w-9 items-center justify-center rounded-[9px]",
                      active ? "bg-brand text-white" : "bg-surface-hover text-ink-muted"
                    )}
                  >
                    <Icon size={17} strokeWidth={1.75} />
                  </span>
                  {active && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                      <Check size={12} strokeWidth={2.5} />
                    </span>
                  )}
                </div>
                <span className={clsx("text-[13.5px] font-medium", active ? "text-brand-ink" : "text-ink")}>{option.label}</span>
                <span className="text-[12.5px] text-ink-subtle">{option.description}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[12.5px] text-ink-subtle">
          Aplicado agora: <span className="font-medium text-ink">{resolved === "dark" ? "Escuro" : "Claro"}</span>
          {preference === "system" && " (resolvido a partir do sistema operacional)"}
        </p>
      </Card>
    </div>
  );
}
