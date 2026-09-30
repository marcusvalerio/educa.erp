import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Briefcase,
  Building2,
  ClipboardCheck,
  Database,
  Factory,
  Gauge,
  Handshake,
  Home,
  Landmark,
  LayoutGrid,
  Network,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  Wrench,
  KeyRound,
  Blocks,
  BadgeCheck,
  UserCog,
  BarChart3,
} from "lucide-react";

// Registro único de navegação do ATLAS.ERP.
//
// Cada página declara a permissão que a API correspondente exige (a
// mesma string usada em requireAccess/has_permission no backend). A UI
// usa isso para NÃO mostrar o que o usuário não pode acessar e para
// proteger a página com "Sem acesso a este recurso" — mas não é a
// barreira: a API e o RLS recusam de qualquer forma.

export type NavLeaf = {
  label: string;
  href: string;
  /** Permissão exigida (qualquer uma, se array). Ausente = só autenticação. */
  permission?: string | string[];
  description?: string;
  keywords?: string[];
};

export type NavGroupId = "overview" | "operations" | "management" | "records" | "system";

export type NavSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  group: NavGroupId;
  description: string;
  items: NavLeaf[];
};

export const NAV_GROUP_LABELS: Record<NavGroupId, string> = {
  overview: "Visão geral",
  operations: "Operação",
  management: "Gestão",
  records: "Cadastros",
  system: "Sistema",
};

