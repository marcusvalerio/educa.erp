import { History } from "lucide-react";
import type { AuditEntry } from "@/lib/cadastros/types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditTrail({ entries, loading = false }: { entries: AuditEntry[]; loading?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
        <History size={13} />
        Histórico de alterações
      </h4>
      {loading ? (
        <p className="text-sm text-ink-subtle">Carregando histórico...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-ink-subtle">Nenhuma movimentação registrada ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-ink-muted">
                <span className="font-medium text-ink">{entry.acao}</span> por {entry.usuario}
              </span>
              <span className="shrink-0 text-xs text-ink-subtle tabular-nums">
                {formatDateTime(entry.data)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
