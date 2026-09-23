// Períodos do dashboard (lógica pura, testada em tests/dashboard.test.ts).
// Sempre comparados com o intervalo imediatamente anterior de MESMA
// duração — a variação exibida é calculada, nunca inventada.

export type PeriodKey = "mes" | "mes-anterior" | "30d" | "90d";

export type DateRange = { start: string; end: string };

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  mes: "Este mês",
  "mes-anterior": "Mês anterior",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
};

export function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIso(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const DAY = 86_400_000;

export function periodRange(key: PeriodKey, today = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  switch (key) {
    case "mes":
      return { start: toIso(new Date(t.getFullYear(), t.getMonth(), 1)), end: toIso(t) };
    case "mes-anterior": {
      const first = new Date(t.getFullYear(), t.getMonth() - 1, 1);
      const last = new Date(t.getFullYear(), t.getMonth(), 0);
      return { start: toIso(first), end: toIso(last) };
    }
    case "30d":
      return { start: toIso(new Date(t.getTime() - 29 * DAY)), end: toIso(t) };
    case "90d":
      return { start: toIso(new Date(t.getTime() - 89 * DAY)), end: toIso(t) };
  }
}

/** Intervalo imediatamente anterior, com o mesmo número de dias. */
export function previousRange(range: DateRange): DateRange {
  const start = parseIso(range.start);
  const end = parseIso(range.end);
  const days = Math.round((end.getTime() - start.getTime()) / DAY) + 1;
  const prevEnd = new Date(start.getTime() - DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * DAY);
  return { start: toIso(prevStart), end: toIso(prevEnd) };
}

export function inRange(value: string | null | undefined, range: DateRange): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= range.start && day <= range.end;
}

/** Últimos N meses (o atual até hoje), do mais antigo ao mais recente. */
export function lastMonths(count: number, today = new Date()): Array<DateRange & { label: string }> {
  const out: Array<DateRange & { label: string }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const first = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const last = i === 0 ? new Date(today.getFullYear(), today.getMonth(), today.getDate()) : new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    out.push({
      start: toIso(first),
      end: toIso(last),
      label: first.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
    });
  }
  return out;
}

export function formatRange(range: DateRange): string {
  const f = (v: string) => parseIso(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  return `${f(range.start)} – ${f(range.end)}`;
}
