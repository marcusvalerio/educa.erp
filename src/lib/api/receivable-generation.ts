// Resposta de fn_generate_receivable_for_sales_order (migration 0081):
// { created: boolean, receivable: <linha de accounts_receivable>, sales_order_code }.
// Separado do handler para ser testável sem o servidor.

export type GeneratedReceivable = { id: string; code: string; status: string; [key: string]: unknown };
export type ReceivableGenerationResult = { created: boolean; receivable: GeneratedReceivable | null; salesOrderCode: string | null };

export function receivableGenerationResult(data: unknown): ReceivableGenerationResult {
  const raw = typeof data === "string" ? safeJson(data) : data;
  const value = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  // Algumas camadas de RPC embrulham o retorno no nome da função.
  const obj = value && typeof value === "object" && "fn_generate_receivable_for_sales_order" in value
    ? (value.fn_generate_receivable_for_sales_order as Record<string, unknown>)
    : value;
  const receivable = obj?.receivable && typeof obj.receivable === "object" ? (obj.receivable as GeneratedReceivable) : null;
  return {
    created: obj?.created === true,
    receivable: receivable && typeof receivable.id === "string" ? receivable : null,
    salesOrderCode: typeof obj?.sales_order_code === "string" ? obj.sales_order_code : null,
  };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
