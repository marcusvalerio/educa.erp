import type {
  Produto,
  Cliente,
  Fornecedor,
  Transportadora,
  Motorista,
  Veiculo,
  Usuario,
  LocalEstoque,
} from "./types";

export type FieldErrors = Record<string, string>;

const onlyDigits = (v: string) => (v ?? "").replace(/\D/g, "");

function required(value: unknown, message: string, errors: FieldErrors, key: string) {
  const isEmpty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");
  if (isEmpty) errors[key] = message;
}

function duplicate<T>(
  list: T[],
  currentId: string | undefined,
  predicate: (item: T) => boolean,
  message: string,
  errors: FieldErrors,
  key: string
) {
  const clash = list.some((item) => predicate(item) && (item as { id?: string }).id !== currentId);
  if (clash) errors[key] = message;
}

export function validateProduto(data: Partial<Produto>, list: Produto[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.codigo, "Informe o código do produto.", errors, "codigo");
  required(data.descricao, "Informe a descrição do produto.", errors, "descricao");
  required(data.unidade, "Selecione a unidade de medida.", errors, "unidade");
  required(data.categoria, "Selecione a categoria.", errors, "categoria");
  if (data.codigo) {
    duplicate(list, currentId, (p) => p.codigo === data.codigo, "Já existe um produto com este código.", errors, "codigo");
  }
  if (data.estoqueMinimo !== undefined && data.estoqueMaximo !== undefined && data.estoqueMaximo < data.estoqueMinimo) {
    errors.estoqueMaximo = "O estoque máximo deve ser maior ou igual ao mínimo.";
  }
  return errors;
}

type ParteDoc = { tipo?: string; documento?: string; pais?: string };

// Estrangeiro compara o Tax ID como texto (pode ter letras) e dentro do país.
function sameDoc(a: ParteDoc, b: ParteDoc): boolean {
  if (a.tipo === "Estrangeiro" || b.tipo === "Estrangeiro") {
    const norm = (v?: string) => (v ?? "").replace(/[\s.\-/]/g, "").toUpperCase();
    return a.tipo === b.tipo && (a.pais ?? "") === (b.pais ?? "") && norm(a.documento) === norm(b.documento);
  }
  return onlyDigits(a.documento ?? "") === onlyDigits(b.documento ?? "");
}

function validaPais(data: ParteDoc, errors: FieldErrors) {
  if (data.tipo === "Estrangeiro" && (!data.pais || data.pais === "BR")) {
    errors.pais = "Informe o país do parceiro estrangeiro.";
  }
  if (data.tipo !== "Estrangeiro" && data.pais && data.pais !== "BR") {
    errors.tipo = "Parceiro fora do Brasil deve ser do tipo Estrangeiro.";
  }
}

type ParteEndereco = ParteDoc & { cep?: string; cidade?: string; endereco?: string; estado?: string };

function validaUf(data: ParteEndereco, errors: FieldErrors) {
  if (data.tipo === "Estrangeiro") return;
  const temEndereco = [data.cep, data.cidade, data.endereco].some((v) => (v ?? "").trim() !== "");
  if (temEndereco && !(data.estado ?? "").trim()) errors.estado = "Informe o Estado (UF) do endereço.";
}

export function validateCliente(data: Partial<Cliente>, list: Cliente[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.nome, "Informe o nome ou razão social.", errors, "nome");
  required(data.documento, "Informe o CPF/CNPJ (ou Tax ID, se estrangeiro).", errors, "documento");
  validaPais(data, errors);
  validaUf(data, errors);
  if (data.documento) {
    const digitsLen = onlyDigits(data.documento).length;
    if (data.tipo === "Pessoa Física" && digitsLen !== 11) errors.documento = "CPF deve conter 11 dígitos.";
    if (data.tipo === "Pessoa Jurídica" && digitsLen !== 14) errors.documento = "CNPJ deve conter 14 dígitos.";
    duplicate(list, currentId, (c) => sameDoc(c, data), "Já existe um cliente com este documento.", errors, "documento");
  }
  return errors;
}

