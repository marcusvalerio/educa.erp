export const EMPRESAS = [
  "Distribuidora Horizonte Ltda",
  "Comercial Andrade S.A.",
  "Grupo Metropolitano de Suprimentos",
  "Atacado Boa Vista",
  "Indústria Serra Azul",
  "Transportes Rio Verde",
  "Log Express Brasil",
  "Nordeste Suprimentos Ltda",
  "Padrão Comercial e Distribuição",
  "União Distribuição S.A.",
  "Vale Alimentos Ltda",
  "Central de Materiais SP",
  "Rede Sul Comércio",
  "Tech Parts Componentes",
  "AgroForte Insumos",
  "Metalúrgica Nova Era",
  "Construfácil Materiais",
  "Química Bandeirantes",
  "Embalagens Ipê",
  "Auto Peças Continental",
] as const;

export const TRANSPORTADORAS = [
  "Rota Express Transportes",
  "TransBrasil Logística",
  "Veloz Cargas e Encomendas",
  "Malha Sul Transportes",
  "ExpressoNacional Ltda",
  "Cargo Plus Logística",
  "TransAtlântico Distribuição",
  "Fronteira Transportes",
] as const;

export const PESSOAS = [
  "Carlos Eduardo Silva",
  "Fernanda Souza Lima",
  "Ricardo Almeida Costa",
  "Juliana Pereira Rocha",
  "Marcos Vinícius Santos",
  "Patrícia Gomes Ferreira",
  "André Luiz Barbosa",
  "Camila Rodrigues Dias",
  "Bruno Henrique Martins",
  "Larissa Cardoso Nunes",
  "Eduardo Nogueira Teixeira",
  "Aline Ribeiro Castro",
  "Rafael Correia Monteiro",
  "Débora Cristina Alves",
  "Thiago Moreira Pinto",
  "Vanessa Lopes Freitas",
] as const;

export const CIDADES = [
  "São Paulo/SP",
  "Campinas/SP",
  "Rio de Janeiro/RJ",
  "Curitiba/PR",
  "Porto Alegre/RS",
  "Belo Horizonte/MG",
  "Salvador/BA",
  "Recife/PE",
  "Fortaleza/CE",
  "Goiânia/GO",
  "Manaus/AM",
  "Vitória/ES",
  "Joinville/SC",
  "Ribeirão Preto/SP",
] as const;

export const PRODUTOS = [
  "Parafuso Sextavado M8",
  "Chapa de Aço Carbono 2mm",
  "Caixa de Papelão Ondulado",
  "Luva de Proteção EPI",
  "Cabo Elétrico 2,5mm",
  "Rolamento Industrial 6204",
  "Filme Stretch 500mm",
  "Sensor de Proximidade Indutivo",
  "Correia Transportadora PVC",
  "Palete PBR Padrão",
  "Óleo Lubrificante Industrial 20L",
  "Fita Adesiva Reforçada",
  "Motor Elétrico Trifásico 5CV",
  "Conector Terminal Elétrico",
  "Válvula Solenoide 1/2\"",
  "Etiqueta Térmica Adesiva",
  "Bateria Industrial 12V",
  "Tubo PVC Soldável 25mm",
  "Capacete de Segurança Classe A",
  "Balança Digital Industrial",
] as const;

export const CATEGORIAS_PRODUTO = [
  "Matéria-prima",
  "Embalagens",
  "Eletrônicos",
  "Ferramentas",
  "EPI",
  "Componentes",
  "Insumos Agrícolas",
  "Peças Automotivas",
  "Mobiliário",
  "Limpeza e Higiene",
] as const;

export const UNIDADES = ["UN", "CX", "KG", "L", "PC", "MT", "PAR", "ROL"] as const;

export const PERFIS_USUARIO = [
  "Administrador",
  "Operador de Logística",
  "Comprador",
  "Vendedor",
  "Financeiro",
  "Fiscal",
  "Gestor",
] as const;

export const MODELOS_VEICULO = [
  "VW Delivery 9.170",
  "Mercedes-Benz Atego 1719",
  "Volvo FH 460",
  "Iveco Daily 70C16",
  "Ford Cargo 1719",
  "Scania R 450",
  "Hyundai HR",
  "Fiorino Furgão",
] as const;

export const TIPOS_VEICULO = ["Truck", "Van", "Carreta", "Toco", "Utilitário", "Bitrem"] as const;

export const LOCAIS_ESTOQUE = [
  "CD São Paulo - Galpão 1",
  "CD São Paulo - Galpão 2",
  "CD Campinas",
  "CD Rio de Janeiro",
  "Filial Curitiba",
  "Armazém Externo A",
  "Área de Quarentena",
  "Doca de Expedição",
] as const;

export const CENTROS_CUSTO = [
  "Logística - Operação",
  "Comercial - Vendas",
  "Administrativo",
  "Suprimentos - Compras",
  "Manutenção de Frota",
  "TI e Sistemas",
  "Diretoria",
] as const;

export const NCM_LIST = [
  { codigo: "3926.90.90", descricao: "Outras obras de plástico" },
  { codigo: "7318.15.00", descricao: "Parafusos e porcas de ferro/aço" },
  { codigo: "8501.53.00", descricao: "Motores elétricos trifásicos" },
  { codigo: "4819.10.00", descricao: "Caixas e cartonagens de papel" },
  { codigo: "8482.10.10", descricao: "Rolamentos de esferas" },
  { codigo: "3920.10.99", descricao: "Filmes e chapas de polímeros" },
  { codigo: "6116.10.00", descricao: "Luvas de malha impregnadas" },
  { codigo: "8543.70.99", descricao: "Sensores e aparelhos elétricos" },
] as const;

export const CFOP_LIST = [
  { codigo: "5102", descricao: "Venda de mercadoria adquirida de terceiros" },
  { codigo: "6102", descricao: "Venda interestadual de mercadoria" },
  { codigo: "1102", descricao: "Compra para comercialização" },
  { codigo: "5949", descricao: "Outra saída de mercadoria não especificada" },
  { codigo: "5905", descricao: "Remessa para depósito fechado" },
  { codigo: "1949", descricao: "Outra entrada de mercadoria não especificada" },
  { codigo: "6905", descricao: "Remessa interestadual para depósito" },
] as const;

export const IMPOSTOS_LIST = [
  { nome: "ICMS", aliquota: "18%" },
  { nome: "IPI", aliquota: "5%" },
  { nome: "PIS", aliquota: "1,65%" },
  { nome: "COFINS", aliquota: "7,6%" },
  { nome: "ISS", aliquota: "3%" },
  { nome: "ICMS-ST", aliquota: "12%" },
] as const;

export const ACOES_AUDITORIA = [
  "Criação de registro",
  "Alteração de cadastro",
  "Exclusão de registro",
  "Aprovação de pedido",
  "Cancelamento",
  "Login no sistema",
  "Exportação de relatório",
  "Alteração de permissão",
] as const;
