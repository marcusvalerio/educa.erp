import { z } from "zod";

// Validação server-side dos 8 cadastros. Espelha as regras obrigatórias
// já aplicadas no cliente (src/lib/cadastros/validation.ts) — aqui é a
// fonte de verdade, já que o frontend nunca deve ser a única barreira
// (Fase 2, item 25). Verificações de duplicidade (código/documento/
// placa/login) são responsabilidade das constraints UNIQUE no banco;
// o erro do Postgres é traduzido para uma mensagem amigável em
// src/lib/database/table.ts.

const statusSchema = z.enum(["Ativo", "Inativo"]);
const optionalText = z.string().trim().optional().default("");
const optionalNumber = z.coerce.number().optional().default(0);

// z.string().min(1, msg) só usa `msg` quando o valor chega como string
// vazia — se a chave vier ausente (undefined), o Zod falha antes disso
// no check de tipo e mostra sua mensagem técnica padrão em inglês
// ("Invalid input: expected string..."). O preprocess normaliza
// undefined/null para "" antes da validação, garantindo que a mensagem
// amigável apareça nos dois casos (campo ausente ou campo vazio).
function requiredText(message: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z.string().trim().min(1, message)
  );
}

function requiredEmail(message: string) {
  return z.preprocess(
    (value) => (value === undefined || value === null ? "" : value),
    z.string().trim().min(1, message).pipe(z.string().email(message))
  );
}

export const productSchema = z.object({
  codigo: requiredText("Informe o código do produto."),
  sku: optionalText,
  descricao: requiredText("Informe a descrição do produto."),
  descricaoCurta: optionalText,
  // Legado (texto livre) — preservado por compatibilidade, mas não é
  // mais coletado no formulário atual de Produtos: categoriaId (FK real
  // para product_categories) é a classificação de verdade agora. Ver
  // docs/CATALOGO.md.
  categoria: optionalText,
  subcategoria: optionalText,
  unidade: requiredText("Selecione a unidade de medida."),
  codigoBarras: optionalText,
  ncm: optionalText,
  peso: optionalNumber,
  altura: optionalNumber,
  largura: optionalNumber,
  comprimento: optionalNumber,
  estoqueMinimo: optionalNumber,
  estoqueMaximo: optionalNumber,
  pontoReposicao: optionalNumber,
  localizacaoPadrao: optionalText,
  fornecedorId: optionalText,
  categoriaId: optionalText,
  marcaId: optionalText,
  loteControlado: z.coerce.boolean().optional().default(false),
  validadeControlada: z.coerce.boolean().optional().default(false),
  status: statusSchema.optional().default("Ativo"),
});

