import type { FormSection } from "./form-types";
import {
  TIPOS_PESSOA,
  CONDICOES_PAGAMENTO,
  ESTADOS_UF,
  CATEGORIAS_FORNECIMENTO,
  TIPOS_TRANSPORTE,
  REGIOES_ATENDIMENTO,
  CATEGORIAS_CNH,
  TIPOS_VEICULO,
  COMBUSTIVEIS,
  PERFIS_USUARIO_CADASTRO,
  DEPARTAMENTOS,
  TIPOS_LOCAL_ESTOQUE,
  ARMAZENS,
  STATUS_OPTIONS,
} from "./constants";

// produtoForm foi removido na Fase 2 — Produtos ganhou formulário próprio
// dentro de src/components/produtos/ProdutoDrawer.tsx, com seletores de
// categoria/marca/unidade alimentados por dados reais (product_categories/
// product_brands/units), não mais pelas constantes hardcoded que existiam
// aqui (CATEGORIAS_PRODUTO/SUBCATEGORIAS_PRODUTO/UNIDADES_PRODUTO).

export const clienteForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "tipo", label: "Tipo", type: "select", options: TIPOS_PESSOA, required: true, span: 2 },
      { key: "nome", label: "Razão social / Nome", type: "text", required: true, span: 2 },
      { key: "nomeFantasia", label: "Nome fantasia", type: "text", span: 2 },
      { key: "documento", label: "CPF/CNPJ", type: "text", required: true, span: 1 },
      { key: "inscricaoEstadual", label: "Inscrição estadual", type: "text", span: 1 },
    ],
  },
  {
    title: "Contato",
    fields: [
      { key: "email", label: "E-mail", type: "email", span: 2 },
      { key: "telefone", label: "Telefone", type: "tel", span: 1 },
      { key: "celular", label: "Celular", type: "tel", span: 1 },
    ],
  },
  {
    title: "Endereço",
    fields: [
      { key: "cep", label: "CEP", type: "text", span: 1 },
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_UF, span: 1 },
      { key: "cidade", label: "Cidade", type: "text", span: 2 },
      { key: "bairro", label: "Bairro", type: "text", span: 2 },
      { key: "endereco", label: "Endereço", type: "text", span: 2 },
      { key: "numero", label: "Número", type: "text", span: 1 },
      { key: "complemento", label: "Complemento", type: "text", span: 1 },
    ],
  },
  {
    title: "Condições comerciais",
    fields: [
      { key: "limiteCredito", label: "Limite de crédito (R$)", type: "number", step: 0.01, span: 2 },
      { key: "condicaoPagamento", label: "Condição de pagamento", type: "select", options: CONDICOES_PAGAMENTO, span: 2 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const fornecedorForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "tipo", label: "Tipo", type: "select", options: TIPOS_PESSOA, required: true, span: 2 },
      { key: "razaoSocial", label: "Razão social", type: "text", required: true, span: 2 },
      { key: "nomeFantasia", label: "Nome fantasia", type: "text", span: 2 },
      { key: "documento", label: "CNPJ/CPF", type: "text", required: true, span: 1 },
      { key: "inscricaoEstadual", label: "Inscrição estadual", type: "text", span: 1 },
    ],
  },
  {
    title: "Contato",
    fields: [
      { key: "email", label: "E-mail", type: "email", span: 2 },
      { key: "telefone", label: "Telefone", type: "tel", span: 1 },
      { key: "contato", label: "Contato", type: "text", span: 1 },
    ],
  },
  {
    title: "Endereço",
    fields: [
      { key: "cep", label: "CEP", type: "text", span: 1 },
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_UF, span: 1 },
      { key: "cidade", label: "Cidade", type: "text", span: 2 },
      { key: "bairro", label: "Bairro", type: "text", span: 2 },
      { key: "endereco", label: "Endereço", type: "text", span: 2 },
      { key: "numero", label: "Número", type: "text", span: 1 },
      { key: "complemento", label: "Complemento", type: "text", span: 1 },
    ],
  },
  {
    title: "Condições comerciais",
    fields: [
      { key: "categoriaFornecimento", label: "Categoria de fornecimento", type: "select", options: CATEGORIAS_FORNECIMENTO, span: 2 },
      { key: "prazoMedioEntrega", label: "Prazo médio de entrega (dias)", type: "number", span: 1 },
      { key: "condicaoPagamento", label: "Condição de pagamento", type: "select", options: CONDICOES_PAGAMENTO, span: 1 },
      { key: "observacoes", label: "Observações", type: "textarea", span: 4 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const transportadoraForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "razaoSocial", label: "Razão social", type: "text", required: true, span: 2 },
      { key: "nomeFantasia", label: "Nome fantasia", type: "text", span: 2 },
      { key: "cnpj", label: "CNPJ", type: "text", required: true, span: 1 },
      { key: "inscricaoEstadual", label: "Inscrição estadual", type: "text", span: 1 },
      { key: "responsavel", label: "Responsável", type: "text", span: 2 },
    ],
  },
  {
    title: "Contato",
    fields: [
      { key: "email", label: "E-mail", type: "email", span: 2 },
      { key: "telefone", label: "Telefone", type: "tel", span: 2 },
    ],
  },
  {
    title: "Endereço",
    fields: [
      { key: "cep", label: "CEP", type: "text", span: 1 },
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_UF, span: 1 },
      { key: "cidade", label: "Cidade", type: "text", span: 2 },
      { key: "endereco", label: "Endereço", type: "text", span: 4 },
    ],
  },
  {
    title: "Operação",
    fields: [
      { key: "tipoTransporte", label: "Tipo de transporte", type: "select", options: TIPOS_TRANSPORTE, span: 2 },
      { key: "regiaoAtendimento", label: "Região de atendimento", type: "select", options: REGIOES_ATENDIMENTO, span: 2 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const motoristaForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true, span: 3 },
      { key: "telefone", label: "Telefone", type: "tel", span: 1 },
      { key: "cpf", label: "CPF", type: "text", required: true, span: 1 },
      { key: "rg", label: "RG", type: "text", span: 1 },
      { key: "transportadoraId", label: "Transportadora", type: "select", optionsSource: "transportadoras", span: 2 },
    ],
  },
  {
    title: "Habilitação",
    fields: [
      { key: "cnh", label: "CNH", type: "text", required: true, span: 2 },
      { key: "categoriaCnh", label: "Categoria da CNH", type: "select", options: CATEGORIAS_CNH, required: true, span: 1 },
      { key: "validadeCnh", label: "Validade da CNH", type: "date", span: 1 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const veiculoForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "placa", label: "Placa", type: "text", required: true, span: 1 },
      { key: "renavam", label: "RENAVAM", type: "text", span: 1 },
      { key: "marca", label: "Marca", type: "text", span: 1 },
      { key: "modelo", label: "Modelo", type: "text", required: true, span: 1 },
      { key: "ano", label: "Ano", type: "number", span: 1 },
      { key: "tipo", label: "Tipo", type: "select", options: TIPOS_VEICULO, span: 1 },
      { key: "combustivel", label: "Combustível", type: "select", options: COMBUSTIVEIS, span: 1 },
    ],
  },
  {
    title: "Capacidade",
    fields: [
      { key: "capacidadeCarga", label: "Capacidade de carga (kg)", type: "number", span: 2 },
      { key: "pesoMaximo", label: "Peso máximo (kg)", type: "number", span: 2 },
    ],
  },
  {
    title: "Vínculos",
    fields: [
      { key: "transportadoraId", label: "Transportadora", type: "select", optionsSource: "transportadoras", span: 2 },
      { key: "motoristaPrincipalId", label: "Motorista principal", type: "select", optionsSource: "motoristas", span: 2 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const usuarioForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "nome", label: "Nome", type: "text", required: true, span: 2 },
      { key: "email", label: "E-mail", type: "email", required: true, span: 2 },
      { key: "login", label: "Login", type: "text", required: true, span: 2 },
      { key: "perfil", label: "Perfil", type: "select", options: PERFIS_USUARIO_CADASTRO, required: true, span: 1 },
      { key: "departamento", label: "Departamento", type: "select", options: DEPARTAMENTOS, span: 1 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];

export const localEstoqueForm: FormSection[] = [
  {
    title: "Dados principais",
    fields: [
      { key: "codigoLocal", label: "Código do local", type: "text", required: true, span: 2, placeholder: "CD01-R01-M03-N02-P01" },
      { key: "descricao", label: "Descrição", type: "text", span: 2 },
      { key: "armazem", label: "Armazém", type: "select", options: ARMAZENS, required: true, span: 1 },
      { key: "tipo", label: "Tipo de local", type: "select", options: TIPOS_LOCAL_ESTOQUE, required: true, span: 1 },
      { key: "capacidade", label: "Capacidade", type: "number", span: 2 },
    ],
  },
  {
    title: "Endereçamento",
    fields: [
      { key: "rua", label: "Rua", type: "text", span: 1 },
      { key: "modulo", label: "Módulo", type: "text", span: 1 },
      { key: "nivel", label: "Nível", type: "text", span: 1 },
      { key: "posicao", label: "Posição", type: "text", span: 1 },
    ],
  },
  {
    title: "Status",
    fields: [{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS, span: 1 }],
  },
];
