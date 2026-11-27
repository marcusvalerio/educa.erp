"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { FormField } from "@/components/ui/FormField";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { apiSend } from "@/lib/api-client";
import { invalidateCache } from "@/lib/dashboard/client";

// Botões de fluxo no detalhe de um registro (aprovar, liberar, encerrar...).
// Aparecem conforme o status e a permissão; a transição é decidida no
// servidor/banco, que recusa qualquer passo inválido.

export type WorkflowAction = {
  id: string;
  label: string;
  /** Caminho relativo ao registro: `${base}/${id}/${path}`. */
  path: string;
  method?: "POST" | "PATCH";
  permission: string | string[];
  /** Status (minúsculos) em que a ação aparece; ausente = sempre. */
  statuses?: string[];
  confirm: string;
  success: string;
  tone?: "danger";
  icon?: ReactNode;
  body?: unknown;
  /** Pede um motivo (mín. 5 caracteres), enviado como `reason` no corpo. */
  requireReason?: boolean;
};

export function WorkflowActions({ base, id, status, actions, onDone, extra }: { base: string; id: string; status: string; actions: WorkflowAction[]; onDone: () => void; extra?: ReactNode }) {
  const { can } = useSession();
  const [pending, setPending] = useState<WorkflowAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const st = status.toLowerCase();
  const allowed = (p: string | string[]) => (Array.isArray(p) ? p.some((x) => can(x)) : can(p));
  const list = actions.filter((a) => (!a.statuses || a.statuses.includes(st)) && allowed(a.permission));

  const reasonMissing = !!pending?.requireReason && reason.trim().length < 5;

  async function run() {
    if (!pending) return;
    if (pending.requireReason && reason.trim().length < 5) {
      toast.error("Informe o motivo (mínimo 5 caracteres).");
      return;
    }
    setBusy(true);
    try {
      const body = pending.requireReason ? { ...((pending.body as object | undefined) ?? {}), reason: reason.trim() } : pending.body ?? {};
      await apiSend(`${base}/${id}/${pending.path}`, pending.method ?? "POST", body);
      setReason("");
      invalidateCache(base);
      toast.success(pending.success);
      setPending(null);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  if (list.length === 0 && !extra) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {extra}
      {list.map((a, i) => (
        <Button key={a.id} size="sm" variant={a.tone === "danger" ? "ghost" : i === 0 && !extra ? "primary" : "secondary"} className={a.tone === "danger" ? "text-danger-fg" : undefined} onClick={() => setPending(a)}>
          {a.icon}
          {a.label}
        </Button>
      ))}
      {pending && (
        <ConfirmDialog
          open
          title={`${pending.label}?`}
          description={pending.confirm}
          confirmLabel={pending.label}
          cancelLabel="Voltar"
          tone={pending.tone === "danger" ? "danger" : "default"}
          loading={busy}
          confirmDisabled={reasonMissing}
          onConfirm={run}
          onCancel={() => { setPending(null); setReason(""); }}
        >
          {pending.requireReason && (
            <FormField label="Motivo" required help={reasonMissing ? "Informe o motivo (mínimo 5 caracteres)" : undefined}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Mínimo 5 caracteres" />
            </FormField>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
