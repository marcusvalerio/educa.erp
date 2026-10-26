"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleAlert, Clock } from "lucide-react";
import { useSession } from "@/components/shell/SessionProvider";
import { useProblems } from "@/components/dashboard/Problems";
import { cachedGet } from "@/lib/dashboard/client";
import { SO_OPEN, rankProblems, type ProblemResult } from "@/lib/dashboard/problems";
import { dueWithin, monthlySeries, stalled, summarySentence, variation } from "@/lib/beta/today";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";

// "O que precisa de você hoje": pendências reais, priorizadas pelo foco do
// usuário (dashboard_focus_areas/rules via fn_user_context), cada uma com o
// próximo passo. Lê as APIs atuais com a sessão do usuário (RLS); fonte
// sem permissão não é nem consultada.

type Row = Record<string, unknown>;

const RECEIVABLE_OPEN = ["OPEN", "PARTIALLY_RECEIVED", "OVERDUE"];
const PAYABLE_OPEN = ["OPEN", "PARTIALLY_PAID", "OVERDUE"];

const NEXT_STEP: Record<string, string> = {
  "sales-late": "Ver entregas atrasadas",
  "sales-approval": "Aprovar pedidos",
  "quotes-expired": "Renovar ou encerrar",
  "payables-overdue": "Pagar ou renegociar",
  "receivables-overdue": "Cobrar clientes",
  "purchase-late": "Cobrar fornecedor",
  "purchase-requests-approval": "Aprovar solicitações",
  "receipts-pending": "Conferir recebimento",
  "shipments-late": "Expedir agora",
  "stock-unavailable": "Repor estoque",
  "material-requests": "Atender requisições",
  "production-late": "Replanejar ordens",
  "fiscal-rejected": "Corrigir e reenviar",
  "nonconformities-open": "Tratar não conformidade",
  "maintenance-late": "Executar manutenção",
  "service-orders-late": "Atender ordens",
  "tasks-blocked": "Destravar tarefas",
  "activities-late": "Retomar atividades",
  "receivables-today": "Acompanhar recebimento",
  "payables-today": "Programar pagamento",
  "quotes-expiring": "Fazer follow-up",
  "sales-stalled": "Destravar pedidos",
};

type Sources = Partial<Record<"ar" | "ap" | "quotes" | "sales", Row[]>>;

