import { onlyDigits } from "./uf";

// Máscaras usadas na DANFE.
export function formatDocument(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return v ?? "";
}

export const formatCep = (v: string | null | undefined) => onlyDigits(v).replace(/^(\d{5})(\d{3})$/, "$1-$2");

/** 000.000.123 — número da nota com 9 dígitos em blocos. */
export const formatNfeNumber = (n: string | number) => String(n).padStart(9, "0").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");

export function formatBrDecimal(v: string | number | null | undefined, digits = 2): string {
  const n = Number(v ?? 0) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "2026-10-19T14:30:00-03:00" → "19/10/2026" e "14:30:00". */
export function splitBrDateTime(v: string | null | undefined): { date: string; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}))?/.exec(v ?? "");
  return m ? { date: `${m[3]}/${m[2]}/${m[1]}`, time: m[4] ?? "" } : { date: "", time: "" };
}