export const customerSchema = z.object({
  tipo: z.enum(["Pessoa Física", "Pessoa Jurídica"], "Selecione o tipo de cliente."),
  nome: requiredText("Informe o nome ou razão social."),
  nomeFantasia: optionalText,
  documento: requiredText("Informe o CPF/CNPJ."),
  inscricaoEstadual: optionalText,
  email: z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido.")]).optional().default(""),
  telefone: optionalText,
  celular: optionalText,
  cep: optionalText,
  estado: optionalText,
  cidade: optionalText,
  bairro: optionalText,
  endereco: optionalText,
  numero: optionalText,
  complemento: optionalText,
  limiteCredito: optionalNumber,
  condicaoPagamento: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const supplierSchema = z.object({
  tipo: z.enum(["Pessoa Física", "Pessoa Jurídica"], "Selecione o tipo de fornecedor."),
  razaoSocial: requiredText("Informe a razão social."),
  nomeFantasia: optionalText,
  documento: requiredText("Informe o CNPJ/CPF."),
  inscricaoEstadual: optionalText,
  email: z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido.")]).optional().default(""),
  telefone: optionalText,
  contato: optionalText,
  cep: optionalText,
  estado: optionalText,
  cidade: optionalText,
  bairro: optionalText,
  endereco: optionalText,
  numero: optionalText,
  complemento: optionalText,
  prazoMedioEntrega: optionalNumber,
  condicaoPagamento: optionalText,
  categoriaFornecimento: optionalText,
  observacoes: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const carrierSchema = z.object({
  razaoSocial: requiredText("Informe a razão social."),
  nomeFantasia: optionalText,
  cnpj: requiredText("Informe o CNPJ."),
  inscricaoEstadual: optionalText,
  email: z.union([z.literal(""), z.string().trim().email("Informe um e-mail válido.")]).optional().default(""),
  telefone: optionalText,
  responsavel: optionalText,
  cep: optionalText,
  estado: optionalText,
  cidade: optionalText,
  endereco: optionalText,
  tipoTransporte: optionalText,
  regiaoAtendimento: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const driverSchema = z.object({
  nome: requiredText("Informe o nome do motorista."),
  cpf: requiredText("Informe o CPF."),
  rg: optionalText,
  cnh: requiredText("Informe o número da CNH."),
  categoriaCnh: requiredText("Selecione a categoria da CNH."),
  validadeCnh: optionalText,
  telefone: optionalText,
  transportadoraId: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const vehicleSchema = z.object({
  placa: requiredText("Informe a placa."),
  renavam: optionalText,
  marca: optionalText,
  modelo: requiredText("Informe o modelo."),
  ano: optionalNumber,
  tipo: optionalText,
  capacidadeCarga: optionalNumber,
  pesoMaximo: optionalNumber,
  transportadoraId: optionalText,
  motoristaPrincipalId: optionalText,
  combustivel: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const userSchema = z.object({
  nome: requiredText("Informe o nome do usuário."),
  email: requiredEmail("Informe um e-mail válido."),
  login: requiredText("Informe o login."),
  perfil: requiredText("Selecione o perfil."),
  departamento: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const warehouseLocationSchema = z.object({
  codigoLocal: requiredText("Informe o código do local."),
  descricao: optionalText,
  armazem: requiredText("Informe o armazém."),
  area: optionalText,
  rua: optionalText,
  modulo: optionalText,
  nivel: optionalText,
  posicao: optionalText,
  tipo: requiredText("Selecione o tipo de local."),
  capacidade: optionalNumber,
  status: statusSchema.optional().default("Ativo"),
});

export const categorySchema = z.object({
  codigo: requiredText("Informe o código da categoria."),
  nome: requiredText("Informe o nome da categoria."),
  categoriaPaiId: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const brandSchema = z.object({
  codigo: requiredText("Informe o código da marca."),
  nome: requiredText("Informe o nome da marca."),
  status: statusSchema.optional().default("Ativo"),
});

export const productSupplierSchema = z.object({
  produtoId: requiredText("Informe o produto."),
  fornecedorId: requiredText("Selecione o fornecedor."),
  skuFornecedor: optionalText,
  custo: optionalNumber,
  prazoEntregaDias: optionalNumber,
  preferencial: z.coerce.boolean().optional().default(false),
  status: statusSchema.optional().default("Ativo"),
});

export const productPriceSchema = z.object({
  produtoId: requiredText("Informe o produto."),
  tipoPreco: z.enum(["cost", "sale", "minimum"], "Selecione o tipo de preço."),
  valor: z.coerce.number().min(0, "O valor não pode ser negativo."),
  moeda: z.string().trim().optional().default("BRL"),
  vigenciaInicio: optionalText,
  vigenciaFim: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const productUnitSchema = z.object({
  produtoId: requiredText("Informe o produto."),
  unidadeCodigo: requiredText("Selecione a unidade."),
  fatorConversao: z.coerce.number().gt(0, "O fator de conversão deve ser maior que zero.").optional().default(1),
  codigoBarras: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const schemasByEntity = {
  products: productSchema,
  customers: customerSchema,
  suppliers: supplierSchema,
  carriers: carrierSchema,
  drivers: driverSchema,
  vehicles: vehicleSchema,
  users: userSchema,
  "warehouse-locations": warehouseLocationSchema,
  categories: categorySchema,
  brands: brandSchema,
  "product-suppliers": productSupplierSchema,
  "product-prices": productPriceSchema,
  "product-units": productUnitSchema,
} as const;

export type EntityRoute = keyof typeof schemasByEntity;
