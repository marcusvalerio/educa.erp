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

export function unauthorizedError() {
  return new ApiError("UNAUTHORIZED", "Autenticação necessária.", 401);
}

export function forbiddenError(permissionCode: string) {
  return new ApiError("FORBIDDEN", `Você não tem permissão para esta operação (${permissionCode}).`, 403);
}

/**
 * Traduz erros do PostgreSQL/PostgREST em respostas amigáveis. Nunca
 * repassa a mensagem técnica original ao usuário final.
 */
const FK_FIELDS: [RegExp, string][] = [
  [/unit/i, "A unidade de medida"],
  [/categor/i, "A categoria"],
  [/brand/i, "A marca"],
  [/supplier/i, "O fornecedor"],
  [/customer/i, "O cliente"],
  [/location/i, "O local de estoque"],
  [/warehouse/i, "O depósito"],
  [/product/i, "O produto"],
];

const FK_USED_IN: [RegExp, string][] = [
  [/purchase_request_items/, "uma solicitação de compra"],
  [/purchase_quote_items/, "uma cotação de compra"],
  [/purchase_order/, "um pedido de compra"],
  [/purchase_receipt/, "um recebimento"],
  [/sales_quote/, "um orçamento de venda"],
  [/sales_order/, "um pedido de venda"],
  [/pick_list/, "uma separação"],
  [/shipment/, "uma expedição"],
  [/production|product_bom/, "a produção (estrutura ou ordem)"],
  [/fiscal_document/, "uma nota fiscal"],
  [/cost_movements/, "os custos"],
  [/accounts_payable/, "uma conta a pagar"],
  [/accounts_receivable/, "uma conta a receber"],
  [/stock_/, "o estoque"],
];

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
    if (detail.includes("code")) {
      return new ApiError("DUPLICATE_CODE", "Já existe um registro com este código.", 409);
    }
    return new ApiError("DUPLICATE", "Já existe um registro com estes dados.", 409);
  }

  // foreign_key_violation — rede de segurança do banco além da checagem
  // de dependentes feita antes da exclusão.
  if (error.code === "23503") {
    const message = error.message ?? "";
    // Gravação apontando para algo que não existe (ex.: unidade fora do catálogo).
    if (/insert or update on table/i.test(message)) {
      const field = FK_FIELDS.find(([re]) => re.test(message))?.[1];
      return new ApiError(
        "INVALID_REFERENCE",
        field ? `${field} não está cadastrado(a) nesta empresa. Escolha outro ou cadastre antes.` : "Um dos campos aponta para um cadastro que não existe nesta empresa.",
        422
      );
    }
    const where = FK_USED_IN.find(([re]) => re.test(message))?.[1];
    return new ApiError(
      "HAS_DEPENDENTS",
      where
        ? `Não é possível excluir: este cadastro está em ${where}. Remova de lá ou use a inativação.`
        : "Não é possível excluir: existem registros vinculados a este cadastro. Utilize a inativação.",
      409
    );
  }

  return new ApiError("DATABASE_ERROR", "Não foi possível concluir a operação. Tente novamente.", 500);
}
