"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Banknote, Calendar, MapPin, RefreshCcw, Tag, Wrench } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { apiGet } from "@/lib/api-client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate, formatDateTime } from "@/lib/format";
import type { AssetHistoryEvent, AssetRow, MaintenanceOrderRow } from "@/lib/database/schema";

// Fase 19 — workspace rico do ativo: Informações + Manutenções +
// Histórico, tudo com dados reais (fn_asset_history, Fase 16). ATIVO
// NÃO É ESTOQUE — nenhum saldo de produto é mostrado aqui, só o que o
// próprio ativo já representa (dados cadastrais, ordens, histórico).
export default function AtivoDetailPage() {
  const params = useParams<{ id: string }>();
  const assetId = params.id;

  const [asset, setAsset] = useState<AssetRow | null>(null);
  const [orders, setOrders] = useState<MaintenanceOrderRow[]>([]);
  const [history, setHistory] = useState<AssetHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const categories = useIdNameLookup("/api/asset-categories");
  const locations = useIdNameLookup("/api/asset-locations");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [assetData, ordersData, historyData] = await Promise.all([
          apiGet<AssetRow>(`/api/assets/${assetId}`),
          apiGet<MaintenanceOrderRow[]>(`/api/maintenance-orders?assetId=${assetId}`),
          apiGet<AssetHistoryEvent[]>(`/api/assets/${assetId}/history`),
        ]);
        if (cancelled) return;
        setAsset(assetData);
        setOrders(ordersData);
        setHistory(historyData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o ativo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [assetId, reloadToken]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-border pb-6">
        <Breadcrumb items={[{ label: "Ativos", href: "/ativos" }, { label: "Ativos", href: "/ativos/lista" }, { label: asset?.code ?? "Detalhe" }]} />
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-ink sm:text-[1.85rem]">{asset?.description ?? "Ativo"}</h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">Informações cadastrais, manutenções e histórico completo do ativo.</p>
        </div>
      </div>

      {error ? (
        <Card className="flex items-start gap-3 border-danger/30 bg-danger-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" strokeWidth={1.75} />
          <div className="flex-1">
            <p className="text-[13.5px] font-medium text-danger">Não foi possível carregar o ativo</p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">{error}</p>
          </div>
          <Button variant="secondary" onClick={() => setReloadToken((n) => n + 1)}>
            <RefreshCcw size={15} />
            Tentar novamente
          </Button>
        </Card>
      ) : loading || !asset ? (
        <div className="flex flex-col gap-4">
          <Card className="p-6">
            <span className="animate-skeleton block h-4 w-48 rounded bg-border-strong/60" />
          </Card>
          <TableSkeleton columns={4} />
        </div>
      ) : (
        <>
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-start gap-2.5">
                <Tag size={15} strokeWidth={1.75} className="mt-0.5 text-ink-subtle" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Categoria</p>
                  <p className="text-[13px] text-ink">{asset.category_id ? categories.get(asset.category_id) ?? asset.category_id : "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <MapPin size={15} strokeWidth={1.75} className="mt-0.5 text-ink-subtle" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Local</p>
                  <p className="text-[13px] text-ink">{asset.location_id ? locations.get(asset.location_id) ?? asset.location_id : "—"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Calendar size={15} strokeWidth={1.75} className="mt-0.5 text-ink-subtle" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Aquisição</p>
                  <p className="text-[13px] text-ink">{formatDate(asset.acquisition_date)}</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Banknote size={15} strokeWidth={1.75} className="mt-0.5 text-ink-subtle" />
                <div>
                  <p className="text-[11px] font-medium text-ink-subtle uppercase">Custo de aquisição</p>
                  <p className="text-[13px] text-ink">{formatCurrencyBRL(asset.acquisition_cost)}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-[12.5px] text-ink-subtle">
              <span>Fabricante: {asset.manufacturer ?? "—"}</span>
              <span>·</span>
              <span>Modelo: {asset.model ?? "—"}</span>
              <span>·</span>
              <span>Série: {asset.serial_number ?? "—"}</span>
              <span>·</span>
              <StatusBadge status={asset.status} />
            </div>
          </Card>

          <div>
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
              <Wrench size={13} /> Ordens de manutenção
            </p>
            {orders.length === 0 ? (
              <Card className="p-5 text-[13px] text-ink-subtle">Nenhuma ordem de manutenção para este ativo.</Card>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-card">
                <table className="w-full min-w-[560px] text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-sunken/50">
                      <th className="px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Código</th>
                      <th className="px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Tipo</th>
                      <th className="px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Descrição</th>
                      <th className="px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-b border-border last:border-0 hover:bg-surface-hover/60">
                        <td className="px-4 py-3 font-medium text-ink">{order.code}</td>
                        <td className="px-4 py-3 text-ink">{order.order_type}</td>
                        <td className="px-4 py-3 text-ink">{order.description}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">Histórico completo</p>
            {history.length === 0 ? (
              <Card className="p-5 text-[13px] text-ink-subtle">Nenhum evento registrado para este ativo ainda.</Card>
            ) : (
              <div className="flex flex-col gap-2">
                {history.map((event, i) => (
                  <Card key={i} className="flex items-center justify-between gap-3 p-3.5">
                    <div className="flex items-center gap-3">
                      <span className="rounded-md bg-surface-sunken px-2 py-1 text-[11px] font-medium text-ink-muted">{event.event_type}</span>
                      <p className="text-[13px] text-ink">{event.description}</p>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-ink-subtle">
                      {event.amount !== null && <span className="font-medium text-ink">{formatCurrencyBRL(event.amount)}</span>}
                      <span>{formatDateTime(event.event_at)}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
