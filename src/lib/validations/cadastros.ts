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

export const productSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do produto."),
  sku: optionalText,
  descricao: z.string().trim().min(1, "Informe a descrição do produto."),
  descricaoCurta: optionalText,
  categoria: z.string().trim().min(1, "Selecione a categoria."),
  subcategoria: optionalText,
  unidade: z.string().trim().min(1, "Selecione a unidade de medida."),
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
  loteControlado: z.coerce.boolean().optional().default(false),
  validadeControlada: z.coerce.boolean().optional().default(false),
  categoriaId: optionalText,
  marcaId: optionalText,
  unidadeId: optionalText,
  precoCusto: optionalNumber,
  precoVenda: optionalNumber,
  precoMinimo: optionalNumber,
  status: statusSchema.optional().default("Ativo"),
});

export const customerSchema = z.object({
  tipo: z.enum(["Pessoa Física", "Pessoa Jurídica"]),
  nome: z.string().trim().min(1, "Informe o nome ou razão social."),
  nomeFantasia: optionalText,
  documento: z.string().trim().min(1, "Informe o CPF/CNPJ."),
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
  tipo: z.enum(["Pessoa Física", "Pessoa Jurídica"]),
  razaoSocial: z.string().trim().min(1, "Informe a razão social."),
  nomeFantasia: optionalText,
  documento: z.string().trim().min(1, "Informe o CNPJ/CPF."),
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
  razaoSocial: z.string().trim().min(1, "Informe a razão social."),
  nomeFantasia: optionalText,
  cnpj: z.string().trim().min(1, "Informe o CNPJ."),
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
  nome: z.string().trim().min(1, "Informe o nome do motorista."),
  cpf: z.string().trim().min(1, "Informe o CPF."),
  rg: optionalText,
  cnh: z.string().trim().min(1, "Informe o número da CNH."),
  categoriaCnh: z.string().trim().min(1, "Selecione a categoria da CNH."),
  validadeCnh: optionalText,
  telefone: optionalText,
  transportadoraId: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const vehicleSchema = z.object({
  placa: z.string().trim().min(1, "Informe a placa."),
  renavam: optionalText,
  marca: optionalText,
  modelo: z.string().trim().min(1, "Informe o modelo."),
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
  nome: z.string().trim().min(1, "Informe o nome do usuário."),
  email: z.string().trim().email("Informe um e-mail válido."),
  login: z.string().trim().min(1, "Informe o login."),
  perfil: z.string().trim().min(1, "Selecione o perfil."),
  departamento: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const warehouseLocationSchema = z.object({
  codigoLocal: z.string().trim().min(1, "Informe o código do local."),
  descricao: optionalText,
  armazem: z.string().trim().min(1, "Informe o armazém."),
  area: optionalText,
  rua: optionalText,
  modulo: optionalText,
  nivel: optionalText,
  posicao: optionalText,
  tipo: z.string().trim().min(1, "Selecione o tipo de local."),
  capacidade: optionalNumber,
  status: statusSchema.optional().default("Ativo"),
});

export const productCategorySchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da categoria."),
  categoriaPaiId: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const productBrandSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da marca."),
  status: statusSchema.optional().default("Ativo"),
});

export const unitSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código da unidade."),
  nome: z.string().trim().min(1, "Informe o nome da unidade."),
  fracionavel: z.coerce.boolean().optional().default(true),
  status: statusSchema.optional().default("Ativo"),
});

export const unitConversionSchema = z.object({
  unidadeOrigemId: z.string().trim().min(1, "Selecione a unidade de origem."),
  unidadeDestinoId: z.string().trim().min(1, "Selecione a unidade de destino."),
  fator: z.coerce.number().positive("O fator de conversão deve ser maior que zero."),
  status: statusSchema.optional().default("Ativo"),
});

export const productSupplierSchema = z.object({
  produtoId: z.string().trim().min(1, "Selecione o produto."),
  fornecedorId: z.string().trim().min(1, "Selecione o fornecedor."),
  skuFornecedor: optionalText,
  custo: optionalNumber,
  prazoEntregaDias: optionalNumber,
  preferencial: z.coerce.boolean().optional().default(false),
  status: statusSchema.optional().default("Ativo"),
});

export const warehouseSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código do depósito."),
  nome: z.string().trim().min(1, "Informe o nome do depósito."),
  tipo: z.enum(["Padrão", "Virtual"]).optional().default("Padrão"),
  endereco: optionalText,
  cidade: optionalText,
  estado: optionalText,
  cep: optionalText,
  status: statusSchema.optional().default("Ativo"),
});

export const productLotSchema = z.object({
  produtoId: z.string().trim().min(1, "Selecione o produto."),
  numeroLote: z.string().trim().min(1, "Informe o número do lote."),
  dataFabricacao: optionalText,
  dataValidade: optionalText,
  fornecedorId: optionalText,
  observacoes: optionalText,
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
  "product-categories": productCategorySchema,
  "product-brands": productBrandSchema,
  units: unitSchema,
  "unit-conversions": unitConversionSchema,
  "product-suppliers": productSupplierSchema,
  warehouses: warehouseSchema,
  "product-lots": productLotSchema,
} as const;

export type EntityRoute = keyof typeof schemasByEntity;
