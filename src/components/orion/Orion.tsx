"use client";

import { useState } from "react";
import { ExternalLink, Send, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { DetailSection, InfoGrid } from "@/components/resource/DetailLayout";
import { invalidateCache, useCached } from "@/lib/dashboard/client";
import { apiSend } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

// Integração com o ORION.WMS na interface do ATLAS: botão "Abrir ORION"
// (SSO), aviso "Gerenciado pelo ORION" nas telas de estoque físico e o
// painel "Armazém" dos documentos. Nada aqui autoriza: o banco recusa
// movimento físico (ESTOQUE_GERENCIADO_PELO_ORION) e o SSO revalida tudo.

export type OrionMe = {
  active: boolean;
  reason: string | null;
  orion_role: string | null;
  stock_managed_by_orion: boolean;
  integration_status: string | null;
};

export function useOrion() {
  const { status } = useSession();
  return useCached<OrionMe>("/api/integrations/orion/v1/me", status === "ready");
}

export function orionLaunchHref(returnTo = "/"): string {
  return `/api/integrations/orion/v1/sso/launch?return_to=${encodeURIComponent(returnTo)}`;
}

/** Botão do cabeçalho: só para quem tem acesso liberado ao ORION. */
export function OrionLaunchButton() {
  const me = useOrion();
  if (!me.data?.active) return null;
  return (
    <a
      href={orionLaunchHref("/")}
      target="_blank"
      rel="noopener"
      className="hidden h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground sm:inline-flex"
    >
      <Warehouse size={15} aria-hidden /> Abrir ORION
    </a>
  );
}

const MANAGED_PATHS: Array<[string, string]> = [
  ["/app/logistica/estoque", "Saldo fiscal — físico no ORION"],
  ["/app/logistica", "Gerenciado pelo ORION"],
  ["/app/producao/ordens", "Consumo e apontamento físico pelo ORION"],
  ["/app/suprimentos/agendamentos", "Recebimento físico pelo ORION"],
];

/** Aviso no topo das telas de estoque físico de empresa com ORION. */
export function OrionStockNotice({ pathname }: { pathname: string }) {
  const me = useOrion();
  const match = MANAGED_PATHS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  if (!match || !me.data?.stock_managed_by_orion) return null;
  return (
    <div className="mb-4">
      <Alert tone="info" title={match[1]}>
        O estoque físico desta empresa (endereços, lotes, reservas, separação, expedição e inventário) é operado no ORION.WMS.
        Aqui o ATLAS mostra o saldo fiscal, atualizado pelos eventos do armazém; ações físicas ficam desativadas.
        {me.data.active && (
          <>
            {" "}
            <a className="font-medium underline underline-offset-4" href={orionLaunchHref("/")} target="_blank" rel="noopener">
              Abrir no ORION <ExternalLink size={12} className="inline" aria-hidden />
            </a>
          </>
        )}
      </Alert>
    </div>
  );
}

/** true quando a empresa tem o estoque físico no ORION (esconde ações físicas). */
export function useStockManagedByOrion(): boolean {
  return useOrion().data?.stock_managed_by_orion === true;
}

const WMS_LABELS: Record<string, { label: string; tone: Tone }> = {
  not_sent: { label: "Não enviado", tone: "neutral" },
  queued: { label: "Na fila de envio", tone: "info" },
  sent: { label: "Enviado", tone: "info" },
  accepted: { label: "Aceito pelo armazém", tone: "success" },
  rejected: { label: "Recusado pelo armazém", tone: "danger" },
  failed: { label: "Falha no envio", tone: "danger" },
  picking: { label: "Em separação", tone: "accent" },
  ready_to_invoice: { label: "Pronto para faturar", tone: "warning" },
  shipped: { label: "Expedido", tone: "success" },
  received: { label: "Recebido", tone: "success" },
  in_progress: { label: "Em andamento", tone: "accent" },
  completed: { label: "Concluído", tone: "success" },
  cancelled: { label: "Cancelado no armazém", tone: "neutral" },
};

export function WmsStatusBadge({ status }: { status: string | null | undefined }) {
  const meta = WMS_LABELS[status ?? "not_sent"] ?? { label: status ?? "—", tone: "neutral" as Tone };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

type DocType = "sales_order" | "purchase_order" | "production_order";
const ROUTE: Record<DocType, string> = { sales_order: "sales-orders", purchase_order: "purchase-orders", production_order: "production-orders" };

type WmsDoc = { id: string; wms_status?: string | null; wms_sent_at?: string | null; wms_last_error?: string | null };
type EventRow = { id?: string; event_id?: string; event_type: string; status: string; created_at?: string; received_at?: string; last_error?: string | null };

/** Painel "Armazém" do documento: situação no WMS, erro, histórico e Enviar/Reenviar (§4.3). */
export function WarehousePanel({ type, doc, onChange }: { type: DocType; doc: WmsDoc; onChange: () => void }) {
  const me = useOrion();
  const { can } = useSession();
  const [busy, setBusy] = useState(false);
  const canView = can("orion.integration.view");
  const outbox = useCached<EventRow[]>(canView ? `/api/integrations/orion/admin/events?direction=out&document=${doc.id}` : null, canView);
  if (!me.data || !me.data.integration_status || me.data.integration_status === "pending" || me.data.integration_status === "disabled") return null;
  const wms = doc.wms_status ?? "not_sent";
  const canSend = can("orion.documents.send") && (["not_sent", "rejected", "failed"].includes(wms) || can("orion.integration.manage"));

  async function send() {
    setBusy(true);
    try {
      await apiSend(`/api/${ROUTE[type]}/${doc.id}/send-to-wms`, "POST", {});
      toast.success(wms === "not_sent" ? "Documento enviado ao armazém." : "Documento reenviado ao armazém.");
      invalidateCache(`/api/${ROUTE[type]}`);
      invalidateCache("/api/integrations/orion/admin/events");
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar ao armazém.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailSection
      title="Armazém (ORION)"
      actions={
        canSend ? (
          <Button size="sm" variant="secondary" loading={busy} onClick={send}>
            <Send size={14} aria-hidden /> {wms === "not_sent" ? "Enviar ao armazém" : "Reenviar"}
          </Button>
        ) : undefined
      }
    >
      <InfoGrid
        columns={3}
        items={[
          { label: "Situação no armazém", value: <WmsStatusBadge status={wms} /> },
          { label: "Enviado em", value: doc.wms_sent_at ? formatDateTime(doc.wms_sent_at) : "—" },
          { label: "Integração", value: me.data.integration_status === "active" ? "Ativa" : me.data.integration_status },
        ]}
      />
      {doc.wms_last_error && (
        <div className="mt-3">
          <Alert tone={wms === "rejected" || wms === "failed" ? "danger" : "warning"} title="Mensagem do armazém">
            {doc.wms_last_error}
            {wms === "rejected" && " Corrija o documento e use Reenviar. Se o armazém já começou a separar, cancele a linha ou o pedido."}
          </Alert>
        </div>
      )}
      {canView && (outbox.data?.length ?? 0) > 0 && (
        <ul className="mt-3 divide-y divide-border-subtle text-sm">
          {outbox.data!.slice(0, 8).map((e) => (
            <li key={e.id ?? e.event_id} className="flex items-center gap-3 py-1.5">
              <span className="font-mono text-xs">{e.event_type}</span>
              <Badge tone={e.status === "sent" ? "success" : e.status === "failed" ? "danger" : "neutral"}>{e.status}</Badge>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">{formatDateTime(e.created_at ?? e.received_at ?? "")}</span>
            </li>
          ))}
        </ul>
      )}
    </DetailSection>
  );
}
