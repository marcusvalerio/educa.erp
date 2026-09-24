"use client";

import { useState } from "react";
import { Check, MapPin } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useSession } from "./SessionProvider";

// Primeiro acesso com mais de uma unidade: a pessoa escolhe em qual
// trabalhar (ou todas). A lista é exatamente a que o banco devolveu como
// acessível (fn_user_context → user_branch_access / unidade principal);
// esta escolha só FILTRA a visão — não amplia acesso a nada. Com uma
// única unidade, a seleção é automática e este diálogo não aparece.
export function BranchPrompt() {
  const { data, branchPending, setBranchId } = useSession();
  const branches = data?.tenant?.branches ?? [];
  const primary = data?.tenant?.branch?.id ?? null;
  const [choice, setChoice] = useState<string | null>(primary && branches.some((b) => b.id === primary) ? primary : null);
  const [dismissed, setDismissed] = useState(false);

  if (!branchPending || dismissed) return null;

  const options: Array<{ id: string | null; code: string; name: string }> = [...branches, { id: null, code: "", name: "Todas as unidades" }];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setBranchId(choice);
          setDismissed(true);
        }
      }}
      title="Em qual unidade você vai trabalhar?"
      description="Você tem acesso a mais de uma unidade. A escolha filtra painéis e listas e pode ser trocada a qualquer momento no topo da tela."
      footer={
        <Button
          onClick={() => {
            setBranchId(choice);
            setDismissed(true);
          }}
        >
          Continuar
        </Button>
      }
    >
      <div role="radiogroup" aria-label="Unidade em foco" className="flex flex-col gap-1.5">
        {options.map((option) => {
          const selected = option.id === choice;
          return (
            <button
              key={option.id ?? "all"}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setChoice(option.id)}
              className={cn(
                "flex h-11 items-center gap-3 rounded-md border px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                selected ? "border-foreground bg-surface-muted" : "border-border hover:bg-surface-hover"
              )}
            >
              <MapPin size={15} className="shrink-0 text-subtle-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {option.name}
                {option.id === primary && <span className="ml-2 text-xs text-subtle-foreground">principal</span>}
              </span>
              {option.code && <span className="code shrink-0 text-2xs text-subtle-foreground">{option.code}</span>}
              {selected && <Check size={15} className="shrink-0" aria-hidden />}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
