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
  featured?: boolean;
};

const ACCENT_CLASSES: Record<StatCardProps["accent"], string> = {
  brand: "bg-brand-soft text-brand-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-danger-soft text-danger",
};

export function StatCard({ label, value, change, trend, icon: Icon, accent, featured = false }: StatCardProps) {
  return (
    <Card
      className={clsx(
        "p-5 transition-shadow duration-200 hover:shadow-raised",
        featured && "border-brand/15 bg-gradient-to-br from-brand-soft/60 to-surface"
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11.5px] font-medium tracking-wide text-ink-muted uppercase">{label}</p>
          <p
            className={clsx(
              "font-display mt-2 font-semibold tracking-tight text-ink",
              featured ? "text-[2rem]" : "text-2xl"
            )}
          >
            {value}
          </p>
        </div>
        <span
          className={clsx(
            "flex items-center justify-center rounded-[9px]",
            featured ? "h-10 w-10" : "h-9 w-9",
            ACCENT_CLASSES[accent]
          )}
        >
          <Icon size={featured ? 19 : 17} strokeWidth={1.75} />
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
