import type { EntityRoute } from "@/lib/database/repositories";
import { schemasByEntity } from "@/lib/validations/cadastros";

// Registro de entidades importáveis (Fase 21, seção 21.9: "implementar
// inicialmente produtos/clientes/fornecedores/categorias/marcas/
// unidades... preparar arquitetura para os demais, não tentar
// implementar todas de uma vez"). Reaproveita DIRETAMENTE schemasByEntity
// (src/lib/validations/cadastros.ts) — a MESMA validação que o CRUD
// manual de Cadastros usa (src/lib/api/handlers.ts) — nunca uma cópia
// paralela de regras.
//
// Este módulo é deliberadamente PURO (sem "server-only", sem tocar
// tablesByEntity/banco) para poder ser testado diretamente por
// tests/import-export-validations.test.ts, mesmo padrão dos demais
// src/lib/validations/*.ts. A persistência (que toca o banco) fica em
// src/lib/import-export/persist.ts.
//
// naturalKeyColumn é a coluna do BANCO (não o campo da entidade
// camelCase) usada para idempotência (seção 21.7): antes de criar,
// procura um registro existente com o mesmo valor nessa coluna para a
// empresa — se existir, atualiza em vez de duplicar.
//
// Entidades NÃO cobertas aqui (conversões de unidade, preços, estoque
// inicial, pedidos/compras) ficam documentadas como PREPARADO em
// docs/IMPORT_EXPORT.md — o motor genérico (import_jobs/rows/errors)
// já as suporta estruturalmente; só falta registrar o conector.
export type ImportableEntity = Extract<
  EntityRoute,
  "products" | "customers" | "suppliers" | "product-categories" | "product-brands" | "units"
>;

export type ImportEntityConfig = {
  entityType: ImportableEntity;
  label: string;
  module: string;
  naturalKeyColumn: string;
  naturalKeyField: string; // campo (camelCase) correspondente no schema Zod
  requiredFields: string[];
};

export const IMPORT_ENTITIES: Record<ImportableEntity, ImportEntityConfig> = {
  products: { entityType: "products", label: "Produtos", module: "cadastros", naturalKeyColumn: "code", naturalKeyField: "codigo", requiredFields: ["codigo", "descricao", "categoria", "unidade"] },
  customers: { entityType: "customers", label: "Clientes", module: "cadastros", naturalKeyColumn: "document", naturalKeyField: "documento", requiredFields: ["tipo", "nome", "documento"] },
  suppliers: { entityType: "suppliers", label: "Fornecedores", module: "cadastros", naturalKeyColumn: "document", naturalKeyField: "documento", requiredFields: ["tipo", "razaoSocial", "documento"] },
  "product-categories": { entityType: "product-categories", label: "Categorias de produto", module: "cadastros", naturalKeyColumn: "name", naturalKeyField: "nome", requiredFields: ["nome"] },
  "product-brands": { entityType: "product-brands", label: "Marcas de produto", module: "cadastros", naturalKeyColumn: "name", naturalKeyField: "nome", requiredFields: ["nome"] },
  units: { entityType: "units", label: "Unidades de medida", module: "cadastros", naturalKeyColumn: "code", naturalKeyField: "codigo", requiredFields: ["codigo", "nome"] },
};

export function isImportableEntity(entityType: string): entityType is ImportableEntity {
  return entityType in IMPORT_ENTITIES;
}

export type RowValidationResult =
  | { success: true; data: Record<string, unknown>; naturalKey: string }
  | { success: false; errors: { field?: string; message: string }[] };

// Só valida FORMA/TIPOS (mesmo Zod schema do cadastro manual) — nunca
// toca o banco. Usada tanto por VALIDATING (seção 21.5) quanto de novo,
// de forma determinística, por PROCESSING (evita uma coluna extra só
// para persistir o resultado intermediário).
export function validateImportRow(entityType: ImportableEntity, mapped: Record<string, string>): RowValidationResult {
  const config = IMPORT_ENTITIES[entityType];
  const schema = schemasByEntity[entityType];
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapped)) {
    if (value !== undefined && value !== null && value !== "") cleaned[key] = value;
  }

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || undefined, message: issue.message })),
    };
  }

  const naturalKey = String((parsed.data as Record<string, unknown>)[config.naturalKeyField] ?? "").trim();
  if (!naturalKey) {
    return { success: false, errors: [{ field: config.naturalKeyField, message: `Campo obrigatório ausente: ${config.naturalKeyField}.` }] };
  }

  return { success: true, data: parsed.data as Record<string, unknown>, naturalKey };
}
