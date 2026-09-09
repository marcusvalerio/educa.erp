import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon = Inbox,
  title = "Nenhum registro encontrado",
  description = "Ajuste os filtros para encontrar o que você procura.",
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface py-16 text-center animate-fade-in">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-hover">
        <Icon size={20} strokeWidth={1.5} className="text-ink-subtle" />
      </span>
      <div>
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-xs text-[13px] text-ink-subtle">{description}</p>
      </div>
      {action}
    </div>
  );
}
