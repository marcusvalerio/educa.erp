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

// Badge de status a partir do registro tipado (src/lib/status.ts).
// Hierarquia: estados de rotina (neutro, sucesso, informação, em curso)
// aparecem discretos — ponto + rótulo —; só o que pede atenção (alerta,
// problema, crítico) ganha o chip com fundo e ícone. O rótulo é sempre
// texto explícito, então a cor nunca é o único sinal.
const ATTENTION = new Set(["warning", "danger", "critical"]);

export function StatusBadge({ entity, status, className, emphasis = "auto" }: { entity?: StatusEntity; status: string | null | undefined; className?: string; emphasis?: "auto" | "chip" }) {
  const meta = statusMeta(entity, status);
  const Icon = meta.icon && meta.icon !== "dot" ? ICONS[meta.icon] : null;
  if (emphasis === "auto" && !ATTENTION.has(meta.tone)) {
    return (
      <Badge tone={meta.tone} variant="quiet" className={className} title={status ?? undefined}>
        {meta.label}
      </Badge>
    );
  }
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
