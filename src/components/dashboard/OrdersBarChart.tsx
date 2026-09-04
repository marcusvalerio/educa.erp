"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { pedidosPorStatus } from "@/lib/mock/dashboard";

const COLORS = ["#8891a3", "#d97706", "#3457ea", "#16a34a", "#dc2626"];

export function OrdersBarChart() {
  return (
    <Card className="p-5">
      <h3 className="font-display text-base font-semibold text-ink">Pedidos por status</h3>
      <p className="text-xs text-ink-subtle">Comercial — mês atual (dados simulados)</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pedidosPorStatus} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e8f0" vertical={false} />
            <XAxis
              dataKey="status"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#8891a3", fontSize: 11 }}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={50}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#8891a3", fontSize: 12 }} width={32} />
            <Tooltip
              cursor={{ fill: "#f4f6f9" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e4e8f0",
                fontSize: 13,
                boxShadow: "0 4px 16px rgba(18,23,43,0.08)",
              }}
            />
            <Bar dataKey="total" radius={[6, 6, 0, 0]} maxBarSize={44}>
              {pedidosPorStatus.map((entry, i) => (
                <Cell key={entry.status} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
