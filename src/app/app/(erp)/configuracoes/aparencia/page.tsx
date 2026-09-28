"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { useTheme } from "@/components/theme/ThemeProvider";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; description: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", description: "Superfícies claras, ideal para ambientes iluminados.", icon: Sun },
  { value: "dark", label: "Escuro", description: "Base Smoky Black, menos brilho em turnos longos.", icon: Moon },
  { value: "system", label: "Sistema", description: "Segue a preferência do sistema operacional.", icon: Monitor },
];

// Prévia mínima do tema usando os próprios tokens (data-theme força o esquema).
function ThemePreview({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-theme={theme} aria-hidden className="overflow-hidden rounded-sm border border-border bg-background">
      <div className="flex h-16">
        <div className="w-8 bg-sidebar" />
        <div className="flex flex-1 flex-col gap-1.5 p-2">
          <div className="h-1.5 w-12 rounded-full bg-foreground/70" />
          <div className="flex gap-1">
            <div className="h-5 flex-1 rounded-xs border border-border bg-surface" />
            <div className="h-5 flex-1 rounded-xs border border-border bg-surface" />
          </div>
          <div className="h-1.5 w-8 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

export default function AparenciaPage() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader title="Aparência" description="Como o EDUCA.ERP é exibido neste navegador. A escolha é salva localmente e aplicada na hora." />
      <Panel>
        <PanelHeader title="Tema" description={`Aplicado agora: ${resolved === "dark" ? "escuro" : "claro"}${preference === "system" ? " (pelo sistema operacional)" : ""}.`} />
        <div role="radiogroup" aria-label="Tema" className="grid gap-3 p-4 sm:grid-cols-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreference(option.value)}
                className={cn(
                  "flex flex-col gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "border-foreground bg-surface-muted" : "border-border hover:border-border-strong hover:bg-surface-hover"
                )}
              >
                {option.value === "system" ? (
                  <div className="grid grid-cols-2 gap-1">
                    <ThemePreview theme="light" />
                    <ThemePreview theme="dark" />
                  </div>
                ) : (
                  <ThemePreview theme={option.value} />
                )}
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon size={15} aria-hidden />
                    {option.label}
                  </span>
                  {active && <Check size={15} aria-hidden />}
                </span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
