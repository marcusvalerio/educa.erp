"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { receitaMensal } from "@/lib/mock/dashboard";

function formatK(v: number) {
  return `R$ ${Math.round(v / 1000)}k`;
}

export function RevenueChart() {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Vendas x Compras</h3>
          <p className="text-[12px] text-ink-subtle">Últimos 6 meses (dados simulados)</p>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand" /> Vendas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand-deep" /> Compras
          </span>
        </div>
      </div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={receitaMensal} margin={{ left: -16, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="vendasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0796d7" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#0796d7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="comprasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#024c7b" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#024c7b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e0d8" vertical={false} />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#86858f", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatK}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#86858f", fontSize: 12 }}
              width={56}
            />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e3e0d8",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                boxShadow: "0 12px 24px -8px rgba(8,8,12,0.12)",
              }}
            />
            <Area
              type="monotone"
              dataKey="vendas"
              stroke="#0796d7"
              strokeWidth={2}
              fill="url(#vendasGradient)"
              animationDuration={600}
            />
            <Area
              type="monotone"
              dataKey="compras"
              stroke="#024c7b"
              strokeWidth={2}
              strokeDasharray="4 3"
              fill="url(#comprasGradient)"
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
