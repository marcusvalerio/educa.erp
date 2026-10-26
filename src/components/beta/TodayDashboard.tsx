"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { useSession } from "@/components/shell/SessionProvider";
import { useProblems } from "@/components/dashboard/Problems";
import { cachedGet } from "@/lib/dashboard/client";
import { SO_OPEN, rankProblems, type ProblemResult } from "@/lib/dashboard/problems";
import { dailySeries, dueWithin, monthlySeries, oldestAgeDays, stalled, summarySentence, variation } from "@/lib/beta/today";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";

// "O que precisa de você hoje": pendências reais, ordenadas por impacto em
// R$ (depois gravidade e o foco do papel — dashboard_focus_areas/rules via
// fn_user_context), cada uma com a idade e o próximo passo. Lê as APIs
// atuais com a sessão do usuário (RLS); fonte sem permissão não é consultada.

type Row = Record<string, unknown>;

const RECEIVABLE_OPEN = ["OPEN", "PARTIALLY_RECEIVED", "OVERDUE"];
const PAYABLE_OPEN = ["OPEN", "PARTIALLY_PAID", "OVERDUE"];

const NEXT_STEP: Record<string, string> = {
  "sales-late": "Ver entregas",
  "sales-approval": "Aprovar",
  "quotes-expired": "Renovar ou encerrar",
  "payables-overdue": "Pagar ou renegociar",
  "receivables-overdue": "Cobrar",
  "purchase-late": "Cobrar fornecedor",
  "purchase-requests-approval": "Aprovar",
  "receipts-pending": "Conferir",
  "shipments-late": "Expedir",
  "stock-unavailable": "Repor",
  "material-requests": "Atender",
  "production-late": "Replanejar",
  "fiscal-rejected": "Corrigir",
  "nonconformities-open": "Tratar",
  "maintenance-late": "Executar",
  "service-orders-late": "Atender",
  "tasks-blocked": "Destravar",
  "activities-late": "Retomar",
  "receivables-today": "Acompanhar",
  "payables-today": "Pagar hoje",
  "quotes-expiring": "Fazer follow-up",
  "sales-stalled": "Destravar",
};

// Idade da pendência mais antiga: campo de data, situações e a frase.
const AGE: Record<string, { key: string; statuses: string[]; text: string }> = {
  "sales-late": { key: "expected_delivery_at", statuses: SO_OPEN, text: "atrasado há" },
  "sales-approval": { key: "created_at", statuses: ["pending_approval"], text: "aguardando há" },
  "quotes-expired": { key: "valid_until", statuses: ["draft", "sent"], text: "vencido há" },
  "payables-overdue": { key: "due_date", statuses: PAYABLE_OPEN, text: "vencido há" },
  "receivables-overdue": { key: "due_date", statuses: RECEIVABLE_OPEN, text: "vencido há" },
  "purchase-late": { key: "expected_delivery_at", statuses: ["approved", "sent", "partially_received"], text: "atrasado há" },
  "purchase-requests-approval": { key: "created_at", statuses: ["requested"], text: "aguardando há" },
  "receipts-pending": { key: "created_at", statuses: ["draft"], text: "aguardando há" },
  "shipments-late": { key: "expected_ship_date", statuses: ["draft", "ready", "picking", "packed", "ready_to_ship"], text: "atrasada há" },
  "material-requests": { key: "created_at", statuses: ["requested"], text: "aguardando há" },
  "production-late": { key: "planned_date", statuses: ["planned", "released", "materials_reserved", "in_progress", "on_hold"], text: "atrasada há" },
  "maintenance-late": { key: "scheduled_date", statuses: ["OPEN", "PLANNED", "WAITING_PARTS"], text: "atrasada há" },
  "service-orders-late": { key: "scheduled_date", statuses: ["OPEN", "SCHEDULED", "WAITING"], text: "atrasada há" },
  "activities-late": { key: "due_date", statuses: ["PENDING"], text: "atrasada há" },
  "sales-stalled": { key: "updated_at", statuses: SO_OPEN, text: "parado há" },
};
const FIXED_AGE: Record<string, string> = { "receivables-today": "vence hoje", "payables-today": "vence hoje", "quotes-expiring": "vence em até 3 dias" };

