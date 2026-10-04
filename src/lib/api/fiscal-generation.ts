// Resposta de fn_generate_fiscal_document_for_sales_order (migration 0087):
// { created: boolean, document: <linha de fiscal_documents>, sales_order_code }.
// Separado do handler para ser testável sem o servidor (R2-19).

export type GeneratedFiscalDocument = { id: string; code: string; status: string; [key: string]: unknown };
export type FiscalGenerationResult = { created: boolean; document: GeneratedFiscalDocument | null; salesOrderCode: string | null };

export function fiscalGenerationResult(data: unknown): FiscalGenerationResult {
  const raw = typeof data === "string" ? safeJson(data) : data;
  const value = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null | undefined;
  const obj = value && typeof value === "object" && "fn_generate_fiscal_document_for_sales_order" in value
    ? (value.fn_generate_fiscal_document_for_sales_order as Record<string, unknown>)
    : value;
  const document = obj?.document && typeof obj.document === "object" ? (obj.document as GeneratedFiscalDocument) : null;
  return {
    created: obj?.created === true,
    document: document && typeof document.id === "string" ? document : null,
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
