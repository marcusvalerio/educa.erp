"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card } from "@/components/ui/Card";
import { pedidosPorStatus } from "@/lib/mock/dashboard";

const COLORS = ["#86858f", "#a8620a", "#0796d7", "#1c8a4b", "#c0392b"];

export function OrdersBarChart() {
  return (
    <Card className="p-5">
      <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Pedidos por status</h3>
      <p className="text-[12px] text-ink-subtle">Comercial — mês atual (dados simulados)</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={pedidosPorStatus} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3e0d8" vertical={false} />
            <XAxis
              dataKey="status"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#86858f", fontSize: 11 }}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={50}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: "#86858f", fontSize: 12 }} width={32} />
            <Tooltip
              cursor={{ fill: "#efece6" }}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e3e0d8",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                boxShadow: "0 12px 24px -8px rgba(8,8,12,0.12)",
              }}
            />
            <Bar dataKey="total" radius={[5, 5, 0, 0]} maxBarSize={44} animationDuration={500}>
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
