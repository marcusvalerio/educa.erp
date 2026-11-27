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

/** Taxa de câmbio com 2 a 4 casas: 5,4 → "5,40"; 5,12345 → "5,1235". */
export function formatExchangeRate(rate: number | string | null | undefined): string {
  return Number(rate ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Valor em BRL seguido do equivalente na moeda estrangeira, quando houver. */
export function foreignAmountHint(code: string | null | undefined, amountBRL: number | string | null | undefined, rate: number | string | null | undefined): string | null {
  if (!isForeignCurrency(code)) return null;
  return formatForeignAmount(String(code), amountBRL, rate);
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
    { label: "Câmbio", value: `R$ ${formatExchangeRate(rate)} por 1 ${c}`, mono: true },
    { label: amountLabel, value: formatForeignAmount(c, amountBRL, rate), mono: true },
  ];
}
