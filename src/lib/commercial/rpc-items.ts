// Itens de orçamento/pedido no formato que as funções SQL esperam.
//
// As APIs validam os itens em camelCase (Zod), mas fn_create_sales_quote,
// fn_create_sales_order e as conversões do CRM (0055) leem as chaves em
// snake_case do jsonb (product_id, unit_price...). Enviar o objeto validado
// direto faz a função gravar preço nulo e falhar. Comercial e CRM usam este
// mesmo conversor.

export type SalesItemInput = {
  productId?: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  notes?: string;
};

export type SalesItemRpc = {
  product_id: string | null;
  description: string | undefined;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  notes: string | null;
};

export function toRpcSalesItems(items: SalesItemInput[]): SalesItemRpc[] {
  return items.map((item) => ({
    product_id: item.productId ?? null,
    description: item.description,
    unit: item.unit ?? null,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    discount: item.discount ?? 0,
    notes: item.notes ?? null,
  }));
}
