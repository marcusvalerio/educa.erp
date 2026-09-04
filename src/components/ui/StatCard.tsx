import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "./Card";

type StatCardProps = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: LucideIcon;
  accent: "brand" | "success" | "warning" | "info" | "danger";
};

const ACCENT_CLASSES: Record<StatCardProps["accent"], string> = {
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
};

export function StatCard({ label, value, change, trend, icon: Icon, accent }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
          <p className="font-display mt-2 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className={clsx("flex h-9 w-9 items-center justify-center rounded-lg", ACCENT_CLASSES[accent])}>
          <Icon size={18} />
        </span>
      </div>
      <div
        className={clsx(
          "mt-3 flex items-center gap-1 text-xs font-medium",
          trend === "up" ? "text-success" : "text-danger"
        )}
      >
        {trend === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {change}
        <span className="font-normal text-ink-subtle">vs. mês anterior</span>
      </div>
    </Card>
  );
}
