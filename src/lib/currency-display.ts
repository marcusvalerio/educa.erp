// Exibição de moeda estrangeira em pedidos e títulos (migration 0130):
// os valores gravados seguem em BRL; o valor na moeda original é valor / taxa.

export type CurrencyInfoItem = { label: string; value: string; mono?: boolean };

export function isForeignCurrency(code: string | null | undefined): boolean {
  return !!code && code.toUpperCase() !== "BRL";
}

export function formatForeignAmount(code: string, amountBRL: number | string | null | undefined, rate: number | string | null | undefined): string {
  const r = Number(rate);
  const v = Number(amountBRL ?? 0);
  if (!(r > 0)) return "—";
  const original = v / r;
  try {
    return original.toLocaleString("pt-BR", { style: "currency", currency: code.toUpperCase() });
  } catch {
    return `${code.toUpperCase()} ${original.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** Itens de detalhe (moeda, câmbio, valor na moeda); vazio quando a moeda é BRL. */
export function foreignCurrencyItems(
  code: string | null | undefined,
  rate: number | string | null | undefined,
  amountBRL: number | string | null | undefined,
  amountLabel = "Valor na moeda original"
): CurrencyInfoItem[] {
  if (!isForeignCurrency(code)) return [];
  const c = String(code).toUpperCase();
  return [
    { label: "Moeda", value: c, mono: true },
    { label: "Câmbio", value: `R$ ${Number(rate ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 6 })} por 1 ${c}`, mono: true },
    { label: amountLabel, value: formatForeignAmount(c, amountBRL, rate), mono: true },
  ];
}
