"use client";

import type { ReactNode } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { receitaMensal } from "@/lib/mock/dashboard";

type HeroStatProps = {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down";
  // Recebe o ícone já renderizado (não a referência do componente): esta
  // é uma "use client" component (usa Recharts) e uma referência de
  // função não pode atravessar o limite server→client — o elemento já
  // renderizado, sim.
  icon: ReactNode;
  caption: string;
};

export function HeroStat({ label, value, change, trend, icon, caption }: HeroStatProps) {
  return (
    <Card className="flex h-full flex-col justify-between border-brand/15 bg-gradient-to-br from-brand-soft/70 via-surface to-surface p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium tracking-wide text-ink-muted uppercase">{label}</p>
          <p className="font-display mt-2 text-[2.5rem] leading-none font-semibold tracking-tight text-ink">
            {value}
          </p>
          <div
            className={
              "mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium " +
              (trend === "up" ? "text-success" : "text-danger")
            }
          >
            {trend === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {change}
            <span className="font-normal text-ink-subtle">{caption}</span>
          </div>
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand text-white shadow-raised">
          {icon}
        </span>
      </div>

      <div className="mt-5 -mb-1 h-14">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={receitaMensal} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="heroSparkline" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0796d7" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0796d7" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="vendas"
              stroke="#0796d7"
              strokeWidth={2}
              fill="url(#heroSparkline)"
              isAnimationActive
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
