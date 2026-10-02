// Rótulos em português das entidades da trilha de auditoria (E2E NOVA ORBITA,
// P14). O banco grava o nome técnico da tabela (funções) ou o rótulo do
// cadastro (repositório genérico); a tela mostra o rótulo e mantém o nome
// técnico disponível (coluna "Tabela" e detalhe do evento).

const LABELS: Record<string, string> = {
  // Acesso e governança
  users: "Usuário",
  user_invitations: "Convite de usuário",
  user_roles: "Papel do usuário",
  roles: "Papel",
  user_branch_access: "Acesso a unidade",
  auth_identity_links: "Vínculo de login",
  company_modules: "Módulo da empresa",
  companies: "Empresa",
  company_platform_profiles: "Perfil da empresa na plataforma",
  platform_members: "Membro da plataforma",
  platform_modules: "Módulo da plataforma",
  system_settings: "Configuração",
  document_sequences: "Numeração de documentos",
  dashboard_focus_rules: "Regra de foco do painel",
  // Comercial e CRM
  sales_quotes: "Orçamento",
  sales_orders: "Pedido de venda",
  leads: "Lead",
  opportunities: "Oportunidade",
  // Suprimentos e logística
  purchase_requests: "Solicitação de compra",
  purchase_quotes: "Cotação de compra",
  purchase_orders: "Pedido de compra",
  purchase_receipts: "Recebimento de compra",
  pick_lists: "Separação",
  stock_transfers: "Transferência entre locais",
  stock_reservations: "Reserva de estoque",
  stock_movements: "Movimento de estoque",
  shipments: "Expedição",
  // Financeiro
  accounts_receivable: "Conta a receber",
  accounts_payable: "Conta a pagar",
  receipts: "Recebimento",
  payments: "Pagamento",
  financial_accounts: "Conta financeira",
  financial_transactions: "Movimento financeiro",
  financial_competence_periods: "Período de competência",
  bank_reconciliations: "Conciliação bancária",
  budget_headers: "Orçamento financeiro",
  cost_allocations: "Rateio de custo",
  // Fiscal
  fiscal_documents: "Documento fiscal",
  fiscal_document_events: "Evento de documento fiscal",
  fiscal_authorization_attempts: "Tentativa de autorização fiscal",
  fiscal_digital_certificates: "Certificado digital",
  fiscal_provider_configs: "Provedor fiscal",
  product_fiscal_profiles: "Perfil fiscal do produto",
  tax_rules: "Regra tributária",
  // Produção, custos, qualidade, manutenção e projetos
  production_orders: "Ordem de produção",
  production_order_materials: "Material da ordem de produção",
  production_scrap: "Refugo de produção",
  product_boms: "Estrutura de produto",
  product_cost_balances: "Saldo de custo",
  product_standard_costs: "Custo padrão",
  quality_inspections: "Inspeção de qualidade",
  nonconformities: "Não conformidade",
  maintenance_orders: "Ordem de manutenção",
  maintenance_order_costs: "Custo de manutenção",
  service_orders: "Ordem de serviço",
  workflows: "Fluxo de aprovação",
  workflow_instances: "Instância de fluxo",
  // Importação/exportação
  import_jobs: "Importação",
  export_jobs: "Exportação",
};

/** Rótulo em português; rótulos já gravados em português ("Cliente") passam como estão. */
export function auditEntityLabel(entity: string | null | undefined): string {
  if (!entity) return "—";
  return LABELS[entity] ?? entity;
}
