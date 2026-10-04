"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Ban, Calculator, CheckCircle2, FileText, Hash, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Stat, StatStrip } from "@/components/ui/Stat";
import { ConfirmDialog, Dialog } from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { useSession } from "@/components/shell/SessionProvider";
import { useBreadcrumbTail } from "@/components/shell/Breadcrumbs";
import { RecordHistory } from "@/components/resource/RecordHistory";
import { DetailError, DetailHeader, DetailSection, DetailSkeleton, InfoGrid, MiniTable } from "@/components/resource/DetailLayout";
import { useCached, invalidateCache } from "@/lib/dashboard/client";
import { apiSendWithMessage } from "@/lib/api-client";
import { formatAccessKey, isSimulatedProtocol } from "@/lib/fiscal/simulation";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import type { SimulatedDocumentPayload } from "@/lib/fiscal/simulated-document";

// Detalhe do documento fiscal com o fluxo da homologação: numerar → calcular
// → marcar como pronto → autorizar NA SIMULAÇÃO (provedor SIMULACAO, sem
// SEFAZ). As ações aparecem conforme a situação E a permissão; a regra de
// transição continua no banco, que recusa qualquer passo inválido.

type ActionId = "number" | "calculate" | "ready" | "simulate";

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Criado", CALCULATED: "Calculado", READY: "Pronto", AUTHORIZING: "Em autorização", AUTHORIZED: "Autorizado",
  CANCELLED: "Cancelado", REJECTED: "Rejeitado", DENIED: "Denegado", CONTINGENCY: "Contingência",
  CORRECTION_LETTER: "Carta de correção", INUTILIZATION: "Inutilização", MANIFESTATION: "Manifestação", OTHER: "Registro",
};

const ACTIONS: Record<ActionId, { label: string; path: string; permission: string; statuses: string[]; confirm: string; icon: typeof Hash; body?: unknown }> = {
  number: { label: "Numerar", path: "assign-number", permission: "fiscal_documents.calculate", statuses: ["DRAFT", "CALCULATED", "READY", "REJECTED"], confirm: "Atribui o próximo número da série 1 do estabelecimento. O número não é trocado depois.", icon: Hash, body: { seriesCode: "1" } },
  calculate: { label: "Calcular impostos", path: "calculate", permission: "fiscal_documents.update", statuses: ["DRAFT", "CALCULATED"], confirm: "Calcula os impostos dos itens pelas regras tributárias aprovadas.", icon: Calculator },
  ready: { label: "Marcar como pronto", path: "ready", permission: "fiscal_documents.ready", statuses: ["CALCULATED"], confirm: "Conclui a conferência fiscal: valores e partes ficam travados.", icon: CheckCircle2 },
  simulate: { label: "Autorizar (simulação)", path: "simulate-authorization", permission: "fiscal_documents.submit_authorization", statuses: ["READY", "REJECTED"], confirm: "Envia ao provedor de SIMULAÇÃO da homologação. Não há transmissão à SEFAZ e o documento não tem valor fiscal.", icon: ShieldCheck },
};

