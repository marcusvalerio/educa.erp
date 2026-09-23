import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toneDotClass, type Tone } from "./Badge";

export type TimelineEntry = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  at: string;
  actor?: string | null;
  tone?: Tone;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Linha do tempo vertical (histórico, auditoria, eventos de entrega).
export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn("relative flex flex-col", className)}>
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < entries.length - 1 && <span aria-hidden className="absolute top-3 bottom-0 left-[5px] w-px bg-border" />}
          <span aria-hidden className={cn("relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-surface", toneDotClass(entry.tone ?? "neutral"))} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground">{entry.title}</div>
            {entry.description && <div className="mt-0.5 text-xs text-muted-foreground">{entry.description}</div>}
            <div className="mt-0.5 text-2xs text-subtle-foreground tabular-nums">
              <time dateTime={entry.at}>{formatWhen(entry.at)}</time>
              {entry.actor && <> · {entry.actor}</>}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
