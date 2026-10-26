// "O que precisa de você hoje" (Beta): regras puras sobre as linhas que as
// APIs atuais já devolvem para o usuário logado. Nada é estimado.

type Row = Record<string, unknown>;

const day = (value: unknown): string | null => {
  if (typeof value !== "string" || value.length < 10) return null;
  return value.slice(0, 10);
};

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const open = (row: Row, statuses: string[]) => statuses.includes(String(row.status ?? "").toUpperCase());

/** Linhas em aberto com data entre hoje e hoje + `days` (0 = só hoje). */
export function dueWithin(rows: Row[], dateKey: string, statuses: string[], today: Date, days = 0, amountKey?: string) {
  const from = isoDay(today);
  const to = isoDay(addDays(today, days));
  const up = statuses.map((s) => s.toUpperCase());
  const hits = rows.filter((r) => {
    const d = day(r[dateKey]);
    return d !== null && d >= from && d <= to && open(r, up);
  });
  return { count: hits.length, amount: amountKey ? hits.reduce((acc, r) => acc + (Number(r[amountKey]) || 0), 0) : undefined };
}

/** Pedidos sem mudança há `days` dias ou mais, ainda em andamento. */
export function stalled(rows: Row[], statuses: string[], today: Date, days = 3) {
  const limit = addDays(today, -days).getTime();
  const up = statuses.map((s) => s.toUpperCase());
  return {
    count: rows.filter((r) => {
      const t = Date.parse(String(r.updated_at ?? r.created_at ?? ""));
      return open(r, up) && Number.isFinite(t) && t <= limit;
    }).length,
  };
}

/** Soma por mês (últimos `months`, o atual por último). */
export function monthlySeries(rows: Row[], dateKey: string, valueKey: string, today: Date, months = 6, exclude: string[] = []) {
  const out: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), value: 0 });
  }
  const ex = exclude.map((s) => s.toUpperCase());
  for (const r of rows) {
    if (ex.includes(String(r.status ?? "").toUpperCase())) continue;
    const d = day(r[dateKey]);
    const slot = d && out.find((o) => o.key === d.slice(0, 7));
    if (slot) slot.value += Number(r[valueKey]) || 0;
  }
  return out;
}

/** Variação percentual do último ponto sobre o anterior (null sem base). */
export function variation(series: { value: number }[]): number | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2].value;
  const cur = series[series.length - 1].value;
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export type SummaryPart = { count: number; one: string; many: string };

/** "3 títulos vencem hoje · 2 pedidos parados". Vazio quando nada pede ação. */
export function summarySentence(parts: SummaryPart[]): string {
  const live = parts.filter((p) => p.count > 0);
  if (live.length === 0) return "";
  return live.map((p) => plural(p.count, p.one, p.many)).join(" · ");
}
