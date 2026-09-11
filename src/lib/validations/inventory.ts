import { z } from "zod";

// Validação server-side do domínio de Estoque/WMS (supabase/migrations/
// 0008-0012). Dois grupos de schema aqui:
//
//   1. product_serial_numbers — cadastro simples (CRUD direto via
//      src/app/api/product-serial-numbers), mas com vocabulário de
//      status próprio (ciclo de vida do item), por isso não entra em
//      schemasByEntity (que assume "Ativo"/"Inativo" — ver
//      src/lib/validations/cadastros.ts).
//
//   2. Payloads de entrada das rotas de estoque transacional
//      (stock-transfers, stock-reservations, stock-adjustments,
//      stock-counts, stock-balances/movements) — validam o corpo da
//      requisição ANTES de chamar a função RPC correspondente no
//      Postgres. A validação real de negócio (saldo suficiente, reserva
//      não excede saldo, transições de status) vive no banco
//      (public.fn_post_stock_movement e as funções que a chamam) — esta
//      camada só garante forma e tipos corretos antes de gastar uma
//      chamada ao banco.

const uuidField = (message: string) => z.string().trim().uuid(message);
const optionalUuid = z.string().trim().uuid().optional().or(z.literal("")).transform((v) => (v === "" ? undefined : v));
const positiveQuantity = z.coerce.number().positive("A quantidade deve ser maior que zero.");
const optionalNonNegativeCost = z.coerce.number().min(0, "O custo não pode ser negativo.").optional();

export const productSerialNumberSchema = z.object({
  produtoId: uuidField("Selecione o produto."),
  numeroSerie: z.string().trim().min(1, "Informe o número de série."),
  status: z.enum(["in_stock", "reserved", "shipped", "returned", "scrapped"]).optional().default("in_stock"),
  localAtualId: optionalUuid,
  observacoes: z.string().trim().optional().default(""),
});

// ---------------------------------------------------- Movimentos diretos
export const receiveStockSchema = z.object({
  productId: uuidField("Selecione o produto."),
  locationId: uuidField("Selecione o local."),
  quantity: positiveQuantity,
  lotId: optionalUuid,
  unitCost: optionalNonNegativeCost,
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

export const issueStockSchema = z.object({
  productId: uuidField("Selecione o produto."),
  locationId: uuidField("Selecione o local."),
  quantity: positiveQuantity,
  lotId: optionalUuid,
  notes: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

// -------------------------------------------------------- Transferências
const transferItemSchema = z.object({
  productId: uuidField("Selecione o produto do item."),
  lotId: optionalUuid,
  quantity: positiveQuantity,
});

export const createTransferSchema = z.object({
  fromLocationId: uuidField("Selecione o local de origem."),
  toLocationId: uuidField("Selecione o local de destino."),
  notes: z.string().trim().optional(),
  items: z.array(transferItemSchema).min(1, "A transferência precisa de ao menos um item."),
});

export const idempotencyActionSchema = z.object({
  idempotencyKey: z.string().trim().min(1).optional(),
});

// ------------------------------------------------------------ Reservas
const reservationItemSchema = z.object({
  productId: uuidField("Selecione o produto do item."),
  lotId: optionalUuid,
  quantity: positiveQuantity,
});

export const createReservationSchema = z.object({
  locationId: uuidField("Selecione o local."),
  notes: z.string().trim().optional(),
  referenceType: z.string().trim().optional(),
  referenceId: optionalUuid,
  items: z.array(reservationItemSchema).min(1, "A reserva precisa de ao menos um item."),
});

// ------------------------------------------------------------- Ajustes
const adjustmentItemSchema = z.object({
  productId: uuidField("Selecione o produto do item."),
  lotId: optionalUuid,
  quantityDelta: z.coerce.number().refine((v) => v !== 0, "A quantidade do ajuste não pode ser zero."),
  unitCost: optionalNonNegativeCost,
});

export const createAdjustmentSchema = z.object({
  locationId: uuidField("Selecione o local."),
  reasonCode: z.string().trim().min(1, "Informe o motivo do ajuste."),
  notes: z.string().trim().optional(),
  items: z.array(adjustmentItemSchema).min(1, "O ajuste precisa de ao menos um item."),
});

// ----------------------------------------------------------- Contagens
// ------------------------------------------------- Requisições de material
// Almoxarifado Operacional -> Produção (ou qualquer local -> local).
// Ver docs/INVENTORY.md — reaproveita a mesma infraestrutura de
// transferências/movimentações, só com vocabulário e permissões
// próprias (stock.request para criar/cancelar, stock.transfer —
// reaproveitada — para entregar).
const materialRequestItemSchema = z.object({
  productId: uuidField("Selecione o produto do item."),
  lotId: optionalUuid,
  quantity: positiveQuantity,
});

export const createMaterialRequestSchema = z.object({
  fromLocationId: uuidField("Selecione o local de origem (ex.: Almoxarifado Operacional)."),
  toLocationId: uuidField("Selecione o local de destino (ex.: Produção)."),
  notes: z.string().trim().optional(),
  referenceType: z.string().trim().optional(),
  referenceId: optionalUuid,
  items: z.array(materialRequestItemSchema).min(1, "A requisição precisa de ao menos um item."),
});

export const startCountSchema = z.object({
  warehouseId: uuidField("Selecione o depósito."),
  notes: z.string().trim().optional(),
});

export const submitCountItemSchema = z.object({
  countedQuantity: z.coerce.number().min(0, "A quantidade contada não pode ser negativa."),
});
