import { z } from "zod";

// Validação server-side do perfil da empresa (Fase 19 — Configurações →
// Empresa). companies já existe desde 0001; esta é a primeira rota que
// expõe leitura/edição do próprio perfil (companies.read/companies.update,
// já semeadas em 0005, nunca usadas por nenhuma rota até agora).
export const updateCompanyProfileSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da empresa.").optional(),
  legalName: z.string().trim().optional(),
  document: z.string().trim().optional(),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
});
