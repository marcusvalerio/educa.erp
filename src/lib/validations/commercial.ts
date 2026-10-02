import { z } from "zod";

// Validação server-side do domínio Comercial (supabase/migrations/
// 0019-0021) para as entidades com handlers dedicados — payment_terms
// (validação atômica multi-linha, ver fn_create_payment_term) e o
// workflow transacional de sales_quotes/sales_orders (mesmo espírito
// de src/lib/validations/purchasing.ts). sales_representatives/
// price_lists/price_list_items usam schemasByEntity em
// src/lib/validations/cadastros.ts — são CRUD simples via o
// repositório genérico.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveQuantity = z.coerce.number().positive("A quantidade deve ser maior que zero.");
const nonNegativeNumber = z.coerce.number().min(0, "Não pode ser negativo.").optional();
const optionalDateString = z.string().trim().optional();

// ------------------------------------------------- Condições de pagamento
const paymentTermInstallmentSchema = z.object({
  daysAfter: z.coerce.number().int().min(0).optional().default(0),
  percentage: z.coerce.number().positive("O percentual da parcela deve ser maior que zero.").max(100),
});

export const createPaymentTermSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Informe o nome da condição de pagamento."),
  installments: z.array(paymentTermInstallmentSchema).min(1, "Informe ao menos uma parcela."),
  notes: z.string().trim().optional(),
});

export const updatePaymentTermSchema = z.object({
  name: z.string().trim().min(1).optional(),
  installments: z.array(paymentTermInstallmentSchema).optional(),
  notes: z.string().trim().optional(),
  status: z.enum(["Ativo", "Inativo"]).optional(),
});

// ------------------------------------------------------------ Orçamento
// Desconto não pode passar do valor bruto do item (quantidade × preço):
// sem isso o pedido era gravado e aprovado com total negativo.
const ITEM_DISCOUNT_MESSAGE = "O desconto do item não pode ser maior que o valor do item (quantidade × preço unitário).";
const itemDiscountWithinValue = (item: { quantity: number; unitPrice: number; discount?: number }) =>
  (item.discount ?? 0) <= item.quantity * item.unitPrice + 0.000001;

// Desconto do cabeçalho: no máximo o total dos itens + frete (total ≥ 0).
const HEADER_DISCOUNT_MESSAGE = "O desconto do pedido não pode ser maior que o total dos itens mais o frete.";
const headerDiscountWithinTotal = (data: { discount?: number; freightCost?: number; items?: Array<{ quantity: number; unitPrice: number; discount?: number }> }) => {
  if (!data.items?.length || !data.discount) return true;
  const items = data.items.reduce((sum, i) => sum + i.quantity * i.unitPrice - (i.discount ?? 0), 0);
  return data.discount <= items + (data.freightCost ?? 0) + 0.000001;
};

const salesQuoteItemSchema = z.object({
  productId: optionalUuid,
  description: z.string().trim().min(1, "Descreva o item."),
  unit: z.string().trim().optional(),
  quantity: positiveQuantity,
  unitPrice: z.coerce.number().min(0, "O preço unitário não pode ser negativo."),
  discount: nonNegativeNumber,
  notes: z.string().trim().optional(),
}).refine(itemDiscountWithinValue, { message: ITEM_DISCOUNT_MESSAGE, path: ["discount"] });

export const createSalesQuoteSchema = z.object({
  customerId: uuidField("Selecione o cliente."),
  salesRepresentativeId: optionalUuid,
  priceListId: optionalUuid,
  paymentTermsId: optionalUuid,
  validUntil: optionalDateString,
  discount: nonNegativeNumber,
  freightCost: nonNegativeNumber,
  notes: z.string().trim().optional(),
  items: z.array(salesQuoteItemSchema).min(1, "O orçamento precisa de ao menos um item."),
}).refine(headerDiscountWithinTotal, { message: HEADER_DISCOUNT_MESSAGE, path: ["discount"] });

export const rejectSalesQuoteSchema = z.object({
  reason: z.string().trim().optional(),
});

// --------------------------------------------------------- Pedido de venda
const salesOrderItemSchema = z.object({
  productId: optionalUuid,
  description: z.string().trim().min(1, "Descreva o item."),
  unit: z.string().trim().optional(),
  quantity: positiveQuantity,
  unitPrice: z.coerce.number().min(0, "O preço unitário não pode ser negativo."),
  discount: nonNegativeNumber,
  notes: z.string().trim().optional(),
}).refine(itemDiscountWithinValue, { message: ITEM_DISCOUNT_MESSAGE, path: ["discount"] });

export const createSalesOrderSchema = z.object({
  customerId: uuidField("Selecione o cliente."),
  salesQuoteId: optionalUuid,
  salesRepresentativeId: optionalUuid,
  priceListId: optionalUuid,
  paymentTermsId: optionalUuid,
  discount: nonNegativeNumber,
  freightCost: nonNegativeNumber,
  expectedDeliveryAt: optionalDateString,
  // Se omitidos, o pedido fotografa o endereço atual do cliente.
  deliveryZipCode: z.string().trim().optional(),
  deliveryState: z.string().trim().optional(),
  deliveryCity: z.string().trim().optional(),
  deliveryNeighborhood: z.string().trim().optional(),
  deliveryAddress: z.string().trim().optional(),
  deliveryAddressNumber: z.string().trim().optional(),
  deliveryAddressComplement: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  // Opcional — quando ausente e salesQuoteId presente, os itens são
  // copiados do orçamento aprovado (conversão orçamento -> pedido).
  items: z.array(salesOrderItemSchema).optional(),
}).refine(headerDiscountWithinTotal, { message: HEADER_DISCOUNT_MESSAGE, path: ["discount"] });

export const reserveSalesOrderStockSchema = z.object({
  locationId: uuidField("Selecione o local de onde reservar."),
});
