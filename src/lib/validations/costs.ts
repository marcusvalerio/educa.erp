import { z } from "zod";

// Validação server-side do domínio de Custos e Formação de Custo
// (supabase/migrations/0043-0044). O cálculo de custo em si (custo
// médio móvel, idempotência por stock_movement_id, concorrência via
// FOR UPDATE) vive inteiramente no banco — nenhuma escrita de custo
// acontece a partir de dados soltos do body além do reprocessamento e
// do custo padrão, que são as únicas operações de custo iniciadas
// diretamente pelo usuário nesta fase.

const uuidField = (message: string) => z.string().trim().uuid(message);

export const reprocessProductCostSchema = z.object({
  productId: uuidField("Selecione o produto."),
  locationId: uuidField("Selecione o local de estoque."),
  lotId: z.string().trim().uuid().optional(),
  reason: z.string().trim().min(1, "Informe o motivo do reprocessamento."),
});

export const setProductStandardCostSchema = z.object({
  productId: uuidField("Selecione o produto."),
  cost: z.coerce.number().min(0, "O custo padrão não pode ser negativo."),
  validFrom: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export const updateProductStandardCostNotesSchema = z.object({
  notes: z.string().trim().optional().default(""),
});
