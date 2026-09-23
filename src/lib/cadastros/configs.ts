import type { CadastroConfig, RelatedGroup } from "./config-types";
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
import {
  produtosRepository,
  clientesRepository,
  fornecedoresRepository,
  transportadorasRepository,
  motoristasRepository,
  veiculosRepository,
  usuariosRepository,
  locaisEstoqueRepository,
  categoriasProdutoRepository,
  marcasProdutoRepository,
  unidadesMedidaRepository,
} from "./repository";
import {
  produtoColumns,
  produtoFilters,
  produtoToRow,
  clienteColumns,
  clienteFilters,
  clienteToRow,
  fornecedorColumns,
  fornecedorFilters,
  fornecedorToRow,
  transportadoraColumns,
  transportadoraFilters,
  transportadoraToRow,
  motoristaColumns,
  motoristaFilters,
  motoristaToRow,
  veiculoColumns,
  veiculoFilters,
  veiculoToRow,
  usuarioColumns,
  usuarioFilters,
  usuarioToRow,
  localEstoqueColumns,
  localEstoqueFilters,
  localEstoqueToRow,
} from "./columns";
import {
  produtoForm,
  clienteForm,
  fornecedorForm,
  transportadoraForm,
  motoristaForm,
  veiculoForm,
  usuarioForm,
  localEstoqueForm,
} from "./forms";
import {
  validateProduto,
  validateCliente,
  validateFornecedor,
  validateTransportadora,
  validateMotorista,
  validateVeiculo,
  validateUsuario,
  validateLocalEstoque,
} from "./validation";

function nextCode(prefix: string, count: number) {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

// Textos e permissão de cada cadastro (antes em src/lib/pages, junto
// de linhas fictícias que não existem mais). permissionModule é o
// prefixo das permissões exigidas pela API (<modulo>.create/update/...).
const meta = {
  "produtos": {
    pageLabel: "Produtos",
    title: "Produtos",
    description: "Gerencie os produtos, materiais e itens utilizados nas operações da empresa.",
    primaryActionLabel: "Novo produto",
    permissionModule: "products",
  },
  "clientes": {
    pageLabel: "Clientes",
    title: "Clientes",
    description: "Cadastro geral de clientes utilizados nas operações comerciais e de faturamento.",
    primaryActionLabel: "Novo cliente",
    permissionModule: "customers",
  },
  "fornecedores": {
    pageLabel: "Fornecedores",
    title: "Fornecedores",
    description: "Cadastro de fornecedores homologados para compras e suprimentos.",
    primaryActionLabel: "Novo fornecedor",
    permissionModule: "suppliers",
  },
  "transportadoras": {
    pageLabel: "Transportadoras",
    title: "Transportadoras",
    description: "Cadastro de transportadoras parceiras para operações de frete e distribuição.",
    primaryActionLabel: "Nova transportadora",
    permissionModule: "carriers",
  },
  "motoristas": {
    pageLabel: "Motoristas",
    title: "Motoristas",
    description: "Cadastro de motoristas vinculados às operações de transporte e expedição.",
    primaryActionLabel: "Novo motorista",
    permissionModule: "drivers",
  },
  "veiculos": {
    pageLabel: "Veículos",
    title: "Veículos",
    description: "Frota própria e agregada utilizada nas operações de transporte.",
    primaryActionLabel: "Novo veículo",
    permissionModule: "vehicles",
  },
  "usuarios": {
    pageLabel: "Usuários",
    title: "Usuários",
    description: "Usuários com acesso ao sistema e seus perfis de utilização.",
    primaryActionLabel: "Novo usuário",
    permissionModule: "users",
  },
  "locais-estoque": {
    pageLabel: "Locais de estoque",
    title: "Locais de estoque",
    description: "Estrutura de armazéns, docas e áreas utilizadas para armazenagem.",
    primaryActionLabel: "Novo local",
    permissionModule: "warehouse_locations",
  },
} as const;

export const produtoCadastroConfig: CadastroConfig<Produto> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.produtos.permissionModule,
  pageLabel: meta.produtos.pageLabel,
  title: meta.produtos.title,
  description: meta.produtos.description,
  primaryActionLabel: meta.produtos.primaryActionLabel,
  entityLabel: "Produto",
  entityNounLower: "produto",
  repository: produtosRepository,
  columns: produtoColumns,
  filters: produtoFilters,
  toRow: produtoToRow,
  formSections: produtoForm,
  validate: validateProduto,
  labelOf: (item) => item.codigo,
  defaultValues: (list) => ({
    codigo: nextCode("PRD", list.length),
    sku: "",
    descricao: "",
    descricaoCurta: "",
    categoria: "",
    subcategoria: "",
    unidade: "",
    codigoBarras: "",
    ncm: "",
    peso: 0,
    altura: 0,
    largura: 0,
    comprimento: 0,
    estoqueMinimo: 0,
    estoqueMaximo: 0,
    pontoReposicao: 0,
    localizacaoPadrao: "",
    fornecedorId: "",
    loteControlado: false,
    validadeControlada: false,
    categoriaId: "",
    marcaId: "",
    unidadeId: "",
    precoCusto: 0,
    precoVenda: 0,
    precoMinimo: 0,
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Fornecedor vinculado",
      items: item.fornecedorId
        ? [{ label: fornecedoresRepository.get(item.fornecedorId)?.razaoSocial ?? "—" }]
        : [],
    },
    {
      title: "Local de estoque padrão",
      items: item.localizacaoPadrao ? [{ label: item.localizacaoPadrao }] : [],
    },
  ],
  dependsOn: [fornecedoresRepository, categoriasProdutoRepository, marcasProdutoRepository, unidadesMedidaRepository],
};

