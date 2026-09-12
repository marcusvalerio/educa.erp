import { cadastros as cadastroPageMeta } from "@/lib/pages/cadastros";
import type { CadastroConfig, RelatedGroup } from "./config-types";
import type {
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
} from "./repository";
import {
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
  clienteForm,
  fornecedorForm,
  transportadoraForm,
  motoristaForm,
  veiculoForm,
  usuarioForm,
  localEstoqueForm,
} from "./forms";
import {
  validateCliente,
  validateFornecedor,
  validateTransportadora,
  validateMotorista,
  validateVeiculo,
  validateUsuario,
  validateLocalEstoque,
} from "./validation";

const meta = cadastroPageMeta;

// produtoCadastroConfig foi removido na Fase 2 — Produtos passou a ter
// página dedicada (src/components/produtos/ProdutosPage.tsx) com busca/
// filtro/ordenação/paginação reais via API, em vez do padrão genérico
// de hidratar tudo e filtrar em memória usado pelos outros cadastros
// abaixo. Ver relatório da Fase 2 para o porquê.

export const clienteCadastroConfig: CadastroConfig<Cliente> = {
  moduleLabel: meta.clientes.moduleLabel,
  moduleHref: meta.clientes.moduleHref,
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
  moduleLabel: meta.fornecedores.moduleLabel,
  moduleHref: meta.fornecedores.moduleHref,
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
  moduleLabel: meta.transportadoras.moduleLabel,
  moduleHref: meta.transportadoras.moduleHref,
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
  moduleLabel: meta.motoristas.moduleLabel,
  moduleHref: meta.motoristas.moduleHref,
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
  moduleLabel: meta.veiculos.moduleLabel,
  moduleHref: meta.veiculos.moduleHref,
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
  moduleLabel: meta.usuarios.moduleLabel,
  moduleHref: meta.usuarios.moduleHref,
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
  moduleLabel: meta["locais-estoque"].moduleLabel,
  moduleHref: meta["locais-estoque"].moduleHref,
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
