import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox, Lock, RotateCcw, SearchX, XCircle } from "lucide-react";
import { Progress as P } from "radix-ui";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

// Estados de feedback consistentes em todo o sistema: Alert (mensagem em
// linha), EmptyState (vazio / sem resultados / sem acesso / erro),
// Skeleton (carregando) e Progress.

type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_TONES: Record<AlertTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-info/30 bg-info-soft text-info-fg", icon: Info },
  success: { box: "border-success/30 bg-success-soft text-success-fg", icon: CheckCircle2 },
  warning: { box: "border-warning/40 bg-warning-soft text-warning-fg", icon: AlertTriangle },
  danger: { box: "border-danger/30 bg-danger-soft text-danger-fg", icon: XCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = ALERT_TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm", box, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "text-foreground/80")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type EmptyKind = "empty" | "no-results" | "no-permission" | "error";

const EMPTY_ICONS: Record<EmptyKind, typeof Inbox> = {
  empty: Inbox,
  "no-results": SearchX,
  "no-permission": Lock,
  error: XCircle,
};

export function EmptyState({
  kind = "empty",
  title,
  description,
  action,
  onRetry,
  compact = false,
  className,
}: {
  kind?: EmptyKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const Icon = EMPTY_ICONS[kind];
  return (
    <div
      role={kind === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md border",
          kind === "error" ? "border-danger/30 bg-danger-soft text-danger-fg" : "border-border bg-surface-muted text-subtle-foreground"
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden />
      </span>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {(action || onRetry) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCcw size={14} />
              Tentar novamente
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-skeleton rounded-sm bg-muted", className)} />;
}

export function SkeletonRows({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="divide-y divide-border">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-10 items-center gap-4 px-3">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn("h-3", c === 0 ? "w-28" : c === columns - 1 ? "w-16" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Progress({ value, max = 100, tone = "neutral", className, label }: { value: number; max?: number; tone?: "neutral" | "warning" | "danger" | "success"; className?: string; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bar = { neutral: "bg-foreground", warning: "bg-warning", danger: "bg-danger", success: "bg-success" }[tone];
  return (
    <P.Root value={value} max={max} aria-label={label} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <P.Indicator className={cn("h-full transition-[width] duration-300", bar)} style={{ width: `${pct}%` }} />
    </P.Root>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-surface-muted px-1 font-mono text-2xs text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}
