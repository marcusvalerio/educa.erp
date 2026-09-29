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

  // foreign_key_violation. Na exclusão, é a rede de segurança além da
  // checagem de dependentes; na gravação (insert/update), o registro
  // informado não existe nesta empresa — não é uma exclusão.
  if (error.code === "23503") {
    if (/^insert or update on table/i.test(error.message ?? "")) {
      return new ApiError("RELATED_NOT_FOUND", relatedNotFoundMessage(`${error.message ?? ""} ${error.details ?? ""}`), 422);
    }
    return new ApiError(
      "HAS_DEPENDENTS",
      "Não é possível excluir: existem registros vinculados a este cadastro. Utilize a inativação.",
      409
    );
  }

  // not_null_violation: campo obrigatório que chegou vazio ao banco.
  if (error.code === "23502") {
    return new ApiError("VALIDATION_ERROR", "Preencha os campos obrigatórios antes de salvar.", 422);
  }

  // Regras de negócio das funções e gatilhos do banco (raise exception
  // ... using errcode ...): mensagens escritas para o usuário. Sem isso,
  // "NCM não informado", "Selecione o depósito" etc. viravam HTTP 500.
  // Só passam as mensagens escritas para o usuário (as das funções do banco
  // começam com maiúscula, em português). As do próprio PostgreSQL ("cannot
  // get array length of a scalar", "permission denied for table x") seguem
  // o padrão em minúscula e continuam como erro genérico.
  const message = (error.message ?? "").trim();
  if (/^[A-ZÀ-Ý]/.test(message)) {
    if (error.code === "P0001" || error.code === "22023") return new ApiError("BUSINESS_RULE", message, 422);
    if (error.code === "P0002") return new ApiError("NOT_FOUND", message, 404);
    if (error.code === "42501") return new ApiError("FORBIDDEN", message, 403);
  }

  return new ApiError("DATABASE_ERROR", "Não foi possível concluir a operação. Tente novamente.", 500);
}

// Nome da restrição -> o que não foi encontrado (mais específico primeiro).
const RELATED_LABELS: [RegExp, string][] = [
  [/location/, "O local de estoque informado não existe nesta empresa."],
  [/warehouse/, "O depósito informado não existe nesta empresa."],
  [/product/, "O produto informado não existe nesta empresa."],
  [/customer/, "O cliente informado não existe nesta empresa."],
  [/supplier/, "O fornecedor informado não existe nesta empresa."],
  [/carrier/, "A transportadora informada não existe nesta empresa."],
  [/lot/, "O lote informado não existe nesta empresa."],
];

function relatedNotFoundMessage(text: string) {
  const constraint = /constraint "([^"]+)"/.exec(text)?.[1] ?? text;
  return RELATED_LABELS.find(([re]) => re.test(constraint))?.[1] ?? "Um dos registros informados não existe nesta empresa.";
}
