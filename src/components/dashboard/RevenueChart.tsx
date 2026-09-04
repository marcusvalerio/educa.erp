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
          <h3 className="font-display text-base font-semibold text-ink">Vendas x Compras</h3>
          <p className="text-xs text-ink-subtle">Últimos 6 meses (dados simulados)</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-brand" /> Vendas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-info" /> Compras
          </span>
        </div>
      </div>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={receitaMensal} margin={{ left: -16, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="vendasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3457ea" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3457ea" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="comprasGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e8f0" vertical={false} />
            <XAxis
              dataKey="mes"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#8891a3", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={formatK}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#8891a3", fontSize: 12 }}
              width={56}
            />
            <Tooltip
              formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e4e8f0",
                fontSize: 13,
                boxShadow: "0 4px 16px rgba(18,23,43,0.08)",
              }}
            />
            <Area
              type="monotone"
              dataKey="vendas"
              stroke="#3457ea"
              strokeWidth={2}
              fill="url(#vendasGradient)"
            />
            <Area
              type="monotone"
              dataKey="compras"
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="4 3"
              fill="url(#comprasGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
