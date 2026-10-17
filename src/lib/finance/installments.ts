// Parcelamento de título: parcelas iguais em centavos; a última absorve o
// arredondamento, de modo que a soma é sempre exatamente o total.

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function splitInstallments(total: number, count: number, firstDue: string, everyDays: number) {
  const n = Math.max(1, Math.min(60, Math.floor(count) || 1));
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => ({
    dueDate: addDays(firstDue, i * everyDays),
    amount: (i === n - 1 ? cents - base * (n - 1) : base) / 100,
  }));
}