export default function NotaFiscalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const doc = useCached<SimulatedDocumentPayload>(`/api/fiscal-documents/${id}/simulated-document`);
  const [pending, setPending] = useState<ActionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  useBreadcrumbTail(doc.data?.code);

  function refresh() {
    invalidateCache(`/api/fiscal-documents`);
    doc.reload();
  }

  async function run(action: ActionId) {
    setBusy(true);
    try {
      const { message } = await apiSendWithMessage(`/api/fiscal-documents/${id}/${ACTIONS[action].path}`, "POST", ACTIONS[action].body ?? {});
      toast.success(message ?? `${ACTIONS[action].label}: concluído.`);
      setPending(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSimulated() {
    if (reason.trim().length < 15) {
      setReasonError("Escreva a justificativa com pelo menos 15 caracteres.");
      return;
    }
    setBusy(true);
    try {
      const { message } = await apiSendWithMessage(`/api/fiscal-documents/${id}/simulate-cancellation`, "POST", { reason: reason.trim() });
      toast.success(message ?? "Documento cancelado na simulação.");
      setCancelOpen(false);
      refresh();
    } catch (error) {
      setReasonError(error instanceof Error ? error.message : "Não foi possível cancelar.");
    } finally {
      setBusy(false);
    }
  }

  if (doc.loading && !doc.data) return <DetailSkeleton />;
  if (doc.error || !doc.data) return <DetailError error={doc.error ?? "Documento não encontrado."} onRetry={doc.reload} backHref="/app/fiscal/notas-fiscais" />;

  const d = doc.data;
  const status = String(d.status ?? "").toUpperCase();
  const homolog = d.environment === "HOMOLOGATION";
  const available = (Object.keys(ACTIONS) as ActionId[]).filter((key) => {
    const a = ACTIONS[key];
    if (!a.statuses.includes(status) || !can(a.permission)) return false;
    if (key === "number") return d.number === null;
    if (key === "simulate") return homolog;
    return true;
  });
  const canCancelSim = status === "AUTHORIZED" && isSimulatedProtocol(d.protocol) && can("fiscal_documents.cancel");
  const partnerLabel = d.partner.role === "destinatario" ? "Destinatário" : "Remetente (fornecedor)";

  return (
    <div className="flex flex-col gap-4">
      <DetailHeader
        backHref="/app/fiscal/notas-fiscais"
        backLabel="Documentos fiscais"
        code={d.code}
        title={d.partner.name ?? `Documento ${d.code}`}
        status={<StatusBadge entity="fiscal_documents" status={d.status} emphasis="chip" />}
        meta={
          <>
            <span className="tabular-nums">Emissão {formatDate(d.issueDate)}</span>
            <span>{d.direction === "SAIDA" ? "Saída" : "Entrada"}</span>
            {homolog && <span className="font-medium text-warning-fg">Homologação — sem valor fiscal</span>}
          </>
        }
        actions={
          <>
            {available.map((key, index) => {
              const a = ACTIONS[key];
              const Icon = a.icon;
              return (
                <Button key={key} size="sm" variant={index === 0 ? "primary" : "secondary"} onClick={() => setPending(key)}>
                  <Icon size={14} aria-hidden />
                  {a.label}
                </Button>
              );
            })}
            {canCancelSim && (
              <Button size="sm" variant="ghost" className="text-danger-fg" onClick={() => { setReason(""); setReasonError(null); setCancelOpen(true); }}>
                <Ban size={14} aria-hidden />
                Cancelar (simulação)
              </Button>
            )}
            <Link href={`/app/fiscal/notas-fiscais/${d.id}/documento-simulado`} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">
              <FileText size={14} aria-hidden />
              Documento simulado
            </Link>
          </>
        }
      />

      <StatStrip columns={4}>
        <Stat label="Total" value={formatCurrencyBRL(d.totals.total)} hint={`Produtos ${formatCurrencyBRL(d.totals.products)} · desconto ${formatCurrencyBRL(d.totals.discount)}`} />
        <Stat label="Impostos destacados" value={formatCurrencyBRL(d.totals.taxes)} hint={d.taxes.length ? `${d.taxes.length} tributo(s)` : "Nenhum imposto calculado"} />
        <Stat label="Número / série" value={d.number ? `${d.number} / ${d.series ?? "1"}` : "Sem número"} hint={d.model ? `Modelo ${d.model}` : undefined} />
        <Stat label="Itens" value={d.items.length.toLocaleString("pt-BR")} />
      </StatStrip>

      <DetailSection title="Informações">
        <InfoGrid
          columns={3}
          items={[
            { label: "Natureza da operação", value: d.operationNature ?? "—" },
            { label: "Emitente", value: d.issuer.name ?? "—" },
            { label: partnerLabel, value: d.partner.name ?? "—" },
            { label: "Origem", value: d.sourceCode ? `${d.sourceType === "purchase_receipt" ? "Recebimento" : "Pedido"} ${d.sourceCode}` : "—" },
            { label: "Protocolo", value: d.protocol ?? "—", mono: true },
            { label: "Autorizado em", value: d.authorizedAt ? formatDate(d.authorizedAt) : "—" },
            { label: "Chave de acesso", value: d.accessKey ? formatAccessKey(d.accessKey) : "—", mono: true, wide: true },
          ]}
        />
      </DetailSection>

      <DetailSection title="Itens" description={`${d.items.length} item(ns)`}>
        <MiniTable
          rows={d.items}
          rowKey={(i) => i.id}
          empty="Documento sem itens."
          columns={[
            { label: "Descrição", cell: (i) => <span className="line-clamp-1">{i.description}</span> },
            { label: "NCM", cell: (i) => <span className="tabular-nums">{i.ncmCode ?? "—"}</span> },
            { label: "CFOP", cell: (i) => <span className="tabular-nums">{i.cfopCode ?? "—"}</span> },
            { label: "Qtd.", align: "right", cell: (i) => `${i.quantity.toLocaleString("pt-BR")} ${i.unit ?? ""}` },
            { label: "Preço unit.", align: "right", cell: (i) => formatCurrencyBRL(i.unitPrice) },
            { label: "Desconto", align: "right", cell: (i) => formatCurrencyBRL(i.discount) },
            { label: "Total", align: "right", cell: (i) => <span className="font-medium">{formatCurrencyBRL(i.total)}</span> },
          ]}
        />
      </DetailSection>

      <DetailSection title="Eventos" description="Linha do tempo do documento.">
        <MiniTable
          rows={d.events}
          rowKey={(e) => `${e.type}-${e.at}`}
          empty="Sem eventos."
          columns={[
            { label: "Quando", cell: (e) => <span className="tabular-nums">{new Date(e.at).toLocaleString("pt-BR")}</span> },
            { label: "Evento", cell: (e) => <span className="font-medium">{EVENT_LABELS[e.type] ?? "Registro"}</span> },
            { label: "Mensagem", cell: (e) => <span className="line-clamp-2">{e.message ?? "—"}</span> },
          ]}
        />
      </DetailSection>

      <DetailSection title="Histórico" description="Alterações registradas na auditoria.">
        <div className="p-4">
          <RecordHistory entityId={d.id} />
        </div>
      </DetailSection>

      {pending && (
        <ConfirmDialog
          open
          title={`${ACTIONS[pending].label}?`}
          description={ACTIONS[pending].confirm}
          confirmLabel={ACTIONS[pending].label}
          cancelLabel="Voltar"
          loading={busy}
          onConfirm={() => run(pending)}
          onCancel={() => setPending(null)}
        />
      )}

      <Dialog
        open={cancelOpen}
        onOpenChange={(next) => !busy && setCancelOpen(next)}
        title="Cancelar na simulação"
        description="O cancelamento é registrado só na simulação da homologação (sem transmissão à SEFAZ). Prazo: 24 horas da autorização."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={busy}>Voltar</Button>
            <Button variant="danger" onClick={cancelSimulated} loading={busy}>Cancelar documento</Button>
          </>
        }
      >
        <FormField label="Justificativa" required error={reasonError ?? undefined} help="Pelo menos 15 caracteres.">
          <Textarea value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null); }} rows={3} />
        </FormField>
      </Dialog>
    </div>
  );
}
