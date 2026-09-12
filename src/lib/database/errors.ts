export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function notFoundError(entityLabel: string) {
  return new ApiError("NOT_FOUND", `${entityLabel} não encontrado.`, 404);
}

export function validationError(message: string) {
  return new ApiError("VALIDATION_ERROR", message, 422);
}

export function blockedByDependentsError(message: string) {
  return new ApiError("HAS_DEPENDENTS", message, 409);
}

export function unauthenticatedError() {
  return new ApiError("UNAUTHENTICATED", "Nenhuma sessão ativa. Faça login novamente.", 401);
}

export function forbiddenError() {
  return new ApiError("FORBIDDEN", "Você não tem permissão para executar esta ação.", 403);
}

/**
 * Traduz erros do PostgreSQL/PostgREST em respostas amigáveis. Nunca
 * repassa a mensagem técnica original ao usuário final.
 */
export function translatePostgresError(error: { code?: string; message?: string; details?: string }): ApiError {
  // unique_violation
  if (error.code === "23505") {
    const detail = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (detail.includes("document")) {
      return new ApiError("DUPLICATE_DOCUMENT", "Já existe um registro com este documento (CPF/CNPJ).", 409);
    }
    if (detail.includes("plate")) {
      return new ApiError("DUPLICATE_PLATE", "Já existe um veículo com esta placa.", 409);
    }
    if (detail.includes("email")) {
      return new ApiError("DUPLICATE_EMAIL", "Já existe um usuário com este e-mail.", 409);
    }
    if (detail.includes("login")) {
      return new ApiError("DUPLICATE_LOGIN", "Já existe um usuário com este login.", 409);
    }
    if (detail.includes("sku")) {
      return new ApiError("DUPLICATE_SKU", "Já existe um produto com este SKU.", 409);
    }
    if (detail.includes("barcode")) {
      return new ApiError("DUPLICATE_BARCODE", "Já existe um produto com este código de barras.", 409);
    }
    if (detail.includes("supplier_id") && detail.includes("product_id")) {
      return new ApiError("DUPLICATE_PRODUCT_SUPPLIER", "Este fornecedor já está vinculado a este produto.", 409);
    }
    if (detail.includes("unit_code") && detail.includes("product_id")) {
      return new ApiError("DUPLICATE_PRODUCT_UNIT", "Esta unidade/embalagem já está cadastrada para este produto.", 409);
    }
    if (detail.includes("code")) {
      return new ApiError("DUPLICATE_CODE", "Já existe um registro com este código.", 409);
    }
    return new ApiError("DUPLICATE", "Já existe um registro com estes dados.", 409);
  }

  // exclusion_violation — período de vigência sobreposto em product_prices
  // (constraint no banco, ver supabase/migrations/0009_catalog_foundation.sql).
  if (error.code === "23P01") {
    return new ApiError(
      "OVERLAPPING_PRICE_PERIOD",
      "Já existe um preço deste tipo vigente para este produto no período informado.",
      409
    );
  }

  // foreign_key_violation — rede de segurança do banco além da checagem
  // de dependentes feita antes da exclusão.
  if (error.code === "23503") {
    return new ApiError(
      "HAS_DEPENDENTS",
      "Não é possível excluir: existem registros vinculados a este cadastro. Utilize a inativação.",
      409
    );
  }

  return new ApiError("DATABASE_ERROR", "Não foi possível concluir a operação. Tente novamente.", 500);
}
