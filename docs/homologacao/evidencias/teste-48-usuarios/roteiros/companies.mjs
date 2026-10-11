// Rodada "48 usuários · 7 empresas". Tudo fictício: CNPJ/CPF gerados com
// dígitos verificadores válidos a partir de uma semente fixa, e-mails no
// domínio reservado .test, endereços genéricos. Empresas NOVAS (a rodada
// anterior e a Órbita da homologação ficam intactas).

let seed = 20261002;
export const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const digits = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 10));
function dv(nums, weights) {
  const s = nums.reduce((a, n, i) => a + n * weights[i], 0) % 11;
  return s < 2 ? 0 : 11 - s;
}
export function cnpj(branch = "0001") {
  const b = [...digits(8), ...branch.split("").map(Number)];
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...b, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...b, d1, d2].join("");
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
export function cpf() {
  let b;
  do b = digits(9); while (new Set(b).size === 1);
  const d1 = dv(b, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv([...b, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const s = [...b, d1, d2].join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ------------------------------------------------------------ papéis personalizados
const READ_BASE = ["dashboard.view", "customers.read", "products.read", "suppliers.read", "warehouses.read", "warehouse_locations.read", "sales_orders.view", "payment_terms.view", "reports.view", "units.read", "categories.read", "brands.read"];
export const CUSTOM_ROLES = {
  financeiro: {
    code: "FINANCEIRO", name: "Financeiro", description: "Contas a receber e a pagar, recebimentos, pagamentos e conciliação.",
    permissions: [...READ_BASE,
      "accounts_receivable.view", "accounts_receivable.create", "accounts_receivable.update", "accounts_receivable.approve", "accounts_receivable.cancel",
      "accounts_payable.view", "accounts_payable.create", "accounts_payable.update", "accounts_payable.approve", "accounts_payable.cancel",
      "receipts.view", "receipts.create", "receipts.cancel", "receipts.reverse", "payments.view", "payments.create", "payments.cancel", "payments.reverse",
      "financial_accounts.view", "financial_accounts.create", "financial_accounts.update", "financial_categories.view", "financial_categories.create", "financial_categories.update",
      "financial_transactions.view", "financial_transactions.create", "bank_reconciliation.view", "bank_reconciliation.create", "bank_reconciliation.update",
      "financial_reports.view", "cost_centers.view"],
  },
  fiscal: {
    code: "FISCAL", name: "Fiscal", description: "Documentos fiscais, NCM, CFOP, naturezas de operação e perfis fiscais.",
    permissions: [...READ_BASE,
      "fiscal_documents.view", "fiscal_documents.create", "fiscal_documents.update", "fiscal_documents.calculate", "fiscal_documents.ready", "fiscal_documents.submit_authorization", "fiscal_documents.authorize", "fiscal_documents.cancel",
      "fiscal_document_events.view", "fiscal_document_events.create", "fiscal_document_files.view", "fiscal_document_packages.view", "fiscal_document_references.view",
      "fiscal_establishments.view", "fiscal_establishments.create", "fiscal_establishments.update",
      "fiscal_operation_natures.view", "fiscal_operation_natures.create", "fiscal_operation_natures.update",
      "fiscal_cfops.view", "fiscal_cfops.create", "fiscal_cfops.update", "fiscal_ncms.view", "fiscal_ncms.create", "fiscal_ncms.update",
      "fiscal_tax_codes.view", "product_fiscal_profiles.view", "product_fiscal_profiles.create", "product_fiscal_profiles.update",
      "tax_rules.view", "fiscal_reports.view", "fiscal_provider_configs.view"],
  },
  logistica: {
    code: "LOGISTICA", name: "Logística", description: "Estoque, reservas, separação, expedição e entregas.",
    permissions: [...READ_BASE,
      "stock.view", "stock.create", "stock.transfer", "stock.count", "stock.request", "sales_orders.reserve",
      "pick_lists.view", "pick_lists.create", "pick_lists.update", "pick_lists.complete", "pick_lists.cancel",
      "shipments.view", "shipments.create", "shipments.update", "shipments.ship", "shipments.approve", "shipments.cancel",
      "deliveries.view", "deliveries.create", "deliveries.update", "deliveries.confirm", "deliveries.fail",
      "carriers.read", "drivers.read", "vehicles.read", "warehouse_locations.create", "warehouse_locations.update",
      "logistics_reports.view", "inventory_reports.view", "purchase_receipts.view", "purchase_receipts.confirm"],
  },
  compras: {
    code: "COMPRAS", name: "Compras", description: "Solicitações, cotações e pedidos de compra; acompanha recebimentos. Não aprova.",
    permissions: [...READ_BASE,
      "suppliers.create", "suppliers.update", "stock.view",
      "purchase_requests.view", "purchase_requests.create", "purchase_requests.update",
      "purchase_quotes.view", "purchase_quotes.create", "purchase_quotes.update",
      "purchase_orders.view", "purchase_orders.create", "purchase_orders.update",
      "purchase_receipts.view", "purchase_reports.view", "inventory_reports.view"],
  },
};
export const ROLE_LABEL = { admin: "Administrador", gerente: "Gerente", vendedor: "Vendedor", operador: "Operador", financeiro: "Financeiro", fiscal: "Fiscal", logistica: "Logística", compras: "Compras", leitura: "Somente leitura" };
export const SYSTEM_ROLE_CODE = { admin: "admin", gerente: "manager", vendedor: "seller", operador: "operator", leitura: "readonly" };

// ------------------------------------------------------------ segmentos
const SEGMENTS = {
  distribuidora: { ncm: "39249000", cats: ["Utilidades", "Organização", "Limpeza", "Embalagens"], items: [["Caixa organizadora", ["10 L", "20 L", "40 L"], 29.9], ["Pote hermético", ["500 ml", "1 L", "2 L"], 14.5], ["Balde plástico", ["8 L", "12 L", "20 L"], 18.9], ["Cesto multiuso", ["P", "M", "G"], 22.0], ["Lixeira com pedal", ["15 L", "30 L"], 64.0], ["Filme stretch", ["500 mm"], 72.0], ["Saco para lixo", ["50 L", "100 L"], 21.0]] },
  industria: { ncm: "73181500", cats: ["Fixação", "Chapas", "Componentes", "Matéria-prima"], items: [["Parafuso sextavado", ["M6", "M8", "M10"], 0.85], ["Porca sextavada", ["M6", "M8"], 0.35], ["Chapa de aço", ["1 mm", "2 mm"], 189.0], ["Suporte em L", ["50 mm", "80 mm"], 7.4], ["Eixo retificado", ["20 mm"], 58.0], ["Perfil U", ["2 m", "3 m"], 96.0], ["Bobina de aço", ["0,5 mm"], 1240.0]] },
  varejo: { ncm: "61091000", cats: ["Vestuário", "Calçados", "Acessórios", "Casa"], items: [["Camiseta básica", ["P", "M", "G", "GG"], 49.9], ["Bermuda sarja", ["38", "40", "42"], 119.0], ["Tênis casual", ["38", "40", "42"], 229.0], ["Boné", ["único"], 59.9], ["Mochila urbana", ["20 L"], 179.0], ["Garrafa térmica", ["500 ml", "1 L"], 69.9], ["Meia", ["kit 3"], 29.9]] },
  servicos: { ncm: "34022000", cats: ["Limpeza", "Higiene", "Descartáveis", "Equipamentos"], items: [["Detergente neutro", ["5 L"], 24.9], ["Desinfetante", ["5 L"], 22.5], ["Papel toalha", ["interfolha"], 18.9], ["Sabonete líquido", ["5 L"], 39.9], ["Luva de limpeza", ["P", "M", "G"], 5.9], ["Mop úmido", ["refil"], 34.0]] },
  atacado: { ncm: "44152000", cats: ["Paletes", "Embalagens", "Movimentação", "Sinalização"], items: [["Palete de madeira", ["PBR", "descartável"], 64.0], ["Caixa de papelão", ["P", "M", "G", "GG"], 3.9], ["Fita adesiva", ["45 mm", "48 mm"], 6.5], ["Etiqueta térmica", ["100x150"], 38.0], ["Paleteira manual", ["2.500 kg"], 1890.0], ["Cinta de amarração", ["5 m", "9 m"], 42.0], ["Lacre plástico", ["numerado"], 0.45]] },
  especializado: { ncm: "90183119", cats: ["Descartáveis", "EPI", "Curativos", "Instrumentais", "Diagnóstico", "Higienização"], items: [["Seringa descartável", ["1 ml", "3 ml", "5 ml", "10 ml", "20 ml"], 0.48], ["Agulha hipodérmica", ["25x7", "30x8", "40x12"], 0.19], ["Luva de procedimento", ["P", "M", "G"], 28.9], ["Máscara cirúrgica", ["tripla", "N95"], 19.9], ["Gaze estéril", ["7,5x7,5", "10x10"], 12.5], ["Atadura de crepom", ["10 cm", "15 cm", "20 cm"], 2.4], ["Equipo macrogotas", ["simples", "fotossensível"], 3.1], ["Cateter intravenoso", ["20G", "22G", "24G"], 2.9], ["Esparadrapo", ["10 cm", "5 cm"], 8.7], ["Álcool 70%", ["1 L", "5 L"], 11.9], ["Avental descartável", ["manga longa", "manga curta"], 4.6], ["Touca descartável", ["sanfonada"], 0.35], ["Termômetro digital", ["axilar", "infravermelho"], 39.0], ["Oxímetro de dedo", ["adulto", "pediátrico"], 89.0], ["Tesoura cirúrgica", ["reta", "curva"], 45.0], ["Pinça anatômica", ["14 cm", "16 cm"], 22.0], ["Abaixador de língua", ["pacote 100"], 9.9], ["Coletor perfurocortante", ["3 L", "7 L", "13 L"], 7.5]] },
  hibrida: { ncm: "84713012", cats: ["Notebooks", "Periféricos", "Rede", "Acessórios"], items: [["Notebook corporativo", ["14\"", "15\""], 4890.0], ["Monitor LED", ["22\"", "24\""], 899.0], ["Teclado USB", ["ABNT2"], 79.9], ["Mouse óptico", ["USB", "sem fio"], 49.9], ["Switch gerenciável", ["8 portas"], 1290.0], ["Cabo de rede", ["1,5 m", "3 m"], 12.9], ["Headset", ["USB"], 189.0], ["Nobreak", ["600 VA"], 749.0]] },
};

// ------------------------------------------------------------ empresas e usuários (48)
// roles: lista de papéis por empresa (o administrador é o primeiro).
export const COMPANIES = [
  { key: "cobalto", n: "01", name: "Cobalto Distribuidora", legalName: "COBALTO DISTRIBUIDORA DE UTILIDADES LTDA.", profile: "Distribuidora — comercial e distribuição", segment: "distribuidora", domain: "cobaltodistribuidora.test", prefix: "CB", city: "Campinas", state: "SP", productsMax: 18, customersN: 14,
    roles: ["admin", "gerente", "vendedor", "vendedor", "operador", "financeiro", "logistica", "compras"] },
  { key: "ferrix", n: "02", name: "Ferrix Indústria", legalName: "FERRIX INDÚSTRIA METALÚRGICA LTDA.", profile: "Indústria — produção, estoque e compras", segment: "industria", domain: "ferrixindustria.test", prefix: "FX", city: "Joinville", state: "SC", productsMax: 14, customersN: 8,
    roles: ["admin", "gerente", "operador", "operador", "compras", "fiscal", "financeiro"] },
  { key: "mares", n: "03", name: "Mares Varejo", legalName: "MARES VAREJO DE MODA LTDA.", profile: "Varejo — muitos clientes e vendas", segment: "varejo", domain: "maresvarejo.test", prefix: "MV", city: "Salvador", state: "BA", productsMax: 18, customersN: 24,
    roles: ["admin", "gerente", "vendedor", "vendedor", "vendedor", "operador", "financeiro", "leitura"] },
  { key: "prisma", n: "04", name: "Prisma Serviços", legalName: "PRISMA SERVIÇOS ADMINISTRATIVOS LTDA.", profile: "Serviços — operação administrativa e financeira", segment: "servicos", domain: "prismaservicos.test", prefix: "PS", city: "Recife", state: "PE", productsMax: 8, customersN: 10,
    roles: ["admin", "gerente", "financeiro", "financeiro", "leitura"] },
  { key: "sertao", n: "05", name: "Sertão Atacado", legalName: "SERTÃO ATACADO E LOGÍSTICA LTDA.", profile: "Atacado — pedidos grandes e logística", segment: "atacado", domain: "sertaoatacado.test", prefix: "SA", city: "Cajamar", state: "SP", productsMax: 14, customersN: 10,
    roles: ["admin", "gerente", "vendedor", "operador", "logistica", "logistica", "fiscal"] },
  { key: "lince", n: "06", name: "Lince Especialidades", legalName: "LINCE ESPECIALIDADES HOSPITALARES LTDA.", profile: "Comércio especializado — catálogo amplo", segment: "especializado", domain: "linceespecialidades.test", prefix: "LE", city: "Curitiba", state: "PR", productsMax: 60, customersN: 12,
    roles: ["admin", "gerente", "vendedor", "operador", "compras", "fiscal"] },
  { key: "vertice", n: "07", name: "Vértice Operações", legalName: "VÉRTICE OPERAÇÕES INTEGRADAS LTDA.", profile: "Operação híbrida — comercial, estoque, financeiro e logística", segment: "hibrida", domain: "verticeoperacoes.test", prefix: "VO", city: "Belo Horizonte", state: "MG", productsMax: 16, customersN: 12,
    roles: ["admin", "gerente", "vendedor", "operador", "financeiro", "fiscal", "logistica"] },
];

const FIRST = ["Alícia", "Bernardo", "Cecília", "Davi", "Elaine", "Fábio", "Giovana", "Heitor", "Iara", "Joaquim", "Kátia", "Lauro", "Mônica", "Nelson", "Olga", "Paulo", "Quitéria", "Ricardo", "Silvia", "Tadeu", "Úrsula", "Valter", "Wanda", "Xavier", "Yara", "Zeca", "Amanda", "Breno", "Cíntia", "Danilo", "Érica", "Flávio", "Graça", "Hélio", "Ingrid", "Jonas", "Kelly", "Lúcio", "Maísa", "Nilo", "Odete", "Plínio", "Raquel", "Sérgio", "Telma", "Vânia", "Wilson", "Zilda"];
const LAST = ["Albuquerque", "Bezerra", "Coutinho", "Duarte", "Evangelista", "Figueira", "Gusmão", "Hipólito", "Ibiapina", "Jardim", "Kuster", "Linhares", "Medeiros", "Nóbrega", "Oliveira", "Pimentel", "Quintela", "Rangel", "Sales", "Tavares", "Uchoa", "Vasconcelos", "Werneck", "Zanetti"];
const CUSTOMER_WORDS = ["Aurora", "Boreal", "Cedro", "Delta", "Estrela", "Ferrovia", "Granito", "Horto", "Ipê", "Jade", "Lago", "Monte", "Norte", "Oásis", "Pinheiro", "Quartzo", "Rio Claro", "Sertão Verde", "Trilha", "Vale Verde", "Zênite", "Atol", "Brisa", "Coral", "Duna", "Eixo"];
const SUPPLIER_WORDS = ["Polar", "Acácia", "Bússola", "Cometa", "Farol", "Gávea", "Íris"];
const CITY_BY_STATE = { SP: ["Campinas", "Sorocaba", "Jundiaí", "Santos"], SC: ["Joinville", "Blumenau", "Itajaí"], MG: ["Belo Horizonte", "Contagem", "Uberlândia"], PR: ["Curitiba", "Londrina", "Maringá"], BA: ["Salvador", "Feira de Santana", "Camaçari"], PE: ["Recife", "Olinda", "Caruaru"] };

let nameIx = 0;
for (const [ci, c] of COMPANIES.entries()) {
  c.document = cnpj();
  c.email = `contato@${c.domain}`;
  c.phone = "(00) 0000-0000";
  c.address = "Avenida Fictícia, 200 — dado de teste";
  c.zipCode = "00000-000";
  const count = {};
  c.people = c.roles.map((role) => {
    count[role] = (count[role] ?? 0) + 1;
    const local = { admin: "admin", gerente: "gerente", vendedor: "vendas", operador: "operacao", financeiro: "financeiro", fiscal: "fiscal", logistica: "logistica", compras: "compras", leitura: "consulta" }[role];
    const name = `${FIRST[nameIx % FIRST.length]} ${LAST[(nameIx * 5 + ci) % LAST.length]}`;
    nameIx++;
    return { key: `${role}${count[role]}`, role, email: `${local}${count[role] > 1 || c.roles.filter((r) => r === role).length > 1 ? count[role] : ""}@${c.domain}`, name };
  });
  c.admin = c.people[0];
  c.users = c.people.slice(1);
  const seg = SEGMENTS[c.segment];
  c.ncm = seg.ncm;
  c.categories = seg.cats;
  c.products = [];
  let k = 1;
  for (const [base, vars, price] of seg.items) for (const v of vars) {
    if (c.products.length >= c.productsMax) break;
    const p = Math.round(price * (0.85 + rnd() * 0.4) * 100) / 100;
    c.products.push({ code: `${c.prefix}-${String(k).padStart(3, "0")}`, description: `${base} ${v}`, category: seg.cats[(k - 1) % seg.cats.length], price: p, cost: Math.round(p * 0.58 * 100) / 100, minStock: 10 });
    k++;
  }
  const cities = CITY_BY_STATE[c.state];
  c.customers = [];
  for (let i = 0; i < c.customersN; i++) {
    const pf = i >= c.customersN - 3;
    const w = CUSTOMER_WORDS[(i + ci * 3) % CUSTOMER_WORDS.length];
    c.customers.push(pf
      ? { tipo: "Pessoa Física", nome: `${FIRST[(i * 7 + ci) % FIRST.length]} ${LAST[(i * 11 + ci) % LAST.length]} (cliente fictício)`, documento: cpf(), cidade: pick(cities), estado: c.state }
      : { tipo: "Pessoa Jurídica", nome: `${w} ${["Comércio", "Serviços", "Atacado", "Indústria", "Varejo"][i % 5]} ${c.prefix} ${i + 1} Ltda.`, nomeFantasia: `${w} ${c.prefix}`, documento: cnpj(), cidade: pick(cities), estado: c.state, email: `compras.${i + 1}@cliente-${c.prefix.toLowerCase()}.test`, limiteCredito: 5000 + Math.floor(rnd() * 20) * 1000 });
  }
  c.suppliers = SUPPLIER_WORDS.slice(0, 5).map((w, i) => ({ tipo: "Pessoa Jurídica", razaoSocial: `${w} Fornecimentos ${c.prefix} Ltda.`, nomeFantasia: `${w} ${c.prefix}`, documento: cnpj(), cidade: pick(cities), estado: c.state, email: `vendas.${i + 1}@fornecedor-${c.prefix.toLowerCase()}.test`, prazoMedioEntrega: 3 + i }));
}
export const byKey = Object.fromEntries(COMPANIES.map((c) => [c.key, c]));
export const ALL_PEOPLE = COMPANIES.flatMap((c) => c.people.map((p) => ({ ...p, company: c })));
