"use client";

import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { SalesOrderRow } from "@/lib/database/schema";

// "Recent Deals" adaptado para ERP: pedidos de venda recentes reais
// (/api/sales-orders, já ordenado por created_at desc) — nunca dados
// fictícios. customerNames resolve customer_id -> nome (mesmo padrão
// de useIdNameLookup) sem travar a lista se o lookup ainda não chegou.
export function RecentOrdersTable({
  orders,
  customerNames,
  loading,
  error,
}: {
  orders: SalesOrderRow[];
  customerNames: Map<string, string>;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">Pedidos recentes</h3>
          <p className="text-[12px] text-ink-subtle">Últimos pedidos de venda registrados</p>
        </div>
        <Link href="/comercial/pedidos-venda" className="flex items-center gap-1 text-[12px] font-medium text-brand hover:text-brand-hover">
          Ver todos <ArrowRight size={13} />
        </Link>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 5 }, (_, i) => <span key={i} className="animate-skeleton block h-10 rounded-md bg-border-strong/60" />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Receipt size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[12.5px] text-ink-subtle">{error}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <Receipt size={20} strokeWidth={1.5} className="text-ink-subtle" />
            <p className="text-[13px] font-medium text-ink">Não há registros.</p>
            <p className="max-w-xs text-[12px] text-ink-subtle">Nenhum pedido de venda registrado ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Pedido</th>
                  <th className="pb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Cliente</th>
                  <th className="pb-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Data</th>
                  <th className="pb-2 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Valor</th>
                  <th className="pb-2 text-right text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 6).map((order) => (
                  <tr key={order.id} className="border-b border-border last:border-0">
                    <td className="py-2.5 font-medium text-ink">{order.code}</td>
                    <td className="py-2.5 text-ink-muted">{customerNames.get(order.customer_id) ?? order.customer_id}</td>
                    <td className="py-2.5 text-ink-muted">{formatDate(order.order_date)}</td>
                    <td className="py-2.5 text-right font-medium text-ink">{formatCurrencyBRL(order.total_amount)}</td>
                    <td className="py-2.5 text-right">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