export const clienteCadastroConfig: CadastroConfig<Cliente> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.clientes.permissionModule,
  pageLabel: meta.clientes.pageLabel,
  title: meta.clientes.title,
  description: meta.clientes.description,
  primaryActionLabel: meta.clientes.primaryActionLabel,
  entityLabel: "Cliente",
  entityNounLower: "cliente",
  repository: clientesRepository,
  columns: clienteColumns,
  filters: clienteFilters,
  toRow: clienteToRow,
  formSections: clienteForm,
  validate: validateCliente,
  labelOf: (item) => item.nome,
  defaultValues: () => ({
    tipo: "Pessoa Jurídica",
    nome: "",
    nomeFantasia: "",
    documento: "",
    inscricaoEstadual: "",
    email: "",
    telefone: "",
    celular: "",
    cep: "",
    estado: "",
    cidade: "",
    bairro: "",
    endereco: "",
    numero: "",
    complemento: "",
    limiteCredito: 0,
    condicaoPagamento: "",
    status: "Ativo",
  }),
  relatedLists: () => [
    {
      title: "Pedidos de venda",
      items: [],
    },
  ],
};

export const fornecedorCadastroConfig: CadastroConfig<Fornecedor> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.fornecedores.permissionModule,
  pageLabel: meta.fornecedores.pageLabel,
  title: meta.fornecedores.title,
  description: meta.fornecedores.description,
  primaryActionLabel: meta.fornecedores.primaryActionLabel,
  entityLabel: "Fornecedor",
  entityNounLower: "fornecedor",
  repository: fornecedoresRepository,
  columns: fornecedorColumns,
  filters: fornecedorFilters,
  toRow: fornecedorToRow,
  formSections: fornecedorForm,
  validate: validateFornecedor,
  labelOf: (item) => item.razaoSocial,
  defaultValues: () => ({
    tipo: "Pessoa Jurídica",
    razaoSocial: "",
    nomeFantasia: "",
    documento: "",
    inscricaoEstadual: "",
    email: "",
    telefone: "",
    contato: "",
    cep: "",
    estado: "",
    cidade: "",
    bairro: "",
    endereco: "",
    numero: "",
    complemento: "",
    prazoMedioEntrega: 0,
    condicaoPagamento: "",
    categoriaFornecimento: "",
    observacoes: "",
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Produtos vinculados",
      items: produtosRepository
        .list()
        .filter((p) => p.fornecedorId === item.id)
        .map((p) => ({ label: p.descricao, sublabel: p.codigo })),
    },
    { title: "Pedidos de compra", items: [] },
  ],
  dependsOn: [produtosRepository],
};

export const transportadoraCadastroConfig: CadastroConfig<Transportadora> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.transportadoras.permissionModule,
  pageLabel: meta.transportadoras.pageLabel,
  title: meta.transportadoras.title,
  description: meta.transportadoras.description,
  primaryActionLabel: meta.transportadoras.primaryActionLabel,
  entityLabel: "Transportadora",
  entityNounLower: "transportadora",
  repository: transportadorasRepository,
  columns: transportadoraColumns,
  filters: transportadoraFilters,
  toRow: transportadoraToRow,
  formSections: transportadoraForm,
  validate: validateTransportadora,
  labelOf: (item) => item.razaoSocial,
  defaultValues: () => ({
    razaoSocial: "",
    nomeFantasia: "",
    cnpj: "",
    inscricaoEstadual: "",
    email: "",
    telefone: "",
    responsavel: "",
    cep: "",
    estado: "",
    cidade: "",
    endereco: "",
    tipoTransporte: "",
    regiaoAtendimento: "",
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Motoristas vinculados",
      items: motoristasRepository
        .list()
        .filter((m) => m.transportadoraId === item.id)
        .map((m) => ({ label: m.nome, sublabel: m.categoriaCnh })),
    },
    {
      title: "Veículos vinculados",
      items: veiculosRepository
        .list()
        .filter((v) => v.transportadoraId === item.id)
        .map((v) => ({ label: v.placa, sublabel: `${v.marca} ${v.modelo}` })),
    },
  ],
  dependsOn: [motoristasRepository, veiculosRepository],
};

