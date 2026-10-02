// Nomes em português dos recursos e ações do catálogo de permissões, para a
// matriz de Papéis e permissões. Antes a tela mostrava o código do recurso
// "humanizado" ("Company modules", "Rbac", "Audit") e ações em inglês
// ("Configure", "Submit authorization").
export const RESOURCE_LABELS: Record<string, string> = {
  accounts_payable: "Contas a pagar", accounts_receivable: "Contas a receber", activities: "Atividades (CRM)",
  asset_categories: "Categorias de ativos", asset_locations: "Locais de ativos", assets: "Ativos", audit: "Auditoria",
  bank_reconciliation: "Conciliação bancária", branches: "Unidades", carriers: "Transportadoras", catalog: "Catálogo de permissões",
  commercial_reports: "Relatórios comerciais", company_modules: "Módulos da empresa", controlling: "Controladoria",
  controlling_budget: "Orçamento (controladoria)", controlling_forecast: "Previsão (controladoria)", cost_centers: "Centros de custo",
  costs: "Custos", crm_reports: "Relatórios de CRM", customers: "Clientes", dashboard: "Painéis", deliveries: "Entregas",
  departments: "Setores", document_sequences: "Numeração de documentos", drivers: "Motoristas",
  financial_accounts: "Contas financeiras", financial_categories: "Categorias financeiras", financial_reports: "Relatórios financeiros",
  financial_transactions: "Lançamentos financeiros", fiscal_cfops: "CFOP", fiscal_document_events: "Eventos de documento fiscal",
  fiscal_document_files: "Arquivos de documento fiscal", fiscal_document_packages: "Volumes do documento fiscal",
  fiscal_document_references: "Referências do documento fiscal", fiscal_documents: "Documentos fiscais",
  fiscal_establishments: "Estabelecimentos fiscais", fiscal_ncms: "NCM", fiscal_operation_natures: "Naturezas de operação",
  fiscal_provider_configs: "Provedor fiscal", fiscal_reports: "Relatórios fiscais", fiscal_tax_codes: "Códigos tributários (CST/CSOSN)",
  import_export: "Importação e exportação", inventory_reports: "Relatórios de estoque", inventory_valuation: "Valorização de estoque",
  lead_origins: "Origens de lead", leads: "Leads", logistics_reports: "Relatórios de logística", maintenance_orders: "Ordens de manutenção",
  maintenance_plans: "Planos de manutenção", nonconformities: "Não conformidades", opportunities: "Oportunidades", org: "Estrutura organizacional",
  party_addresses: "Endereços", party_contacts: "Contatos", payment_terms: "Condições de pagamento", payments: "Pagamentos",
  pick_lists: "Separação", pipelines: "Funis de venda", positions: "Cargos", price_lists: "Tabelas de preço",
  product_attributes: "Atributos de produto", product_fiscal_profiles: "Perfis fiscais de produto", product_lots: "Lotes",
  product_serial_numbers: "Números de série", production_boms: "Estruturas de produto (BOM)", production_materials: "Materiais da produção",
  production_operations: "Operações da produção", production_orders: "Ordens de produção", production_reports: "Relatórios de produção",
  production_scrap: "Refugo da produção", products: "Produtos", project_tasks: "Tarefas de projeto", projects: "Projetos",
  purchase_orders: "Pedidos de compra", purchase_quotes: "Cotações de compra", purchase_receipts: "Recebimentos de compra",
  purchase_reports: "Relatórios de compras", purchase_requests: "Solicitações de compra", quality_actions: "Ações de qualidade",
  quality_checklists: "Checklists de qualidade", quality_inspections: "Inspeções de qualidade", quality_reports: "Relatórios de qualidade",
  rbac: "Papéis e permissões", receipts: "Recebimentos (financeiro)", reports: "Relatórios gerais", sales_orders: "Pedidos de venda",
  sales_quotes: "Orçamentos de venda", sales_representatives: "Vendedores (representantes)", service_orders: "Ordens de serviço",
  settings: "Configurações", settings_company: "Configurações da empresa", settings_establishment: "Configurações do estabelecimento",
  shipments: "Expedições", standard_costs: "Custos padrão", stock: "Estoque", suppliers: "Fornecedores", tax_rules: "Regras de impostos",
  time_entries: "Apontamento de horas", users: "Usuários", vehicles: "Veículos", warehouse_locations: "Locais de estoque",
  warehouses: "Depósitos", workflow: "Fluxos de aprovação",
};

export const ACTION_LABELS: Record<string, string> = {
  activate: "Ativar", adjust: "Ajustar", admin: "Administrar", allocate: "Alocar", approve: "Aprovar", assign: "Atribuir",
  authorize: "Autorizar", calculate: "Calcular", cancel: "Cancelar", close: "Fechar", complete: "Concluir", configure: "Configurar",
  confirm: "Confirmar", consume: "Consumir", consume_materials: "Consumir materiais", consume_parts: "Consumir peças", convert: "Converter",
  count: "Contar", create: "Criar", delete: "Excluir", execute: "Executar", export: "Exportar", fail: "Registrar falha", finalize: "Finalizar",
  import: "Importar", manage: "Administrar", manage_costs: "Gerir custos", move_stage: "Mover etapa", "period.manage": "Gerir período",
  quarantine: "Quarentena", read: "Ler", ready: "Marcar como pronto", record_result: "Registrar resultado", reject: "Rejeitar",
  release: "Liberar", reopen: "Reabrir", reprocess: "Reprocessar", request: "Solicitar", reserve: "Reservar", return: "Devolver",
  reverse: "Estornar", ship: "Expedir", start: "Iniciar", submit_authorization: "Enviar para autorização", transfer: "Transferir",
  transition: "Mudar etapa", update: "Editar", view: "Consultar",
};

const humanize = (code: string) => {
  const text = code.replace(/[_.]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const resourceLabel = (code: string) => RESOURCE_LABELS[code] ?? humanize(code);
/** O nome do catálogo vale quando já está em português; senão, o mapa local. */
export const actionLabel = (code: string, catalogName?: string | null) =>
  ACTION_LABELS[code] ?? (catalogName && catalogName !== code ? catalogName : humanize(code));