/** Linhas de cada fonte (o cache é o mesmo dos detectores: não refaz a chamada). */
function useRows(paths: string[]): { rows: Record<string, Row[]>; loading: boolean } {
  const [state, setState] = useState<{ rows: Record<string, Row[]>; loading: boolean }>({ rows: {}, loading: true });
  const key = [...new Set(paths)].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split(",") : [];
    Promise.all(list.map((p) => cachedGet<Row[]>(p).then((r) => [p, Array.isArray(r) ? r : []] as const).catch(() => null))).then((out) => {
      if (cancelled) return;
      const rows: Record<string, Row[]> = {};
      for (const o of out) if (o) rows[o[0]] = o[1];
      setState({ rows, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const TONE = {
  critical: { chip: "bx-chip-bad", icon: CircleAlert },
  danger: { chip: "bx-chip-bad", icon: CircleAlert },
  warning: { chip: "bx-chip-warn", icon: Clock },
} as const;

const days = (n: number) => (n === 0 ? "hoje" : n === 1 ? "1 dia" : `${n} dias`);

function Pulse({ series }: { series: { key: string; value: number; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((s) => s.value));
  const total = series.reduce((a, s) => a + s.value, 0);
  const label = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  const shown = hover ?? series.length - 1;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <p className="bx-meta">{hover === null ? "Hoje" : label(series[shown].key)}</p>
          <p className="bx-num text-[15px] font-semibold text-[var(--bx-ink)]">
            {formatCurrencyBRL(series[shown].value)} <span className="text-[12px] font-normal text-[var(--bx-muted)]">· {formatInteger(series[shown].count)} pedido(s)</span>
          </p>
        </div>
        <p className="bx-meta text-right">
          30 dias
          <br />
          <span className="bx-num text-[var(--bx-ink)]">{formatCurrencyBRL(total)}</span>
        </p>
      </div>
      <div
        className="flex h-24 items-end gap-[3px]"
        role="img"
        aria-label={`Vendas por dia nos últimos 30 dias, total ${formatCurrencyBRL(total)}`}
        onMouseLeave={() => setHover(null)}
      >
        {series.map((s, i) => (
          <button
            key={s.key}
            type="button"
            tabIndex={-1}
            aria-hidden
            className="flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(hover === i ? null : i)}
          >
            <span
              className={`bx-pulse-bar block w-full ${i === series.length - 1 ? "bx-pulse-today" : ""}`}
              style={{ height: `${s.value > 0 ? Math.max(6, (s.value / max) * 100) : 3}%`, opacity: hover !== null && hover !== i ? 0.55 : undefined }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="bx-meta">{label(series[0].key)}</span>
        <span className="bx-meta">hoje</span>
      </div>
    </div>
  );
}

export function TodayDashboard() {
  const { data: session, can } = useSession();
  const problems = useProblems();
  const [today] = useState(() => new Date());

  const extra = useMemo(
    () =>
      [
        can("accounts_receivable.view") && "/api/accounts-receivable",
        can("accounts_payable.view") && "/api/accounts-payable",
        can("sales_quotes.view") && "/api/sales-quotes",
        can("sales_orders.view") && "/api/sales-orders",
      ].filter(Boolean) as string[],
    [can]
  );
  const paths = useMemo(() => [...extra, ...problems.checked.map((d) => d.source)], [extra, problems.checked]);
  const { rows, loading: rowsLoading } = useRows(paths);
  const ar = rows["/api/accounts-receivable"];
  const ap = rows["/api/accounts-payable"];
  const quotes = rows["/api/sales-quotes"];
  const sales = rows["/api/sales-orders"];

  const focusModules = useMemo(() => {
    const seen: string[] = [];
    for (const f of session?.focus ?? []) if (f.module_code && !seen.includes(f.module_code)) seen.push(f.module_code);
    return seen;
  }, [session]);

  const todayItems: ProblemResult[] = useMemo(() => {
    const items: ProblemResult[] = [];
    const base = { compute: () => ({ count: 0 }), severity: "warning" as const, source: "" };
    if (ar) items.push({ ...base, id: "receivables-today", module: "financeiro", label: "Títulos a receber vencem hoje", hint: "Confirme o recebimento ou avise o cliente.", permission: "accounts_receivable.view", href: "/app/financeiro/contas-receber", ...dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 0, "updated_amount") });
    if (ap) items.push({ ...base, id: "payables-today", module: "financeiro", label: "Contas a pagar vencem hoje", hint: "Pague hoje para não gerar juros.", permission: "accounts_payable.view", href: "/app/financeiro/contas-pagar", ...dueWithin(ap, "due_date", PAYABLE_OPEN, today, 0, "updated_amount") });
    if (quotes) items.push({ ...base, id: "quotes-expiring", module: "comercial", label: "Orçamentos perto do fim da validade", hint: "Propostas ainda sem resposta.", permission: "sales_quotes.view", href: "/app/comercial/orcamentos", ...dueWithin(quotes, "valid_until", ["DRAFT", "SENT"], today, 3, "total_amount") });
    if (sales) {
      const limit = today.getTime() - 3 * 86_400_000;
      const hits = sales.filter((r) => SO_OPEN.includes(String(r.status)) && Date.parse(String(r.updated_at ?? r.created_at ?? "")) <= limit);
      items.push({ ...base, id: "sales-stalled", module: "comercial", label: "Pedidos de venda parados", hint: "Sem movimento há 3 dias ou mais.", permission: "sales_orders.view", href: "/app/comercial/pedidos-venda", ...stalled(sales, SO_OPEN, today, 3), amount: hits.reduce((a, r) => a + (Number(r.total_amount) || 0), 0) });
    }
    return items;
  }, [ar, ap, quotes, sales, today]);

  // Impacto em R$ primeiro; empate → gravidade, foco do papel e volume.
  const ranked = useMemo(() => {
    const base = rankProblems([...problems.results, ...todayItems], focusModules);
    const order = new Map(base.map((p, i) => [p.id, i]));
    return [...base].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0) || order.get(a.id)! - order.get(b.id)!);
  }, [problems.results, todayItems, focusModules]);

  const ageOf = (p: ProblemResult): string | null => {
    if (FIXED_AGE[p.id]) return FIXED_AGE[p.id];
    const rule = AGE[p.id];
    const list = rows[p.source || (p.id === "sales-stalled" ? "/api/sales-orders" : "")];
    if (!rule || !list) return null;
    const n = oldestAgeDays(list, rule.key, rule.statuses, today, rule.key !== "created_at" && rule.key !== "updated_at" ? true : false);
    return n === null ? null : `${rule.text} ${days(n)}`;
  };

  const loading = problems.loading || rowsLoading;
  const count = (id: string) => ranked.find((r) => r.id === id)?.count ?? 0;
  const sentence = summarySentence([
    { count: count("receivables-today") + count("payables-today"), one: "título vence hoje", many: "títulos vencem hoje" },
    { count: count("receivables-overdue") + count("payables-overdue"), one: "título vencido", many: "títulos vencidos" },
    { count: count("sales-stalled") + count("sales-late"), one: "pedido parado ou atrasado", many: "pedidos parados ou atrasados" },
    { count: count("quotes-expiring") + count("quotes-expired"), one: "orçamento a expirar", many: "orçamentos a expirar ou vencidos" },
    { count: count("receipts-pending"), one: "recebimento pendente", many: "recebimentos pendentes" },
  ]);

  const months = sales ? monthlySeries(sales, "order_date", "total_amount", today, 2, ["cancelled"]) : null;
  const pulse = sales ? dailySeries(sales, "order_date", "total_amount", today, 30, ["cancelled"]) : null;
  const kpis = [
    ar && { label: "A receber · 7 dias", value: formatCurrencyBRL(dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 7, "updated_amount").amount ?? 0), hint: `${formatInteger(dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 7).count)} títulos`, href: "/app/financeiro/contas-receber" },
    ap && { label: "A pagar · 7 dias", value: formatCurrencyBRL(dueWithin(ap, "due_date", PAYABLE_OPEN, today, 7, "updated_amount").amount ?? 0), hint: `${formatInteger(dueWithin(ap, "due_date", PAYABLE_OPEN, today, 7).count)} títulos`, href: "/app/financeiro/contas-pagar" },
    sales && { label: "Pedidos em andamento", value: formatInteger(sales.filter((r) => SO_OPEN.includes(String(r.status))).length), hint: "em aberto", href: "/app/comercial/pedidos-venda" },
    months && { label: "Vendas no mês", value: formatCurrencyBRL(months[1].value), hint: "vs. mês anterior", delta: variation(months), href: "/app/comercial/pedidos-venda" },
  ].filter(Boolean) as { label: string; value: string; hint: string; delta?: number | null; href: string }[];

  const firstName = (session?.tenant?.user.name ?? "").split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1.5 pt-1">
        <p className="bx-meta">{today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
        <h1 className="bx-title text-[24px] leading-[30px]">
          {greeting(today)}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="max-w-2xl text-[14px] leading-[20px] text-[var(--bx-muted)]">
          {loading ? "Olhando o que precisa de você hoje…" : sentence ? `${sentence}.` : "Nada pede a sua ação agora. Bom momento para planejar."}
        </p>
      </section>

      <section className="bx-card overflow-hidden">
        <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
          <h2 className="bx-title text-[15px]">O que precisa de você hoje</h2>
          {!loading && ranked.length > 0 && <span className="bx-chip bx-chip-info bx-num">{ranked.length}</span>}
          <span className="bx-meta ml-auto hidden sm:inline">Por impacto em R$</span>
        </header>
        {loading ? (
          <ul className="flex flex-col gap-1.5 px-4 pb-4">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="h-11 animate-pulse rounded-[var(--bx-r-inner)] bg-[var(--bx-line-soft)]" />
            ))}
          </ul>
        ) : problems.checked.length === 0 && todayItems.length === 0 ? (
          <p className="px-4 pb-4 text-[var(--bx-muted)]">O seu perfil não acompanha pendências. Peça ao administrador as permissões dos módulos em que você trabalha.</p>
        ) : ranked.length === 0 ? (
          <div className="flex items-center gap-3 px-4 pb-4">
            <span className="bx-chip bx-chip-ok">
              <CheckCircle2 size={12} aria-hidden /> Tudo em dia
            </span>
            <p className="text-[var(--bx-muted)]">Nenhum título vencendo, pedido parado ou orçamento expirando.</p>
          </div>
        ) : (
          <ul>
            {ranked.slice(0, 12).map((p) => {
              const tone = TONE[p.severity];
              const Icon = tone.icon;
              const age = ageOf(p);
              return (
                <li key={p.id} className="border-t border-[var(--bx-line-soft)]">
                  <Link href={p.href} className="group flex min-h-11 items-center gap-3 px-4 py-1.5 hover:bg-[var(--bx-havana-soft)]">
                    <Icon size={15} aria-hidden className={p.severity === "warning" ? "shrink-0 text-[var(--bx-warn-fg)]" : "shrink-0 text-[var(--bx-bad-fg)]"} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-semibold text-[var(--bx-ink)]">{p.label}</span>
                        <span className={`bx-chip ${tone.chip} bx-num shrink-0`}>{formatInteger(p.count)}</span>
                      </span>
                      {age && <span className="block truncate text-[12px] leading-4 text-[var(--bx-muted)]">{age}</span>}
                    </span>
                    {p.amount ? <span className="bx-num hidden shrink-0 text-right text-[13px] font-semibold text-[var(--bx-ink)] sm:block">{formatCurrencyBRL(p.amount)}</span> : null}
                    <span className="bx-btn bx-btn-secondary bx-btn-sm shrink-0">
                      {NEXT_STEP[p.id] ?? "Resolver"} <ArrowRight size={12} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && problems.failed.length > 0 && (
          <p className="flex items-center gap-2 border-t border-[var(--bx-line-soft)] px-4 py-2.5 text-[12px] text-[var(--bx-subtle)]">
            <AlertTriangle size={12} aria-hidden /> {problems.failed.length} verificação(ões) não responderam agora.
          </p>
        )}
      </section>

      {kpis.length > 0 && (
        <section className="bx-card grid grid-cols-2 divide-[var(--bx-line-soft)] lg:grid-cols-4 lg:divide-x" aria-label="Indicadores">
          {kpis.map((k, i) => (
            <Link key={k.label} href={k.href} className={`flex flex-col gap-1 px-4 py-3 hover:bg-[var(--bx-havana-soft)] ${i >= 2 ? "border-t border-[var(--bx-line-soft)] lg:border-t-0" : ""} ${i % 2 === 1 ? "border-l border-[var(--bx-line-soft)] lg:border-l-0" : ""}`}>
              <span className="bx-meta">{k.label}</span>
              <span className="bx-title bx-num text-[20px] leading-6 sm:text-[24px] sm:leading-7">{k.value}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--bx-muted)]">
                {k.delta !== undefined && k.delta !== null && (
                  <span className={`bx-chip ${k.delta >= 0 ? "bx-chip-ok" : "bx-chip-bad"}`}>
                    {k.delta >= 0 ? <ArrowUpRight size={11} aria-hidden /> : <ArrowDownRight size={11} aria-hidden />}
                    {k.delta >= 0 ? "+" : ""}
                    {k.delta}%
                  </span>
                )}
                {k.hint}
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {pulse && (
          <div className="bx-card p-4">
            <h2 className="bx-title mb-2 text-[15px]">Pulso de vendas</h2>
            {pulse.every((s) => s.value === 0) ? <p className="text-[var(--bx-muted)]">Nenhum pedido de venda nos últimos 30 dias. Eles aparecem aqui assim que forem lançados.</p> : <Pulse series={pulse} />}
          </div>
        )}
        {ar && ap && (
          <div className="bx-card p-4">
            <h2 className="bx-title mb-1 text-[15px]">Próximos 7 dias</h2>
            <table className="bx-table">
              <tbody>
                <tr>
                  <td className="!pl-0">Entradas previstas</td>
                  <td className="!pr-0 text-right font-semibold text-[var(--bx-ok-fg)]">{formatCurrencyBRL(dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 7, "updated_amount").amount ?? 0)}</td>
                </tr>
                <tr>
                  <td className="!pl-0">Saídas previstas</td>
                  <td className="!pr-0 text-right font-semibold text-[var(--bx-bad-fg)]">{formatCurrencyBRL(dueWithin(ap, "due_date", PAYABLE_OPEN, today, 7, "updated_amount").amount ?? 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