export const ERP_NAV: NavSection[] = [
  {
    id: "inicio",
    label: "Início",
    icon: Home,
    href: "/app",
    group: "overview",
    description: "Centro operacional: o que está acontecendo, o que mudou e o que precisa de ação.",
    items: [],
  },
  {
    id: "dashboards",
    label: "Painéis",
    icon: Gauge,
    href: "/app/gestao/dashboard",
    group: "overview",
    description: "Painéis por área, compostos pelo contexto do usuário e pelos módulos habilitados.",
    items: [
      { label: "Executivo", href: "/app/gestao/dashboard", permission: "reports.view" },
      { label: "Comercial", href: "/app/gestao/dashboard/comercial", permission: "commercial_reports.view" },
      { label: "Compras", href: "/app/gestao/dashboard/compras", permission: "purchase_reports.view" },
      { label: "Estoque", href: "/app/gestao/dashboard/estoque", permission: "inventory_reports.view" },
      { label: "Logística", href: "/app/gestao/dashboard/logistica", permission: "logistics_reports.view" },
      { label: "Produção", href: "/app/gestao/dashboard/producao", permission: "production_reports.view" },
      { label: "Financeiro", href: "/app/gestao/dashboard/financeiro", permission: "financial_reports.view" },
      { label: "Fiscal", href: "/app/gestao/dashboard/fiscal", permission: "fiscal_reports.view" },
      { label: "Controladoria", href: "/app/gestao/dashboard/controladoria", permission: "controlling.view", keywords: ["kpi", "indicadores"] },
      { label: "Qualidade", href: "/app/gestao/dashboard/qualidade", permission: "nonconformities.view" },
      { label: "Manutenção", href: "/app/gestao/dashboard/manutencao", permission: "maintenance_orders.view" },
      { label: "Operações", href: "/app/gestao/dashboard/operacoes", permission: ["shipments.view", "stock.view", "production_orders.view"] },
      { label: "TI e acessos", href: "/app/gestao/dashboard/ti", permission: "users.read" },
    ],
  },
  {
    id: "comercial",
    label: "Comercial",
    icon: ShoppingCart,
    href: "/app/comercial",
    group: "operations",
    description: "Do orçamento ao faturamento das vendas.",
    items: [
      { label: "Orçamentos", href: "/app/comercial/orcamentos", permission: "sales_quotes.view", keywords: ["cotação", "proposta"] },
      { label: "Pedidos de venda", href: "/app/comercial/pedidos-venda", permission: "sales_orders.view", keywords: ["venda", "pedido"] },
      { label: "Faturamento", href: "/app/comercial/faturamento", permission: "fiscal_documents.view", keywords: ["nota", "fatura"] },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    icon: Handshake,
    href: "/app/crm",
    group: "operations",
    description: "Leads, oportunidades, funil e atividades comerciais.",
    items: [
      { label: "Leads", href: "/app/crm/leads", permission: "leads.view" },
      { label: "Pipeline", href: "/app/crm/pipeline", permission: "opportunities.view", keywords: ["funil"] },
      { label: "Oportunidades", href: "/app/crm/oportunidades", permission: "opportunities.view" },
      { label: "Atividades", href: "/app/crm/atividades", permission: "activities.view" },
    ],
  },
  {
    id: "suprimentos",
    label: "Suprimentos",
    icon: Boxes,
    href: "/app/suprimentos",
    group: "operations",
    description: "Da solicitação interna ao recebimento de fornecedores.",
    items: [
      { label: "Solicitações de compra", href: "/app/suprimentos/solicitacao-compra", permission: "purchase_requests.view" },
      { label: "Cotações", href: "/app/suprimentos/cotacoes", permission: "purchase_quotes.view", keywords: ["rfq"] },
      { label: "Pedidos de compra", href: "/app/suprimentos/pedidos-compra", permission: "purchase_orders.view" },
      { label: "Agendamentos", href: "/app/suprimentos/agendamentos", permission: "purchase_receipts.view" },
    ],
  },
  {
    id: "logistica",
    label: "Logística e Estoque",
    icon: Truck,
    href: "/app/logistica",
    group: "operations",
    description: "Recebimento, estoque, separação, expedição e entrega.",
    items: [
      { label: "Recebimento", href: "/app/logistica/recebimento", permission: "purchase_receipts.view" },
      { label: "Estoque", href: "/app/logistica/estoque", permission: "stock.view", keywords: ["saldo"] },
      { label: "Movimentações", href: "/app/logistica/movimentacoes", permission: "stock.view" },
      { label: "Transferências", href: "/app/logistica/transferencias", permission: "stock.view" },
      { label: "Inventário", href: "/app/logistica/inventario", permission: "stock.view", keywords: ["contagem"] },
      { label: "Endereçamento", href: "/app/logistica/enderecamento", permission: "warehouse_locations.read" },
      { label: "Almoxarifado", href: "/app/logistica/almoxarifado", permission: "stock.view", keywords: ["requisição"] },
      { label: "Picking", href: "/app/logistica/picking", permission: "pick_lists.view", keywords: ["separação"] },
      { label: "Packing", href: "/app/logistica/packing", permission: "shipments.view", keywords: ["embalagem"] },
      { label: "Expedição", href: "/app/logistica/expedicao", permission: "shipments.view" },
      { label: "Transportes", href: "/app/logistica/transportes", permission: "shipments.view", keywords: ["entrega"] },
      { label: "Devoluções", href: "/app/logistica/devolucoes", permission: "stock.view" },
    ],
  },
  {
    id: "producao",
    label: "Produção",
    icon: Factory,
    href: "/app/producao",
    group: "operations",
    description: "Estruturas de produto, ordens de produção, consumo e apontamentos.",
    items: [
      { label: "Ordens de produção", href: "/app/producao/ordens", permission: "production_orders.view", keywords: ["op"] },
      { label: "Estruturas (BOM)", href: "/app/producao/estruturas", permission: "production_boms.view", keywords: ["bom", "ficha técnica"] },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: Wallet,
    href: "/app/financeiro",
    group: "management",
    description: "Contas a pagar e a receber, fluxo de caixa e centros de custo.",
    items: [
      { label: "Contas a pagar", href: "/app/financeiro/contas-pagar", permission: "accounts_payable.view" },
      { label: "Contas a receber", href: "/app/financeiro/contas-receber", permission: "accounts_receivable.view" },
      { label: "Fluxo de caixa", href: "/app/financeiro/fluxo-caixa", permission: "financial_transactions.view" },
      { label: "Centros de custo", href: "/app/financeiro/centro-custos", permission: "cost_centers.view" },
    ],
  },
  {
    id: "fiscal",
    label: "Fiscal",
    icon: Receipt,
    href: "/app/fiscal",
    group: "management",
    description: "Documentos fiscais, classificação e regras tributárias.",
    items: [
      { label: "Notas fiscais", href: "/app/fiscal/notas-fiscais", permission: "fiscal_documents.view" },
      { label: "NF-e", href: "/app/fiscal/nfe", permission: "fiscal_documents.view" },
      { label: "NCM", href: "/app/fiscal/ncm", permission: "fiscal_ncms.view" },
      { label: "CFOP", href: "/app/fiscal/cfop", permission: "fiscal_cfops.view" },
      { label: "Regras tributárias", href: "/app/fiscal/impostos", permission: "tax_rules.view", keywords: ["impostos"] },
    ],
  },
  {
    id: "projetos",
    label: "Projetos e Serviços",
    icon: Briefcase,
    href: "/app/projetos",
    group: "management",
    description: "Projetos, tarefas, apontamentos e ordens de serviço.",
    items: [
      { label: "Projetos", href: "/app/projetos/lista", permission: "projects.view" },
      { label: "Tarefas", href: "/app/projetos/tarefas", permission: "project_tasks.view" },
      { label: "Apontamentos", href: "/app/projetos/apontamentos", permission: "time_entries.view", keywords: ["horas"] },
      { label: "Ordens de serviço", href: "/app/projetos/ordens-servico", permission: "service_orders.view", keywords: ["os"] },
    ],
  },
  {
    id: "qualidade",
    label: "Qualidade",
    icon: ClipboardCheck,
    href: "/app/qualidade",
    group: "management",
    description: "Checklists, inspeções, não conformidades e ações.",
    items: [
      { label: "Não conformidades", href: "/app/qualidade/nao-conformidades", permission: "nonconformities.view", keywords: ["nc"] },
      { label: "Inspeções", href: "/app/qualidade/inspecoes", permission: "quality_inspections.view" },
      { label: "Ações", href: "/app/qualidade/acoes", permission: "quality_actions.view", keywords: ["capa"] },
      { label: "Checklists", href: "/app/qualidade/checklists", permission: "quality_checklists.view" },
    ],
  },
  {
    id: "ativos",
    label: "Ativos e Manutenção",
    icon: Wrench,
    href: "/app/ativos",
    group: "management",
    description: "Ativos, locais e manutenção preventiva e corretiva.",
    items: [
      { label: "Ativos", href: "/app/ativos/lista", permission: "assets.view" },
      { label: "Ordens de manutenção", href: "/app/ativos/ordens-manutencao", permission: "maintenance_orders.view" },
      { label: "Planos de manutenção", href: "/app/ativos/planos-manutencao", permission: "maintenance_plans.view" },
      { label: "Categorias", href: "/app/ativos/categorias", permission: "asset_categories.view" },
      { label: "Locais", href: "/app/ativos/locais", permission: "asset_locations.view" },
    ],
  },
  {
    id: "gestao",
    label: "Controladoria",
    icon: BarChart3,
    href: "/app/gestao",
    group: "management",
    description: "Indicadores de controladoria, relatórios e trilha de auditoria.",
    items: [
      { label: "Relatórios", href: "/app/gestao/relatorios", permission: ["reports.view", "controlling.view", "commercial_reports.view", "purchase_reports.view", "inventory_reports.view", "logistics_reports.view", "production_reports.view", "financial_reports.view", "fiscal_reports.view"], keywords: ["kpi", "indicadores"] },
      { label: "Auditoria", href: "/app/gestao/auditoria", permission: "audit_logs.read", keywords: ["log"] },
    ],
  },
  {
    id: "cadastros",
    label: "Cadastros",
    icon: Database,
    href: "/app/cadastros",
    group: "records",
    description: "Produtos, parceiros de negócio, frota e locais de estoque.",
    items: [
      { label: "Produtos", href: "/app/cadastros/produtos", permission: "products.read", keywords: ["sku", "item"] },
      { label: "Clientes", href: "/app/cadastros/clientes", permission: "customers.read" },
      { label: "Fornecedores", href: "/app/cadastros/fornecedores", permission: "suppliers.read" },
      { label: "Transportadoras", href: "/app/cadastros/transportadoras", permission: "carriers.read" },
      { label: "Motoristas", href: "/app/cadastros/motoristas", permission: "drivers.read" },
      { label: "Veículos", href: "/app/cadastros/veiculos", permission: "vehicles.read" },
      { label: "Locais de estoque", href: "/app/cadastros/locais-estoque", permission: "warehouse_locations.read" },
    ],
  },
  {
    id: "configuracoes",
    label: "Configurações",
    icon: Settings,
    href: "/app/configuracoes",
    group: "system",
    description: "Parâmetros do sistema e preferências de exibição.",
    items: [
      { label: "Parâmetros", href: "/app/configuracoes/parametros", permission: "settings.view" },
      { label: "Dados da empresa", href: "/app/configuracoes/empresa", permission: "companies.read" },
      { label: "Aparência", href: "/app/configuracoes/aparencia" },
      { label: "Documentação", href: "/app/configuracoes/documentacao" },
    ],
  },
];

// ------------------------------------------------------------------ /admin
// Administração da Empresa: só a empresa do próprio usuário.
export const ADMIN_NAV: NavSection[] = [
  {
    id: "admin",
    label: "Administração",
    icon: LayoutGrid,
    href: "/app/admin",
    group: "overview",
    description: "Visão geral da administração da empresa.",
    items: [
      { label: "Visão geral", href: "/app/admin" },
      { label: "Usuários", href: "/app/admin/users", permission: "users.read", keywords: ["acesso", "conta"] },
      { label: "Papéis e permissões", href: "/app/admin/roles", permission: "roles.read", keywords: ["rbac", "perfil"] },
      { label: "Setores", href: "/app/admin/departments", permission: "departments.view", keywords: ["departamento"] },
      { label: "Cargos", href: "/app/admin/positions", permission: "positions.view" },
      { label: "Unidades", href: "/app/admin/branches", permission: "branches.read", keywords: ["filial"] },
      { label: "Módulos", href: "/app/admin/modules", permission: "company_modules.view" },
      { label: "Configurações", href: "/app/admin/settings", permission: ["settings.view", "dashboard.configure"] },
      { label: "Auditoria", href: "/app/admin/audit", permission: "audit_logs.read" },
    ],
  },
];

export const ADMIN_ICONS: Record<string, LucideIcon> = {
  "/app/admin": LayoutGrid,
  "/app/admin/users": Users,
  "/app/admin/roles": KeyRound,
  "/app/admin/departments": Network,
  "/app/admin/positions": BadgeCheck,
  "/app/admin/branches": Building2,
  "/app/admin/modules": Blocks,
  "/app/admin/settings": SlidersHorizontal,
  "/app/admin/audit": ScrollText,
};

/** Permissões que dão acesso a ALGUMA página de /admin. */
export const ADMIN_ENTRY_PERMISSIONS = [
  "users.read",
  "roles.read",
  "departments.view",
  "positions.view",
  "branches.read",
  "company_modules.view",
  "settings.view",
  "dashboard.configure",
  "audit_logs.read",
];

// ------------------------------------------------------------------ /admincentral
// Administração Central: governança da PLATAFORMA. Permissões aqui são
// de plataforma (has_platform_permission), nunca de tenant.
export const PLATFORM_NAV: NavSection[] = [
  {
    id: "admincentral",
    label: "Administração Central",
    icon: Landmark,
    href: "/app/admincentral",
    group: "overview",
    description: "Governança da plataforma ATLAS.ERP.",
    items: [
      { label: "Visão geral", href: "/app/admincentral" },
      { label: "Empresas", href: "/app/admincentral/companies", permission: "platform.companies.view", keywords: ["tenant", "cliente"] },
      { label: "Módulos", href: "/app/admincentral/modules", permission: "platform.modules.view" },
      { label: "Membros da plataforma", href: "/app/admincentral/platform-members", permission: "platform.members.view", keywords: ["owner", "admin"] },
      { label: "Permissões", href: "/app/admincentral/permissions" },
      { label: "Auditoria", href: "/app/admincentral/audit", permission: "platform.audit.view" },
      { label: "Políticas", href: "/app/admincentral/settings", permission: "platform.settings.view" },
    ],
  },
];

export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  "/app/admincentral": Landmark,
  "/app/admincentral/companies": Building2,
  "/app/admincentral/modules": Blocks,
  "/app/admincentral/platform-members": UserCog,
  "/app/admincentral/permissions": ShieldCheck,
  "/app/admincentral/audit": ScrollText,
  "/app/admincentral/settings": SlidersHorizontal,
};

export function findSection(sections: NavSection[], id: string): NavSection | undefined {
  return sections.find((s) => s.id === id);
}
