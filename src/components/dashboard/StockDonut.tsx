"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/Card";
import { estoquePorCategoria } from "@/lib/mock/dashboard";

const COLORS = ["#3457ea", "#2563eb", "#16a34a", "#d97706", "#8891a3", "#dc2626"];

export function StockDonut() {
  const total = estoquePorCategoria.reduce((sum, d) => sum + d.valor, 0);

  return (
    <Card className="p-5">
      <h3 className="font-display text-base font-semibold text-ink">Estoque por categoria</h3>
      <p className="text-xs text-ink-subtle">Distribuição percentual (dados simulados)</p>
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
              >
                {estoquePorCategoria.map((entry, i) => (
                  <Cell key={entry.categoria} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => `${((Number(value) / total) * 100).toFixed(0)}%`}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e4e8f0",
                  fontSize: 13,
                  boxShadow: "0 4px 16px rgba(18,23,43,0.08)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="flex flex-1 flex-col gap-2 text-xs">
          {estoquePorCategoria.map((entry, i) => (
            <li key={entry.categoria} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-muted">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {entry.categoria}
              </span>
              <span className="font-medium text-ink">{((entry.valor / total) * 100).toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
