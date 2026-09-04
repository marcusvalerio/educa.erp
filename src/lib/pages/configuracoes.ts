import type { PageConfig } from "./types";
import { genUsuarios, genParametros, genPermissoes } from "../mock/generators";

const moduleLabel = "Configurações";
const moduleHref = "/configuracoes";

const EMPRESA_ROWS = [
  { campo: "Razão social", valor: "Educa ERP Soluções Logísticas Ltda.", categoria: "Identificação", status: "Preenchido" },
  { campo: "Nome fantasia", valor: "Educa ERP", categoria: "Identificação", status: "Preenchido" },
  { campo: "CNPJ", valor: "00.000.000/0001-00", categoria: "Identificação", status: "Preenchido" },
  { campo: "Inscrição estadual", valor: "000.000.000.000", categoria: "Fiscal", status: "Preenchido" },
  { campo: "Endereço matriz", valor: "Av. das Indústrias, 1200 - São Paulo/SP", categoria: "Endereço", status: "Preenchido" },
  { campo: "Regime tributário", valor: "Lucro Presumido", categoria: "Fiscal", status: "Preenchido" },
  { campo: "E-mail corporativo", valor: "contato@educaerp.com.br", categoria: "Contato", status: "Preenchido" },
];

const APARENCIA_ROWS = [
  { item: "Tema", valor: "Claro (padrão ERP)", status: "Ativo" },
  { item: "Cor de destaque", valor: "Azul institucional", status: "Ativo" },
  { item: "Fonte de interface", valor: "Inter", status: "Ativo" },
  { item: "Fonte de destaque", valor: "Supreme", status: "Ativo" },
  { item: "Densidade da tabela", valor: "Confortável", status: "Ativo" },
  { item: "Menu lateral", valor: "Expandido", status: "Ativo" },
];

export const configuracoes: Record<string, PageConfig> = {
  empresa: {
    moduleLabel,
    moduleHref,
    pageLabel: "Empresa",
    title: "Empresa",
    description: "Dados cadastrais da empresa utilizados nos documentos e telas do sistema.",
    primaryActionLabel: "Editar dados",
    filters: [
      { key: "campo", label: "Campo", type: "text" },
      { key: "categoria", label: "Categoria", type: "select", options: ["Identificação", "Fiscal", "Endereço", "Contato"] },
    ],
    columns: [
      { key: "campo", label: "Campo" },
      { key: "valor", label: "Valor" },
      { key: "categoria", label: "Categoria" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: EMPRESA_ROWS,
  },
  parametros: {
    moduleLabel,
    moduleHref,
    pageLabel: "Parâmetros",
    title: "Parâmetros do sistema",
    description: "Parâmetros gerais que controlam o comportamento das operações do ERP.",
    primaryActionLabel: "Novo parâmetro",
    filters: [
      { key: "parametro", label: "Parâmetro", type: "text" },
      { key: "categoria", label: "Categoria", type: "select", options: ["Estoque", "Financeiro", "Fiscal", "Suprimentos", "Logística", "Sistema"] },
    ],
    columns: [
      { key: "parametro", label: "Parâmetro" },
      { key: "valor", label: "Valor" },
      { key: "categoria", label: "Categoria" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genParametros(),
  },
  usuarios: {
    moduleLabel,
    moduleHref,
    pageLabel: "Usuários",
    title: "Usuários",
    description: "Gestão de usuários com acesso ao sistema e seus respectivos perfis.",
    primaryActionLabel: "Novo usuário",
    filters: [
      { key: "nome", label: "Nome", type: "text" },
      { key: "perfil", label: "Perfil", type: "select", options: ["Administrador", "Operador de Logística", "Comprador", "Vendedor", "Financeiro", "Fiscal", "Gestor"] },
      { key: "status", label: "Status", type: "select", options: ["Ativo", "Inativo", "Pendente"] },
    ],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "nome", label: "Nome" },
      { key: "email", label: "E-mail" },
      { key: "perfil", label: "Perfil" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genUsuarios(801),
  },
  permissoes: {
    moduleLabel,
    moduleHref,
    pageLabel: "Permissões",
    title: "Perfis e permissões",
    description: "Perfis de acesso e módulos liberados para cada perfil de usuário.",
    primaryActionLabel: "Novo perfil",
    filters: [
      { key: "perfil", label: "Perfil", type: "text" },
      { key: "nivel", label: "Nível", type: "select", options: ["Total", "Restrito"] },
    ],
    columns: [
      { key: "perfil", label: "Perfil" },
      { key: "modulos", label: "Módulos liberados" },
      { key: "nivel", label: "Nível de acesso" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: genPermissoes(),
  },
  aparencia: {
    moduleLabel,
    moduleHref,
    pageLabel: "Aparência",
    title: "Aparência",
    description: "Preferências visuais e de identidade aplicadas à interface do sistema.",
    primaryActionLabel: "Salvar preferências",
    filters: [{ key: "item", label: "Item", type: "text" }],
    columns: [
      { key: "item", label: "Item" },
      { key: "valor", label: "Configuração atual" },
      { key: "status", label: "Status", render: "status" },
    ],
    rows: APARENCIA_ROWS,
  },
};
