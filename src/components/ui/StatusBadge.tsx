import { AlertTriangle, Check, CircleDashed, Clock, Pause, X } from "lucide-react";
import { Badge } from "./Badge";
import { statusMeta, type StatusEntity, type StatusIcon } from "@/lib/status";

const ICONS: Record<Exclude<StatusIcon, "dot">, typeof Check> = {
  check: Check,
  clock: Clock,
  alert: AlertTriangle,
  x: X,
  pause: Pause,
  progress: CircleDashed,
};

// Badge de status a partir do registro tipado (src/lib/status.ts). O
// ícone reforça o tom para quem não distingue cores.
export function StatusBadge({ entity, status, className }: { entity?: StatusEntity; status: string | null | undefined; className?: string }) {
  const meta = statusMeta(entity, status);
  const Icon = meta.icon && meta.icon !== "dot" ? ICONS[meta.icon] : null;
  return (
    <Badge
      tone={meta.tone}
      dot={meta.icon === "dot" || !meta.icon}
      icon={Icon ? <Icon size={11} strokeWidth={2.25} aria-hidden /> : undefined}
      className={className}
      title={status ?? undefined}
    >
      {meta.label}
    </Badge>
  );
}
