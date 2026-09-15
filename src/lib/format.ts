// Formatação compartilhada de número/moeda/percentual (Fase 19 —
// Design System: nenhuma tela deveria reimplementar Intl.NumberFormat
// com opções divergentes).

const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integerFormatter = new Intl.NumberFormat("pt-BR");

export function formatCurrencyBRL(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  // Intl.NumberFormat("pt-BR", {style:"currency"}) usa um espaço fino
  // (U+00A0) entre "R$" e o valor — normalizado para espaço comum para
  // nunca quebrar comparações/cópia de texto na UI.
  return currencyFormatter.format(value).replace(/ /g, " ");
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return integerFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { timeZone: value.length <= 10 ? "UTC" : undefined });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

// Variação percentual entre dois valores (usada para a tendência real
// dos KPI cards — nunca um número fictício, ver src/app/gestao/dashboard).
// Retorna null quando o período anterior é zero (variação indefinida).
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
