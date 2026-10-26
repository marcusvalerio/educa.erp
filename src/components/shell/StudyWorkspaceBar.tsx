"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api-client";
import { useCached } from "@/lib/dashboard/client";

// Professor (Administrador da turma): troca entre o ERP da turma e o de
// cada grupo. A empresa ativa fica no banco (fn_study_enter_workspace, 0109);
// depois da troca a página recarrega para a sessão ler a nova empresa.
// Para quem não é professor a lista vem vazia e a faixa não aparece.

type Workspace = { company_id: string; name: string; group_label: string | null; is_class: boolean; is_current: boolean; class_id?: string; class_name?: string };

function label(w: Workspace) {
  if (w.is_class) return `Turma · ${w.name}`;
  return w.group_label && w.group_label !== w.name ? `${w.group_label} — ${w.name}` : w.name;
}

export function StudyWorkspaceBar() {
  const list = useCached<Workspace[]>("/api/study/workspaces");
  const [busy, setBusy] = useState(false);
  const items = list.data ?? [];
  if (items.length < 2) return null;
  const current = items.find((w) => w.is_current) ?? items[0];
  const classes = [...new Set(items.map((w) => w.class_id ?? ""))];
  const groupsOf = (classId: string) => items.filter((w) => (w.class_id ?? "") === classId);

  async function go(companyId: string) {
    if (companyId === current.company_id) return;
    setBusy(true);
    try {
      await apiSend("/api/study/workspaces", "POST", { companyId });
      window.location.replace(`${window.location.origin}/app`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível trocar de ERP.");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle bg-surface px-4 py-1.5 text-xs sm:px-6 lg:rounded-t-xl lg:px-8">
      <GraduationCap size={14} className="shrink-0 text-accent-fg" aria-hidden />
      <label htmlFor="study-workspace" className="font-semibold text-foreground">
        {current.is_class ? "Você está na turma" : "Você está no ERP do grupo"}
      </label>
      <select
        id="study-workspace"
        className="h-7 min-w-0 max-w-full flex-1 rounded-md border border-border-subtle bg-background px-2 text-xs text-foreground sm:max-w-sm sm:flex-none"
        value={current.company_id}
        disabled={busy}
        onChange={(e) => go(e.target.value)}
      >
        {classes.length > 1
          ? classes.map((c) => (
              <optgroup key={c} label={`Turma ${groupsOf(c)[0]?.class_name ?? ""}`}>
                {groupsOf(c).map((w) => (
                  <option key={w.company_id} value={w.company_id}>
                    {label(w)}
                  </option>
                ))}
              </optgroup>
            ))
          : items.map((w) => (
              <option key={w.company_id} value={w.company_id}>
                {label(w)}
              </option>
            ))}
      </select>
      {!current.is_class && (
        <button
          type="button"
          disabled={busy}
          onClick={() => go(items.find((w) => w.is_class && (w.class_id ?? "") === (current.class_id ?? ""))?.company_id ?? current.company_id)}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Voltar para a turma
        </button>
      )}
    </div>
  );
}
