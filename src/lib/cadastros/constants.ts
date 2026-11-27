export const CATEGORIAS_PRODUTO = [
  "Matéria-prima",
  "Material de almoxarifado",
  "Material elétrico",
  "EPI",
  "Ferramentas",
  "Químicos",
  "Líquidos",
  "Embalagens",
  "Produto acabado",
] as const;

export const SUBCATEGORIAS_PRODUTO = [
  "Geral",
  "Importado",
  "Nacional",
  "Linha industrial",
  "Linha leve",
  "Consumível",
] as const;

export const UNIDADES_PRODUTO = ["UN", "PC", "PAR", "KIT", "CX", "PCT", "FD", "PAL", "KG", "G", "T", "L", "ML", "M", "CM", "RL"] as const;

export const TIPOS_PESSOA = ["Pessoa Física", "Pessoa Jurídica", "Estrangeiro"] as const;
// País (ISO 3166-1 alfa-2) — principais parceiros; "BR" = nacional.
export const PAISES = ["BR", "US", "CN", "AR", "CL", "UY", "PY", "MX", "CO", "PE", "DE", "IT", "ES", "PT", "FR", "GB", "NL", "JP", "KR", "IN", "CA"];
export const PAIS_NOMES: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", CN: "China", AR: "Argentina", CL: "Chile", UY: "Uruguai", PY: "Paraguai",
  MX: "México", CO: "Colômbia", PE: "Peru", DE: "Alemanha", IT: "Itália", ES: "Espanha", PT: "Portugal",
  FR: "França", GB: "Reino Unido", NL: "Países Baixos", JP: "Japão", KR: "Coreia do Sul", IN: "Índia", CA: "Canadá",
};
/** Rótulos "CN — China" para busca por nome; o valor continua sendo a sigla. */
export const PAISES_LABELS: Record<string, string> = Object.fromEntries(
  PAISES.map((sigla) => [sigla, `${sigla} — ${PAIS_NOMES[sigla] ?? sigla}`])
);
export const MOEDAS = ["BRL", "USD", "EUR", "CNY", "GBP", "ARS", "JPY"];

export const CONDICOES_PAGAMENTO = [
  "À vista",
  "7 dias",
  "14 dias",
  "28 dias",
  "30 dias",
  "30/60 dias",
  "30/60/90 dias",
] as const;

export const ESTADOS_UF = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export const CATEGORIAS_FORNECIMENTO = [
  "Matéria-prima",
  "Material elétrico",
  "Químicos",
  "Almoxarifado",
  "EPI",
  "Embalagens",
  "Serviços",
  "Outros",
] as const;

export const TIPOS_TRANSPORTE = ["Rodoviário", "Aéreo", "Marítimo", "Ferroviário", "Multimodal"] as const;

export const REGIOES_ATENDIMENTO = [
  "Sudeste",
  "Sul",
  "Nordeste",
  "Centro-Oeste",
  "Norte",
  "Nacional",
] as const;

export const CATEGORIAS_CNH = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"] as const;

export const TIPOS_VEICULO = [
  "Fiorino",
  "Van",
  "VUC",
  "Caminhão 3/4",
  "Toco",
  "Truck",
  "Carreta",
  "Bitrem",
  "Rodotrem",
] as const;

export const COMBUSTIVEIS = ["Diesel", "Gasolina", "Etanol", "Flex", "Elétrico", "GNV"] as const;

export const PERFIS_USUARIO_CADASTRO = [
  "Administrador",
  "Gestor",
  "Compras",
  "Recebimento",
  "Almoxarifado",
  "Expedição",
  "Comercial",
  "Financeiro",
  "Fiscal",
  "Consulta",
] as const;

export const DEPARTAMENTOS = [
  "Diretoria",
  "Operações",
  "Compras",
  "Comercial",
  "Financeiro",
  "Fiscal",
  "Logística",
  "TI",
] as const;

export const TIPOS_LOCAL_ESTOQUE = [
  "Recebimento",
  "Staging",
  "Armazenagem",
  "Picking",
  "Packing",
  "Expedição",
  "Quarentena",
  "Devolução",
  "Bloqueado",
] as const;

export const ARMAZENS = ["CD01", "CD02", "FIL03"] as const;

export const STATUS_OPTIONS = ["Ativo", "Inativo"] as const;
