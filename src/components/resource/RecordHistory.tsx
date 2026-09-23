"use client";

import { useEffect, useState } from "react";
import { Timeline } from "@/components/ui/Timeline";
import { Skeleton } from "@/components/ui/Feedback";
import { useSession } from "@/components/shell/SessionProvider";
import { apiGet } from "@/lib/api-client";
import { statusMeta } from "@/lib/status";

type AuditEntry = { id: string; data: string; usuario: string | null; entidade: string; registro: string | null; acao?: string };

// Histórico real do registro (audit_logs via /api/audit-logs). Sem
// permissão audit_logs.read, a seção explica o motivo em vez de sumir.
export function RecordHistory({ entityId }: { entityId: string }) {
  const { can } = useSession();
  const allowed = can("audit_logs.read");
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    apiGet<AuditEntry[]>(`/api/audit-logs?entityId=${encodeURIComponent(entityId)}`)
      .then((data) => !cancelled && setEntries(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [allowed, entityId]);

  if (!allowed) return <p className="text-sm text-subtle-foreground">O histórico de alterações exige a permissão de auditoria.</p>;
  if (failed) return <p className="text-sm text-danger-fg">Não foi possível carregar o histórico.</p>;
  if (!entries) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  if (entries.length === 0) return <p className="text-sm text-subtle-foreground">Nenhuma alteração registrada para este registro.</p>;

  return (
    <Timeline
      entries={entries.map((entry) => {
        const meta = entry.acao ? statusMeta("audit_action", entry.acao) : null;
        return {
          id: entry.id,
          title: entry.acao ?? "Alteração",
          at: entry.data,
          actor: entry.usuario,
          tone: meta?.tone ?? "neutral",
        };
      })}
    />
  );
}
