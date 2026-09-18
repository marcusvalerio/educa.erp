import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Database,
  ShoppingCart,
  PackageSearch,
  Truck,
  Wallet,
  Receipt,
  BarChart3,
  Settings,
  Target,
  Wrench,
  ShieldCheck,
  Briefcase,
} from "lucide-react";

export type NavChild = {
  label: string;
  slug: string;
};

export type NavModule = {
  label: string;
  slug: string;
  icon: LucideIcon;
  description: string;
  children: NavChild[];
};

export const NAV: NavModule[] = [
  {
    label: "Dashboard",
    slug: "",
    icon: LayoutDashboard,
    description: "Visão geral da empresa.",
    children: [],
  },
  {
    label: "Cadastros",
    slug: "cadastros",
    icon: Database,
    description:
      "Cadastros centrais utilizados por todos os módulos: produtos, parceiros de negócio, frota e usuários.",
    children: [
      { label: "Produtos", slug: "produtos" },
      { label: "Clientes", slug: "clientes" },
      { label: "Fornecedores", slug: "fornecedores" },
      { label: "Transportadoras", slug: "transportadoras" },
      { label: "Motoristas", slug: "motoristas" },
      { label: "Veículos", slug: "veiculos" },
      { label: "Usuários", slug: "usuarios" },
      { label: "Locais de estoque", slug: "locais-estoque" },
    ],
  },
  {
    label: "Comercial",
    slug: "comercial",
    icon: ShoppingCart,
    description: "Fluxo comercial completo, do orçamento ao faturamento das vendas.",
    children: [
      { label: "Orçamentos", slug: "orcamentos" },
      { label: "Pedidos de venda", slug: "pedidos-venda" },
      { label: "Faturamento", slug: "faturamento" },
    ],
  },
  {
    label: "Suprimentos",
    slug: "suprimentos",
    icon: PackageSearch,
    description:
      "Processo de compras, da solicitação interna ao agendamento de entrega com fornecedores.",
    children: [
      { label: "Solicitação de compra", slug: "solicitacao-compra" },
      { label: "Cotações", slug: "cotacoes" },
      { label: "Pedidos de compra", slug: "pedidos-compra" },
      { label: "Agendamentos", slug: "agendamentos" },
    ],
  },
  {
    label: "Logística",
    slug: "logistica",
    icon: Truck,
    description:
      "Operações de armazém e transporte, do recebimento à expedição e devolução de mercadorias.",
    children: [
      { label: "Recebimento", slug: "recebimento" },
      { label: "Estoque", slug: "estoque" },
      { label: "Endereçamento", slug: "enderecamento" },
      { label: "Inventário", slug: "inventario" },
      { label: "Movimentações", slug: "movimentacoes" },
      { label: "Picking", slug: "picking" },
      { label: "Packing", slug: "packing" },
      { label: "Expedição", slug: "expedicao" },
      { label: "Transferências", slug: "transferencias" },
      { label: "Devoluções", slug: "devolucoes" },
      { label: "Transportes", slug: "transportes" },
      { label: "Almoxarifado", slug: "almoxarifado" },
    ],
  },
  {
    label: "CRM",
    slug: "crm",
    icon: Target,
    description: "Leads, pipeline de oportunidades e atividades comerciais — Fase 15.",
    children: [
      { label: "Leads", slug: "leads" },
      { label: "Pipeline", slug: "pipeline" },
      { label: "Oportunidades", slug: "oportunidades" },
      { label: "Atividades", slug: "atividades" },
    ],
  },
  {
    label: "Ativos",
    slug: "ativos",
    icon: Wrench,
    description: "Cadastro de ativos, hierarquia, planos e ordens de manutenção — Fase 16.",
    children: [
      { label: "Ativos", slug: "lista" },
      { label: "Categorias", slug: "categorias" },
      { label: "Locais", slug: "locais" },
      { label: "Planos de manutenção", slug: "planos-manutencao" },
      { label: "Ordens de manutenção", slug: "ordens-manutencao" },
    ],
  },
  {
    label: "Qualidade",
    slug: "qualidade",
    icon: ShieldCheck,
    description: "Checklists, inspeções, não conformidades e ações corretivas/preventivas — Fase 17.",
    children: [
      { label: "Checklists", slug: "checklists" },
      { label: "Inspeções", slug: "inspecoes" },
      { label: "Não conformidades", slug: "nao-conformidades" },
      { label: "Ações", slug: "acoes" },
    ],
  },
  {
    label: "Projetos e Serviços",
    slug: "projetos",
    icon: Briefcase,
    description: "Projetos, tarefas, apontamentos e ordens de serviço — Fase 18.",
    children: [
      { label: "Projetos", slug: "lista" },
      { label: "Tarefas", slug: "tarefas" },
      { label: "Apontamentos", slug: "apontamentos" },
      { label: "Ordens de serviço", slug: "ordens-servico" },
    ],
  },
  {
    label: "Financeiro",
    slug: "financeiro",
    icon: Wallet,
    description:
      "Controle financeiro da empresa: contas a pagar, a receber, fluxo de caixa e centros de custo.",
    children: [
      { label: "Contas a pagar", slug: "contas-pagar" },
      { label: "Contas a receber", slug: "contas-receber" },
      { label: "Fluxo de caixa", slug: "fluxo-caixa" },
      { label: "Centro de custos", slug: "centro-custos" },
    ],
  },
  {
    label: "Fiscal",
    slug: "fiscal",
    icon: Receipt,
    description:
      "Documentos e parâmetros fiscais utilizados nas operações da empresa.",
    children: [
      { label: "Notas fiscais", slug: "notas-fiscais" },
      { label: "NF-e", slug: "nfe" },
      { label: "NCM", slug: "ncm" },
      { label: "CFOP", slug: "cfop" },
      { label: "Impostos", slug: "impostos" },
    ],
  },
  {
    label: "Gestão",
    slug: "gestao",
    icon: BarChart3,
    description:
      "Indicadores, relatórios e auditoria para acompanhamento da performance da operação.",
    children: [
      { label: "KPIs", slug: "kpis" },
      { label: "Relatórios", slug: "relatorios" },
      { label: "Dashboard", slug: "dashboard" },
      { label: "Auditoria", slug: "auditoria" },
    ],
  },
  {
    label: "Configurações",
    slug: "configuracoes",
    icon: Settings,
    description: "Parâmetros gerais, usuários, permissões e preferências do sistema.",
    children: [
      { label: "Empresa", slug: "empresa" },
      { label: "Parâmetros", slug: "parametros" },
      { label: "Usuários", slug: "usuarios" },
      { label: "Permissões", slug: "permissoes" },
      { label: "Aparência", slug: "aparencia" },
    ],
  },
];

export function moduleHref(mod: NavModule) {
  return mod.slug ? `/${mod.slug}` : "/";
}

export function childHref(mod: NavModule, child: NavChild) {
  return `/${mod.slug}/${child.slug}`;
}
