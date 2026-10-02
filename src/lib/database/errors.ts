// Mensagens do Zod em português em todo processo que trata erros de API.
import "@/lib/validations/zod-messages";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Bloqueio otimista: o registro mudou depois que o usuário abriu o formulário.
export function staleRecordError() {
  return new ApiError(
    "STALE_RECORD",
    "Este registro foi alterado por outra pessoa enquanto você editava. Feche o formulário, abra de novo para ver a versão atual e refaça a sua alteração.",
    409
  );
}

// Mesma versão? Compara o texto e, se o formato variar, o instante.
export function sameVersion(current: string | null | undefined, expected: string): boolean {
  if (!current) return false;
  if (current === expected) return true;
  const a = Date.parse(current);
  const b = Date.parse(expected);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
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
    // Classifica pelas COLUNAS da chave ("Key (company_id, document)=…"),
    // não pelo nome da restrição: "fiscal_documents_source_unique" contém
    // "document" e virava "CPF/CNPJ duplicado". Sem o detalhe, usa a mensagem.
    const keyColumns = /key \(([^)]*)\)/i.exec(error.details ?? "")?.[1];
    const detail = (keyColumns ?? `${error.message ?? ""} ${error.details ?? ""}`).toLowerCase();
    if (/\bsource_id\b/.test(detail)) {
      return new ApiError("DUPLICATE_SOURCE", "Este documento já foi gerado a partir desta origem. Atualize a tela para ver o documento existente.", 409);
    }
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

  // Valores que o banco recusou por formato/faixa. Antes viravam HTTP 500
  // ("Não foi possível concluir a operação") sem dizer o que corrigir.
  if (error.code === "22P02") {
    if (/uuid/i.test(error.message ?? "")) return new ApiError("NOT_FOUND", "Registro não encontrado. Confira o endereço ou o código informado.", 404);
    return new ApiError("VALIDATION_ERROR", "Um dos valores informados está em formato inválido. Revise os dados.", 422);
  }
  if (error.code === "22003") {
    return new ApiError("VALIDATION_ERROR", "Um dos valores passa do limite permitido. Revise quantidades e valores.", 422);
  }
  if (error.code === "22007" || error.code === "22008") {
    return new ApiError("VALIDATION_ERROR", "Data inválida. Confira dia, mês e ano.", 422);
  }
  if (error.code === "23514") {
    const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (/from_location|to_location|stock_transfers_check/.test(text)) return new ApiError("VALIDATION_ERROR", "O local de origem e o de destino precisam ser diferentes.", 422);
    if (/price|cost|amount|discount/.test(text)) return new ApiError("VALIDATION_ERROR", "Valores e preços não podem ser negativos.", 422);
    return new ApiError("VALIDATION_ERROR", "Um dos valores informados não é permitido. Revise os dados e tente novamente.", 422);
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