function useSources(): { data: Sources; loading: boolean } {
  const { can } = useSession();
  const plan = useMemo(
    () =>
      [
        ["ar", "/api/accounts-receivable", "accounts_receivable.view"],
        ["ap", "/api/accounts-payable", "accounts_payable.view"],
        ["quotes", "/api/sales-quotes", "sales_quotes.view"],
        ["sales", "/api/sales-orders", "sales_orders.view"],
      ].filter(([, , perm]) => can(perm)) as [keyof Sources, string, string][],
    [can]
  );
  const [state, setState] = useState<{ data: Sources; loading: boolean }>({ data: {}, loading: true });
  const key = plan.map((p) => p[0]).join(",");
  useEffect(() => {
    let cancelled = false;
    Promise.all(plan.map(([k, path]) => cachedGet<Row[]>(path).then((rows) => [k, Array.isArray(rows) ? rows : []] as const).catch(() => null))).then((list) => {
      if (cancelled) return;
      const data: Sources = {};
      for (const item of list) if (item) data[item[0]] = item[1];
      setState({ data, loading: false });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const TONE = {
  critical: { chip: "bx-chip-bad", icon: CircleAlert, label: "Crítico" },
  danger: { chip: "bx-chip-bad", icon: CircleAlert, label: "Atrasado" },
  warning: { chip: "bx-chip-warn", icon: Clock, label: "Hoje" },
} as const;

function Kpi({ label, value, hint, delta, href }: { label: string; value: string; hint: string; delta?: number | null; href: string }) {
  return (
    <Link href={href} className="bx-card bx-rise flex flex-col gap-2 p-5 transition-colors hover:border-[var(--bx-havana)]">
      <span className="bx-meta">{label}</span>
      <span className="bx-title bx-num text-[28px] leading-none">{value}</span>
      <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--bx-muted)]">
        {delta !== undefined && delta !== null && (
          <span className={`bx-chip ${delta >= 0 ? "bx-chip-ok" : "bx-chip-bad"}`}>
            {delta >= 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
            {delta >= 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        {hint}
      </span>
    </Link>
  );
}

function SalesBars({ series }: { series: { key: string; label: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <div className="relative">
      <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label={`Vendas por mês: ${series.map((s) => `${s.label} ${formatCurrencyBRL(s.value)}`).join(", ")}`}>
        {series.map((s, i) => (
          <div key={s.key} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
            {hover === i && (
              <div className="bx-card absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-2xl px-3 py-2 text-center whitespace-nowrap shadow-md">
                <p className="bx-meta">{s.label}</p>
                <p className="bx-num text-[13px] font-semibold text-[var(--bx-ink)]">{formatCurrencyBRL(s.value)}</p>
              </div>
            )}
            <div className={`bx-bar ${i === series.length - 1 ? "bx-bar-current" : ""}`} style={{ height: `${Math.max(4, (s.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {series.map((s) => (
          <span key={s.key} className="bx-meta flex-1 text-center">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function TodayDashboard() {
  const { data: session, can } = useSession();
  const problems = useProblems();
  const sources = useSources();
  const [today] = useState(() => new Date());

  const focusModules = useMemo(() => {
    const seen: string[] = [];
    for (const f of session?.focus ?? []) if (f.module_code && !seen.includes(f.module_code)) seen.push(f.module_code);
    return seen;
  }, [session]);

  const todayItems: ProblemResult[] = useMemo(() => {
    const { ar, ap, quotes, sales } = sources.data;
    const items: ProblemResult[] = [];
    const base = { compute: () => ({ count: 0 }), severity: "warning" as const };
    if (ar) items.push({ ...base, id: "receivables-today", module: "financeiro", label: "Títulos a receber vencem hoje", hint: "Confirme o recebimento ou avise o cliente.", permission: "accounts_receivable.view", source: "", href: "/app/financeiro/contas-receber", ...dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 0, "updated_amount") });
    if (ap) items.push({ ...base, id: "payables-today", module: "financeiro", label: "Contas a pagar vencem hoje", hint: "Pague hoje para não gerar juros.", permission: "accounts_payable.view", source: "", href: "/app/financeiro/contas-pagar", ...dueWithin(ap, "due_date", PAYABLE_OPEN, today, 0, "updated_amount") });
    if (quotes) items.push({ ...base, id: "quotes-expiring", module: "comercial", label: "Orçamentos vencem em até 3 dias", hint: "Propostas ainda sem resposta perto do fim da validade.", permission: "sales_quotes.view", source: "", href: "/app/comercial/orcamentos", ...dueWithin(quotes, "valid_until", ["DRAFT", "SENT"], today, 3) });
    if (sales) items.push({ ...base, id: "sales-stalled", module: "comercial", label: "Pedidos de venda parados há 3 dias ou mais", hint: "Sem movimento desde a última alteração.", permission: "sales_orders.view", source: "", href: "/app/comercial/pedidos-venda", ...stalled(sales, SO_OPEN, today, 3) });
    return items;
  }, [sources.data, today]);

  const ranked = useMemo(() => rankProblems([...problems.results, ...todayItems], focusModules), [problems.results, todayItems, focusModules]);
  const loading = problems.loading || sources.loading;

  const count = (id: string) => ranked.find((r) => r.id === id)?.count ?? 0;
  const sentence = summarySentence([
    { count: count("receivables-today") + count("payables-today"), one: "título vence hoje", many: "títulos vencem hoje" },
    { count: count("receivables-overdue") + count("payables-overdue"), one: "título está vencido", many: "títulos estão vencidos" },
    { count: count("sales-stalled") + count("sales-late"), one: "pedido parado ou atrasado", many: "pedidos parados ou atrasados" },
    { count: count("quotes-expiring") + count("quotes-expired"), one: "orçamento a expirar", many: "orçamentos a expirar ou vencidos" },
    { count: count("receipts-pending"), one: "recebimento pendente", many: "recebimentos pendentes" },
  ]);

  const { ar, ap, sales } = sources.data;
  const series = sales ? monthlySeries(sales, "order_date", "total_amount", today, 6, ["cancelled"]) : null;
  const kpis = [
    ar && { label: "A receber · 7 dias", value: formatCurrencyBRL(dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 7, "updated_amount").amount ?? 0), hint: `${formatInteger(dueWithin(ar, "due_date", RECEIVABLE_OPEN, today, 7).count)} título(s)`, href: "/app/financeiro/contas-receber" },
    ap && { label: "A pagar · 7 dias", value: formatCurrencyBRL(dueWithin(ap, "due_date", PAYABLE_OPEN, today, 7, "updated_amount").amount ?? 0), hint: `${formatInteger(dueWithin(ap, "due_date", PAYABLE_OPEN, today, 7).count)} título(s)`, href: "/app/financeiro/contas-pagar" },
    sales && { label: "Pedidos em andamento", value: formatInteger(sales.filter((r) => SO_OPEN.includes(String(r.status))).length), hint: "aprovados, reservados ou em separação", href: "/app/comercial/pedidos-venda" },
    series && { label: "Vendas no mês", value: formatCurrencyBRL(series[series.length - 1].value), hint: "vs. mês anterior", delta: variation(series), href: "/app/comercial/pedidos-venda" },
  ].filter(Boolean) as { label: string; value: string; hint: string; delta?: number | null; href: string }[];

  const firstName = (session?.tenant?.user.name ?? "").split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1 pt-2">
        <p className="bx-meta">{today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</p>
        <h1 className="bx-title text-[26px] sm:text-[32px]">
          {greeting(today)}
          {firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="max-w-2xl text-[15px] text-[var(--bx-muted)]">
          {loading ? "Olhando o que precisa de você hoje…" : sentence ? `${sentence}.` : "Nada pede a sua ação agora. Bom momento para planejar."}
        </p>
      </section>

      {kpis.length > 0 && <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((k) => <Kpi key={k.label} {...k} />)}</section>}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="bx-card overflow-hidden">
          <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="bx-title text-[17px]">O que precisa de você hoje</h2>
              <p className="text-[12.5px] text-[var(--bx-muted)]">Em ordem de prioridade para o seu papel. Toque para resolver.</p>
            </div>
            {!loading && ranked.length > 0 && <span className="bx-chip bx-chip-info bx-num">{ranked.length}</span>}
          </header>
          {loading ? (
            <ul className="flex flex-col gap-2 px-5 pb-5">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-14 animate-pulse rounded-[var(--bx-r-inner)] bg-[var(--bx-line-soft)]" />
              ))}
            </ul>
          ) : problems.checked.length === 0 && todayItems.length === 0 ? (
            <p className="px-5 pb-6 text-[var(--bx-muted)]">O seu perfil não acompanha pendências. Peça ao administrador as permissões dos módulos em que você trabalha.</p>
          ) : ranked.length === 0 ? (
            <div className="flex items-center gap-3 px-5 pb-6">
              <span className="bx-chip bx-chip-ok"><CheckCircle2 size={13} aria-hidden /> Tudo em dia</span>
              <p className="text-[var(--bx-muted)]">Nenhum título vencendo, pedido parado ou orçamento expirando.</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {ranked.slice(0, 10).map((p) => {
                const tone = TONE[p.severity];
                const Icon = tone.icon;
                return (
                  <li key={p.id} className="border-t border-[var(--bx-line-soft)]">
                    <Link href={p.href} className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 hover:bg-[var(--bx-havana-soft)]">
                      <span className={`bx-chip ${tone.chip}`}>
                        <Icon size={12} aria-hidden /> {tone.label}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[var(--bx-ink)]">
                          <span className="bx-num">{formatInteger(p.count)}</span> · {p.label}
                        </span>
                        <span className="block text-[12.5px] text-[var(--bx-muted)]">
                          {p.hint}
                          {p.amount ? ` · ${formatCurrencyBRL(p.amount)}` : ""}
                        </span>
                      </span>
                      <span className="bx-btn bx-btn-secondary bx-btn-sm">
                        {NEXT_STEP[p.id] ?? "Resolver"} <ArrowRight size={13} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && problems.failed.length > 0 && (
            <p className="flex items-center gap-2 border-t border-[var(--bx-line-soft)] px-5 py-3 text-[12px] text-[var(--bx-subtle)]">
              <AlertTriangle size={13} aria-hidden /> {problems.failed.length} verificação(ões) não responderam agora.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {series && can("sales_orders.view") && (
            <div className="bx-card p-5">
              <div className="mb-4 flex items-baseline justify-between gap-2">
                <h2 className="bx-title text-[17px]">Vendas por mês</h2>
                <span className="bx-meta">6 meses</span>
              </div>
              {series.every((s) => s.value === 0) ? (
                <p className="text-[var(--bx-muted)]">Ainda não há pedidos de venda. Eles aparecem aqui assim que forem lançados.</p>
              ) : (
                <SalesBars series={series} />
              )}
            </div>
          )}
          {ar && ap && (
            <div className="bx-card p-5">
              <h2 className="bx-title mb-3 text-[17px]">Próximos 7 dias</h2>
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
        </div>
      </section>
    </div>
  );
}
