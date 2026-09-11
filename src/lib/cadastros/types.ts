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
  loteControlado: boolean;
  validadeControlada: boolean;
  categoriaId: string;
  marcaId: string;
  unidadeId: string;
  precoCusto: number;
  precoVenda: number;
  precoMinimo: number;
};

export type CategoriaProduto = BaseEntity & {
  nome: string;
  categoriaPaiId: string;
};

export type MarcaProduto = BaseEntity & {
  nome: string;
};

export type UnidadeMedida = BaseEntity & {
  codigo: string;
  nome: string;
  fracionavel: boolean;
};

export type ConversaoUnidade = BaseEntity & {
  unidadeOrigemId: string;
  unidadeDestinoId: string;
  fator: number;
};

// ---------------------------------------------------------- Estoque/WMS
export type TipoDeposito = "Padrão" | "Virtual";

export type Deposito = BaseEntity & {
  codigo: string;
  nome: string;
  tipo: TipoDeposito;
  endereco: string;
  cidade: string;
  estado: string;
  cep: string;
};

export type Lote = BaseEntity & {
  produtoId: string;
  numeroLote: string;
  dataFabricacao: string;
  dataValidade: string;
  fornecedorId: string;
  observacoes: string;
};

// -------------------------------------------------------------- Comercial
export type Vendedor = BaseEntity & {
  codigo: string;
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  percentualComissao: number;
  observacoes: string;
};

export type TabelaPreco = BaseEntity & {
  codigo: string;
  nome: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  prioridade: number;
  observacoes: string;
};

export type ItemTabelaPreco = BaseEntity & {
  tabelaPrecoId: string;
  produtoId: string;
  preco: number;
};

export type ProdutoFornecedor = BaseEntity & {
  produtoId: string;
  fornecedorId: string;
  skuFornecedor: string;
  custo: number;
  prazoEntregaDias: number;
  preferencial: boolean;
};

// Situação comercial — diferente de status (Ativo/Inativo do cadastro):
// um cliente pode estar "Ativo" no cadastro e em "Bloqueio de Crédito"
// no comercial. Ver supabase/migrations/0019.
export type StatusComercial = "Ativo" | "Bloqueio de Crédito" | "Bloqueado";

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
  vendedorPadraoId: string;
  tabelaPrecoPadraoId: string;
  condicaoPagamentoPadraoId: string;
  segmento: string;
  statusComercial: StatusComercial;
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

// Finalidade operacional do local — ver supabase/migrations/0013 e
// docs/INVENTORY.md. Não é um segundo tipo de estoque: classifica o
// mesmo local (mesmo saldo, mesmo ledger) por propósito. "Almoxarifado
// Operacional" é o nome oficial usado na UI para OPERATIONAL_WAREHOUSE
// — nunca abreviar para "Almoxarifado" sozinho (ambíguo).
export type FinalidadeLocal = "Estoque" | "Almoxarifado Operacional" | "Produção" | "Quarentena" | "Trânsito";

export type LocalEstoque = BaseEntity & {
  codigoLocal: string;
  descricao: string;
  armazem: string;
  finalidade: FinalidadeLocal;
  area: string;
  rua: string;
  modulo: string;
  nivel: string;
  posicao: string;
  tipo: string;
  capacidade: number;
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
