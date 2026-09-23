"use client";

import { useParams } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Timeline } from "@/components/ui/Timeline";
import { useSession } from "@/components/shell/SessionProvider";
import { useBreadcrumbTail } from "@/components/shell/Breadcrumbs";
import { DetailError, DetailHeader, DetailSection, DetailSkeleton, InfoGrid, MiniTable } from "@/components/resource/DetailLayout";
import { useCached } from "@/lib/dashboard/client";
import { useIdNameLookup } from "@/lib/useIdNameLookup";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { AssetHistoryEvent, AssetRow, MaintenanceOrderRow } from "@/lib/database/schema";

// Detalhe do ativo: cadastro, manutenções e histórico (fn_asset_history).
// Ativo não é estoque — nenhum saldo de produto aparece aqui.

const ORDER_TYPE: Record<string, string> = { PREVENTIVE: "Preventiva", CORRECTIVE: "Corretiva", PREDICTIVE: "Preditiva" };
const EVENT_LABEL: Record<AssetHistoryEvent["event_type"], string> = {
  MAINTENANCE_ORDER: "Ordem de manutenção",
  PART_CONSUMPTION: "Consumo de peça",
  MAINTENANCE_COST: "Custo de manutenção",
  AUDIT: "Alteração cadastral",
};

export default function AtivoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const asset = useCached<AssetRow>(`/api/assets/${id}`);
  const ordersOk = can("maintenance_orders.view");
  const orders = useCached<MaintenanceOrderRow[]>(`/api/maintenance-orders?assetId=${id}`, ordersOk);
  const history = useCached<AssetHistoryEvent[]>(`/api/assets/${id}/history`);
  const categories = useIdNameLookup("/api/asset-categories");
  const locations = useIdNameLookup("/api/asset-locations");
  useBreadcrumbTail(asset.data?.code);

  if (asset.loading) return <DetailSkeleton />;
  if (asset.error || !asset.data) return <DetailError error={asset.error ?? "Registro não encontrado."} onRetry={asset.reload} backHref="/ativos/lista" />;
  const a = asset.data;
  const orderRows = orders.data ?? [];
  const openOrders = orderRows.filter((o) => !["COMPLETED", "CANCELLED"].includes(o.status)).length;

  return (
    <div className="flex flex-col gap-4">
      <DetailHeader
        backHref="/ativos/lista"
        backLabel="Ativos"
        code={a.code}
        title={a.description}
        status={<StatusBadge entity="assets" status={a.status} />}
        meta={
          <>
            {a.category_id && <span>{categories.get(a.category_id) ?? "Categoria não encontrada"}</span>}
            {a.location_id && <span>{locations.get(a.location_id) ?? "Local não encontrado"}</span>}
            {ordersOk && orders.data && <Badge tone={openOrders > 0 ? "warning" : "neutral"}>{openOrders} ordem(ns) em aberto</Badge>}
          </>
        }
      />

      <DetailSection title="Informações">
        <InfoGrid
          items={[
            { label: "Categoria", value: a.category_id ? categories.get(a.category_id) ?? "—" : "—" },
            { label: "Local", value: a.location_id ? locations.get(a.location_id) ?? "—" : "—" },
            { label: "Aquisição", value: formatDate(a.acquisition_date) },
            { label: "Custo de aquisição", value: <span className="tabular-nums">{formatCurrencyBRL(a.acquisition_cost)}</span> },
            { label: "Fabricante", value: a.manufacturer ?? "—" },
            { label: "Modelo", value: a.model ?? "—" },
            { label: "Número de série", value: a.serial_number ?? "—", mono: true },
            { label: "Situação", value: <StatusBadge entity="assets" status={a.status} /> },
          ]}
        />
      </DetailSection>

      <div className="grid gap-4 xl:grid-cols-5">
        {ordersOk && (
          <DetailSection title="Ordens de manutenção" description="Todas as ordens registradas para este ativo." className="xl:col-span-3">
            {orders.error ? (
              <p className="px-4 py-5 text-sm text-danger-fg">{orders.error}</p>
            ) : (
              <MiniTable
                rows={orderRows}
                rowKey={(o) => o.id}
                empty={orders.loading ? "Carregando…" : "Nenhuma ordem de manutenção para este ativo."}
                columns={[
                  { label: "Código", cell: (o) => <span className="code">{o.code}</span> },
                  { label: "Tipo", cell: (o) => ORDER_TYPE[o.order_type] ?? o.order_type },
                  { label: "Descrição", cell: (o) => <span className="line-clamp-1">{o.description}</span> },
                  { label: "Programada", cell: (o) => <span className="tabular-nums">{formatDate(o.scheduled_date)}</span> },
                  { label: "Status", cell: (o) => <StatusBadge entity="maintenance_orders" status={o.status} /> },
                ]}
              />
            )}
          </DetailSection>
        )}
        <DetailSection title="Histórico" description="Manutenções, consumos, custos e alterações." className={ordersOk ? "xl:col-span-2" : "xl:col-span-5"}>
          <div className="p-4">
            {history.loading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : history.error ? (
              <p className="text-sm text-danger-fg">{history.error}</p>
            ) : (history.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum evento registrado para este ativo ainda.</p>
            ) : (
              <Timeline
                entries={(history.data ?? []).map((event, i) => ({
                  id: `${event.event_at}-${i}`,
                  at: event.event_at,
                  title: event.description,
                  description: (
                    <>
                      {EVENT_LABEL[event.event_type]}
                      {event.amount !== null && (
                        <>
                          {" · "}
                          <span className="tabular-nums">{formatCurrencyBRL(event.amount)}</span>
                        </>
                      )}
                    </>
                  ),
                  tone: event.event_type === "MAINTENANCE_COST" || event.event_type === "PART_CONSUMPTION" ? "warning" : "neutral",
                }))}
              />
            )}
          </div>
        </DetailSection>
      </div>
    </div>
  );
}
