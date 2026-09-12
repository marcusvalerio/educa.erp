// CATEGORIAS_PRODUTO/SUBCATEGORIAS_PRODUTO/UNIDADES_PRODUTO (arrays
// hardcoded) foram removidas na Fase 2 — Produtos usa dados reais de
// product_categories/product_brands/units agora (ver
// src/components/produtos/ProdutosPage.tsx e docs/CATALOGO.md).

export const TIPOS_PESSOA = ["Pessoa Física", "Pessoa Jurídica"] as const;

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
