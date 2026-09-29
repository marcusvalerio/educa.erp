// Preparação da primeira NF-e (0078, fn_fiscal_setup_status): transforma as
// contagens reais da empresa em passos de orientação. Lógica pura, testada.

export type FiscalSetupStatus = {
  establishments: number;
  outbound_natures: number;
  outbound_natures_with_cfop: number;
  cfops: number;
  ncms: number;
  active_products: number;
  products_with_ncm: number;
};

export type FiscalSetupStep = {
  id: string;
  label: string;
  done: boolean;
  detail: string;
  /** Onde o usuário age; ausente quando o passo ainda não tem tela. */
  href?: string;
};

const NO_SCREEN = "Ainda sem tela de cadastro nesta versão — solicite ao administrador do sistema.";

export function fiscalSetupSteps(s: FiscalSetupStatus): FiscalSetupStep[] {
  return [
    {
      id: "establishment",
      label: "Estabelecimento emitente (CNPJ e regime tributário)",
      done: s.establishments > 0,
      detail: s.establishments > 0 ? `${s.establishments} cadastrado(s).` : `Nenhum cadastrado. ${NO_SCREEN}`,
    },
    {
      id: "cfop",
      label: "CFOP das operações de venda",
      done: s.cfops > 0,
      detail: s.cfops > 0 ? `${s.cfops} CFOP cadastrado(s).` : `Nenhum CFOP cadastrado para a empresa. A lista de CFOP é só consulta: ${NO_SCREEN.charAt(0).toLowerCase()}${NO_SCREEN.slice(1)}`,
      href: "/app/fiscal/cfop",
    },
    {
      id: "nature",
      label: "Natureza de operação de saída com CFOP padrão",
      done: s.outbound_natures_with_cfop > 0,
      detail:
        s.outbound_natures === 0
          ? `Nenhuma natureza de saída. ${NO_SCREEN}`
          : s.outbound_natures_with_cfop === 0
            ? `${s.outbound_natures} natureza(s) de saída sem CFOP padrão: a NF-e do pedido precisa dele.`
            : `${s.outbound_natures_with_cfop} de ${s.outbound_natures} com CFOP padrão.`,
    },
    {
      id: "ncm",
      label: "NCM dos produtos vendidos",
      done: s.ncms > 0,
      detail: s.ncms > 0 ? `${s.ncms} NCM cadastrado(s).` : `Nenhum NCM cadastrado para a empresa. A lista de NCM é só consulta: ${NO_SCREEN.charAt(0).toLowerCase()}${NO_SCREEN.slice(1)}`,
      href: "/app/fiscal/ncm",
    },
    {
      id: "products",
      label: "Produtos ativos com NCM no perfil fiscal",
      done: s.active_products > 0 && s.products_with_ncm >= s.active_products,
      detail:
        s.active_products === 0
          ? "Nenhum produto ativo."
          : `${s.products_with_ncm} de ${s.active_products} produto(s) com NCM no perfil fiscal. A NF-e usa o NCM do perfil fiscal do produto (não o campo NCM do cadastro), e o perfil ${NO_SCREEN.charAt(0).toLowerCase()}${NO_SCREEN.slice(1)}`,
    },
  ];
}
