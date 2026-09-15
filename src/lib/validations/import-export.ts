import { z } from "zod";

// Validação server-side da infraestrutura de Importação/Exportação
// (Fase 21, supabase/migrations/0063). O upload em si é multipart/
// form-data (arquivo binário) — validado diretamente no handler, não
// aqui; estes schemas cobrem os payloads JSON dos demais passos.

export const setImportMappingSchema = z.object({
  mapping: z.record(z.string(), z.string()).refine((m) => Object.keys(m).length > 0, "Informe ao menos um mapeamento de coluna."),
});

export const cancelImportJobSchema = z.object({
  reason: z.string().trim().optional(),
});
