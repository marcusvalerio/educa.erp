"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/Card";
import { estoquePorCategoria } from "@/lib/mock/dashboard";

const COLORS = ["#03355e", "#0796d7", "#8dc8ef", "#024c7b", "#86858f", "#cfccc2"];

export function StockDonut() {
  const total = estoquePorCategoria.reduce((sum, d) => sum + d.valor, 0);

  return (
    <Card className="p-5">
      <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Estoque por categoria</h3>
      <p className="text-[12px] text-ink-subtle">Distribuição percentual (dados simulados)</p>
      <div className="mt-2 flex items-center gap-4">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={estoquePorCategoria}
                dataKey="valor"
                nameKey="categoria"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
                strokeWidth={0}
                animationDuration={500}
              >
                {estoquePorCategoria.map((entry, i) => (
                  <Cell key={entry.categoria} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `${((Number(value) / total) * 100).toFixed(0)}%`}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e3e0d8",
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  boxShadow: "0 12px 24px -8px rgba(8,8,12,0.12)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex flex-1 flex-col gap-2 text-[12.5px]">
          {estoquePorCategoria.map((entry, i) => (
            <li key={entry.categoria} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {entry.categoria}
              </span>
              <span className="font-medium text-ink tabular-nums">{((entry.valor / total) * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