export function validateFornecedor(data: Partial<Fornecedor>, list: Fornecedor[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.razaoSocial, "Informe a razão social.", errors, "razaoSocial");
  required(data.documento, "Informe o CNPJ/CPF (ou Tax ID, se estrangeiro).", errors, "documento");
  validaPais(data, errors);
  validaUf(data, errors);
  if (data.documento) {
    const digitsLen = onlyDigits(data.documento).length;
    if (data.tipo === "Pessoa Física" && digitsLen !== 11) errors.documento = "CPF deve conter 11 dígitos.";
    if (data.tipo === "Pessoa Jurídica" && digitsLen !== 14) errors.documento = "CNPJ deve conter 14 dígitos.";
    duplicate(list, currentId, (f) => sameDoc(f, data), "Já existe um fornecedor com este documento.", errors, "documento");
  }
  return errors;
}

export function validateTransportadora(data: Partial<Transportadora>, list: Transportadora[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.razaoSocial, "Informe a razão social.", errors, "razaoSocial");
  required(data.cnpj, "Informe o CNPJ.", errors, "cnpj");
  if (data.cnpj) {
    duplicate(list, currentId, (t) => onlyDigits(t.cnpj) === onlyDigits(data.cnpj!), "Já existe uma transportadora com este CNPJ.", errors, "cnpj");
  }
  return errors;
}

export function validateMotorista(data: Partial<Motorista>, list: Motorista[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.nome, "Informe o nome do motorista.", errors, "nome");
  required(data.cpf, "Informe o CPF.", errors, "cpf");
  required(data.cnh, "Informe o número da CNH.", errors, "cnh");
  required(data.categoriaCnh, "Selecione a categoria da CNH.", errors, "categoriaCnh");
  if (data.cpf) {
    duplicate(list, currentId, (m) => onlyDigits(m.cpf) === onlyDigits(data.cpf!), "Já existe um motorista com este CPF.", errors, "cpf");
  }
  return errors;
}

export function validateVeiculo(data: Partial<Veiculo>, list: Veiculo[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.placa, "Informe a placa.", errors, "placa");
  required(data.modelo, "Informe o modelo.", errors, "modelo");
  if (data.placa) {
    duplicate(list, currentId, (v) => v.placa.toUpperCase() === data.placa!.toUpperCase(), "Já existe um veículo com esta placa.", errors, "placa");
  }
  return errors;
}

export function validateUsuario(data: Partial<Usuario>, list: Usuario[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.nome, "Informe o nome do usuário.", errors, "nome");
  required(data.email, "Informe o e-mail.", errors, "email");
  required(data.login, "Informe o login.", errors, "login");
  required(data.perfil, "Selecione o perfil.", errors, "perfil");
  if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) errors.email = "Informe um e-mail válido.";
  if (data.login) {
    duplicate(list, currentId, (u) => u.login.toLowerCase() === data.login!.toLowerCase(), "Já existe um usuário com este login.", errors, "login");
  }
  if (data.email) {
    duplicate(list, currentId, (u) => u.email.toLowerCase() === data.email!.toLowerCase(), "Já existe um usuário com este e-mail.", errors, "email");
  }
  return errors;
}

export function validateLocalEstoque(data: Partial<LocalEstoque>, list: LocalEstoque[], currentId?: string): FieldErrors {
  const errors: FieldErrors = {};
  required(data.codigoLocal, "Informe o código do local.", errors, "codigoLocal");
  required(data.armazem, "Informe o armazém.", errors, "armazem");
  required(data.tipo, "Selecione o tipo de local.", errors, "tipo");
  if (data.codigoLocal) {
    duplicate(list, currentId, (l) => l.codigoLocal.toUpperCase() === data.codigoLocal!.toUpperCase(), "Já existe um local com este código.", errors, "codigoLocal");
  }
  return errors;
}