export const motoristaCadastroConfig: CadastroConfig<Motorista> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.motoristas.permissionModule,
  pageLabel: meta.motoristas.pageLabel,
  title: meta.motoristas.title,
  description: meta.motoristas.description,
  primaryActionLabel: meta.motoristas.primaryActionLabel,
  entityLabel: "Motorista",
  entityNounLower: "motorista",
  repository: motoristasRepository,
  columns: motoristaColumns,
  filters: motoristaFilters,
  toRow: motoristaToRow,
  formSections: motoristaForm,
  validate: validateMotorista,
  labelOf: (item) => item.nome,
  defaultValues: () => ({
    nome: "",
    cpf: "",
    rg: "",
    cnh: "",
    categoriaCnh: "",
    validadeCnh: "",
    telefone: "",
    transportadoraId: "",
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Transportadora vinculada",
      items: item.transportadoraId
        ? [{ label: transportadorasRepository.get(item.transportadoraId)?.razaoSocial ?? "—" }]
        : [],
    },
    {
      title: "Veículos como motorista principal",
      items: veiculosRepository
        .list()
        .filter((v) => v.motoristaPrincipalId === item.id)
        .map((v) => ({ label: v.placa, sublabel: `${v.marca} ${v.modelo}` })),
    },
  ],
  dependsOn: [transportadorasRepository, veiculosRepository],
};

export const veiculoCadastroConfig: CadastroConfig<Veiculo> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.veiculos.permissionModule,
  pageLabel: meta.veiculos.pageLabel,
  title: meta.veiculos.title,
  description: meta.veiculos.description,
  primaryActionLabel: meta.veiculos.primaryActionLabel,
  entityLabel: "Veículo",
  entityNounLower: "veículo",
  repository: veiculosRepository,
  columns: veiculoColumns,
  filters: veiculoFilters,
  toRow: veiculoToRow,
  formSections: veiculoForm,
  validate: validateVeiculo,
  labelOf: (item) => item.placa,
  defaultValues: () => ({
    placa: "",
    renavam: "",
    marca: "",
    modelo: "",
    ano: new Date().getFullYear(),
    tipo: "",
    capacidadeCarga: 0,
    pesoMaximo: 0,
    transportadoraId: "",
    motoristaPrincipalId: "",
    combustivel: "",
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Transportadora",
      items: item.transportadoraId
        ? [{ label: transportadorasRepository.get(item.transportadoraId)?.razaoSocial ?? "—" }]
        : [],
    },
    {
      title: "Motorista principal",
      items: item.motoristaPrincipalId
        ? [{ label: motoristasRepository.get(item.motoristaPrincipalId)?.nome ?? "—" }]
        : [],
    },
  ],
  dependsOn: [transportadorasRepository, motoristasRepository],
};

export const usuarioCadastroConfig: CadastroConfig<Usuario> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta.usuarios.permissionModule,
  pageLabel: meta.usuarios.pageLabel,
  title: meta.usuarios.title,
  description: meta.usuarios.description,
  primaryActionLabel: meta.usuarios.primaryActionLabel,
  entityLabel: "Usuário",
  entityNounLower: "usuário",
  repository: usuariosRepository,
  columns: usuarioColumns,
  filters: usuarioFilters,
  toRow: usuarioToRow,
  formSections: usuarioForm,
  validate: validateUsuario,
  labelOf: (item) => item.nome,
  defaultValues: () => ({
    nome: "",
    email: "",
    login: "",
    perfil: "",
    departamento: "",
    status: "Ativo",
  }),
};

export const localEstoqueCadastroConfig: CadastroConfig<LocalEstoque> = {
  moduleLabel: "Cadastros",
  moduleHref: "/cadastros",
  permissionModule: meta["locais-estoque"].permissionModule,
  pageLabel: meta["locais-estoque"].pageLabel,
  title: meta["locais-estoque"].title,
  description: meta["locais-estoque"].description,
  primaryActionLabel: meta["locais-estoque"].primaryActionLabel,
  entityLabel: "Local de estoque",
  entityNounLower: "local de estoque",
  repository: locaisEstoqueRepository,
  columns: localEstoqueColumns,
  filters: localEstoqueFilters,
  toRow: localEstoqueToRow,
  formSections: localEstoqueForm,
  validate: validateLocalEstoque,
  labelOf: (item) => item.codigoLocal,
  defaultValues: () => ({
    codigoLocal: "",
    descricao: "",
    armazem: "",
    area: "",
    rua: "",
    modulo: "",
    nivel: "",
    posicao: "",
    tipo: "",
    capacidade: 0,
    status: "Ativo",
  }),
  relatedLists: (item): RelatedGroup[] => [
    {
      title: "Produtos armazenados neste local",
      items: produtosRepository
        .list()
        .filter((p) => p.localizacaoPadrao === item.codigoLocal)
        .map((p) => ({ label: p.descricao, sublabel: p.codigo })),
    },
  ],
  dependsOn: [produtosRepository],
};
