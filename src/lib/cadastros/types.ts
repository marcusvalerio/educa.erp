export type StatusCadastro = "Ativo" | "Inativo";

export type BaseEntity = {
  id: string;
  status: StatusCadastro;
  criadoEm: string;
  atualizadoEm: string;
};

export type TipoPessoa = "Pessoa Física" | "Pessoa Jurídica";

export type Produto = BaseEntity & {
  codigo: string;
  sku: string;
  descricao: string;
  descricaoCurta: string;
  categoria: string;
  subcategoria: string;
  unidade: string;
  codigoBarras: string;
  ncm: string;
  peso: number;
  altura: number;
  largura: number;
  comprimento: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  pontoReposicao: number;
  localizacaoPadrao: string;
  fornecedorId: string;
  categoriaId: string;
  marcaId: string;
  loteControlado: boolean;
  validadeControlada: boolean;
};

export type Cliente = BaseEntity & {
  codigo: string;
  tipo: TipoPessoa;
  nome: string;
  nomeFantasia: string;
  documento: string;
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  celular: string;
  cep: string;
  estado: string;
  cidade: string;
  bairro: string;
  endereco: string;
  numero: string;
  complemento: string;
  limiteCredito: number;
  condicaoPagamento: string;
};

export type Fornecedor = BaseEntity & {
  codigo: string;
  tipo: TipoPessoa;
  razaoSocial: string;
  nomeFantasia: string;
  documento: string;
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  contato: string;
  cep: string;
  estado: string;
  cidade: string;
  bairro: string;
  endereco: string;
  numero: string;
  complemento: string;
  prazoMedioEntrega: number;
  condicaoPagamento: string;
  categoriaFornecimento: string;
  observacoes: string;
};

export type Transportadora = BaseEntity & {
  codigo: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  email: string;
  telefone: string;
  responsavel: string;
  cep: string;
  estado: string;
  cidade: string;
  endereco: string;
  tipoTransporte: string;
  regiaoAtendimento: string;
};

export type Motorista = BaseEntity & {
  codigo: string;
  nome: string;
  cpf: string;
  rg: string;
  cnh: string;
  categoriaCnh: string;
  validadeCnh: string;
  telefone: string;
  transportadoraId: string;
};

export type Veiculo = BaseEntity & {
  codigo: string;
  placa: string;
  renavam: string;
  marca: string;
  modelo: string;
  ano: number;
  tipo: string;
  capacidadeCarga: number;
  pesoMaximo: number;
  transportadoraId: string;
  motoristaPrincipalId: string;
  combustivel: string;
};

export type Usuario = BaseEntity & {
  codigo: string;
  nome: string;
  email: string;
  login: string;
  perfil: string;
  departamento: string;
};

export type LocalEstoque = BaseEntity & {
  codigoLocal: string;
  descricao: string;
  armazem: string;
  area: string;
  rua: string;
  modulo: string;
  nivel: string;
  posicao: string;
  tipo: string;
  capacidade: number;
};

export type Categoria = BaseEntity & {
  codigo: string;
  nome: string;
  categoriaPaiId: string;
};

export type Marca = BaseEntity & {
  codigo: string;
  nome: string;
};

// Sub-recursos de Produto (relacionamentos N:N/1:N com dados próprios) —
// não são cadastros de nível superior, mas usam o mesmo formato de
// entidade (BaseEntity) para reaproveitar createTableRepository/
// createCollectionHandlers sem alterações (ver src/lib/database/table.ts).
export type ProdutoFornecedor = BaseEntity & {
  produtoId: string;
  fornecedorId: string;
  skuFornecedor: string;
  custo: number;
  prazoEntregaDias: number;
  preferencial: boolean;
};

export type TipoPreco = "cost" | "sale" | "minimum";

export type ProdutoPreco = BaseEntity & {
  produtoId: string;
  tipoPreco: TipoPreco;
  valor: number;
  moeda: string;
  vigenciaInicio: string;
  vigenciaFim: string;
};

export type ProdutoEmbalagem = BaseEntity & {
  produtoId: string;
  unidadeCodigo: string;
  fatorConversao: number;
  codigoBarras: string;
};

export type AuditAcao = "Criado" | "Alterado" | "Ativado" | "Inativado" | "Excluído";

export type AuditEntry = {
  id: string;
  data: string;
  usuario: string;
  entidade: string;
  registro: string;
  acao: AuditAcao;
};
