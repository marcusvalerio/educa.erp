"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCached } from "@/lib/dashboard/client";
import { useBreadcrumbTail } from "@/components/shell/Breadcrumbs";
import { DetailError, DetailSkeleton } from "@/components/resource/DetailLayout";
import { SIMULATION_BANNER, SIMULATION_WATERMARK, formatAccessKey } from "@/lib/fiscal/simulation";
import { statusMeta } from "@/lib/status";
import { formatCurrencyBRL, formatDate } from "@/lib/format";
import { simulatedOriginLabel, type SimulatedDocumentPayload, type SimulatedParty } from "@/lib/fiscal/simulated-document";

// Documento visual da SIMULAÇÃO fiscal. Estrutura parecida com o documento
// auxiliar brasileiro para conferência na homologação, mas: sem brasões ou
// logotipos oficiais, sem código de barras, com faixa e marca d'água
// "ATLAS.ERP — SIMULAÇÃO" e texto final dizendo que não houve transmissão.
// Em nenhum lugar o documento se apresenta como NF-e autorizada.

export default function DocumentoSimuladoPage() {
  const { id } = useParams<{ id: string }>();
  const doc = useCached<SimulatedDocumentPayload>(`/api/fiscal-documents/${id}/simulated-document`);
  useBreadcrumbTail(doc.data ? `${doc.data.code} · simulação` : undefined);

  if (doc.loading && !doc.data) return <DetailSkeleton />;
  if (doc.error || !doc.data) return <DetailError error={doc.error ?? "Documento não encontrado."} onRetry={doc.reload} backHref="/app/fiscal/notas-fiscais" />;
  const d = doc.data;
  const status = String(d.status).toUpperCase();
  const stamp = status === "CANCELLED" ? "CANCELADO" : status === "AUTHORIZED" ? "SIMULAÇÃO — SEM VALOR FISCAL" : "NÃO AUTORIZADO";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/app/fiscal/notas-fiscais/${d.id}`} className="text-sm font-medium text-muted-foreground hover:text-foreground">← Voltar ao documento {d.code}</Link>
        <span className="text-xs text-muted-foreground">Situação no ATLAS.ERP: {statusMeta("fiscal_documents", d.status).label}</span>
      </div>

      <article
        aria-label={`Documento fiscal simulado ${d.code}`}
        className="relative mx-auto w-full max-w-[900px] overflow-hidden rounded-md border-2 border-foreground/70 bg-white text-[13px] leading-snug text-neutral-900"
      >
        {/* Marca d'água repetida na folha (decorativa; o aviso textual está na faixa e no rodapé). */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-around overflow-hidden select-none">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="-rotate-[24deg] whitespace-nowrap text-[clamp(22px,5vw,44px)] font-black tracking-widest text-red-700/10">
              {SIMULATION_WATERMARK} · {SIMULATION_WATERMARK}
            </span>
          ))}
        </div>

        <div className="relative bg-red-700 px-3 py-2 text-center text-[11px] font-bold tracking-wide text-white sm:text-xs">{SIMULATION_BANNER}</div>

        <div className="relative grid gap-0 border-b border-neutral-800 sm:grid-cols-[1.4fr_1fr]">
          <Box title="Emitente" className="sm:border-r">
            <Party p={d.issuer} />
          </Box>
          <Box title="Documento auxiliar simulado">
            <p className="text-base font-bold">{d.type === "NFE" ? "NF-e" : d.type} · {d.direction === "SAIDA" ? "1 - Saída" : "0 - Entrada"}</p>
            <p>Nº <b className="tabular-nums">{d.number ? String(d.number).padStart(9, "0") : "—"}</b> · Série <b>{d.series ?? "—"}</b> · Modelo {d.model ?? "55"}</p>
            <p>Emissão {formatDate(d.issueDate)}</p>
            <p className="mt-1 inline-block rounded border-2 border-red-700 px-2 py-0.5 text-xs font-black tracking-wide text-red-700">{stamp}</p>
          </Box>
        </div>

        <Box title="Chave de acesso (simulada)" className="relative border-b">
          <p className="break-all font-mono text-sm tabular-nums">{d.accessKey ? formatAccessKey(d.accessKey) : "Sem chave — documento não autorizado na simulação"}</p>
          <p className="text-xs">Protocolo: <span className="font-mono">{d.protocol ?? "—"}</span>{d.authorizedAt ? ` · ${new Date(d.authorizedAt).toLocaleString("pt-BR")}` : ""}</p>
        </Box>

        <div className="relative grid border-b border-neutral-800 sm:grid-cols-2">
          <Box title="Natureza da operação" className="sm:border-r">{d.operationNature ?? "—"}</Box>
          <Box title="Origem">{simulatedOriginLabel(d.sourceType, d.sourceCode)}</Box>
        </div>

        <Box title={d.partner.role === "destinatario" ? "Destinatário" : "Remetente (fornecedor)"} className="relative border-b">
          <Party p={d.partner} />
        </Box>

        <div className="relative overflow-x-auto border-b border-neutral-800">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-neutral-100 text-left">
                {["Descrição", "NCM", "CFOP", "Un.", "Qtd.", "Valor unit.", "Desconto", "Total"].map((h) => (
                  <th key={h} className="border-b border-neutral-800 px-2 py-1 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.items.map((i) => (
                <tr key={i.id} className="border-b border-neutral-300 align-top">
                  <td className="px-2 py-1">{i.description}</td>
                  <td className="px-2 py-1 font-mono">{i.ncmCode ?? "—"}</td>
                  <td className="px-2 py-1 font-mono">{i.cfopCode ?? "—"}</td>
                  <td className="px-2 py-1">{i.unit ?? "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{i.quantity.toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatCurrencyBRL(i.unitPrice)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{formatCurrencyBRL(i.discount)}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatCurrencyBRL(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="relative grid border-b border-neutral-800 sm:grid-cols-2">
          <Box title="Tributos" className="sm:border-r">
            {d.taxes.length === 0 ? (
              <p>Nenhum imposto calculado (sem regra tributária aplicável).</p>
            ) : (
              d.taxes.map((t) => (
                <p key={t.taxType} className="tabular-nums">{t.taxType}: base {formatCurrencyBRL(t.base)} · alíquota {t.rate.toLocaleString("pt-BR")}% · {formatCurrencyBRL(t.amount)}</p>
              ))
            )}
          </Box>
          <Box title="Totais">
            <Line label="Produtos" value={d.totals.products} />
            <Line label="Desconto" value={-d.totals.discount} />
            <Line label="Frete" value={d.totals.freight} />
            <Line label="Seguro" value={d.totals.insurance} />
            <Line label="Outras despesas" value={d.totals.other} />
            <Line label="Impostos destacados" value={d.totals.taxes} />
            <p className="mt-1 flex justify-between border-t border-neutral-800 pt-1 text-sm font-bold"><span>Total do documento</span><span className="tabular-nums">{formatCurrencyBRL(d.totals.total)}</span></p>
          </Box>
        </div>

        <footer className="relative bg-neutral-100 px-3 py-2 text-[11px] text-neutral-700">
          Documento gerado pelo ATLAS.ERP no ambiente de HOMOLOGAÇÃO a partir do provedor de simulação. Não houve transmissão à SEFAZ,
          não há certificado digital envolvido e este documento NÃO tem valor fiscal. A chave e o protocolo existem só para conferência do fluxo.
        </footer>
      </article>
    </div>
  );
}

function Box({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`border-neutral-800 px-3 py-2 ${className}`}>
      <h2 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-600">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function Party({ p }: { p: SimulatedParty }) {
  return (
    <>
      <p className="font-semibold">{p.name ?? "—"}</p>
      <p>CPF/CNPJ: <span className="font-mono">{p.document ?? "—"}</span>{p.stateRegistration ? ` · IE ${p.stateRegistration}` : ""}</p>
      <p>{[p.address, p.city, p.state, p.zipCode].filter(Boolean).join(" · ") || "Endereço não informado"}</p>
    </>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between tabular-nums"><span>{label}</span><span>{formatCurrencyBRL(value)}</span></p>
  );
}
