import { ModuleLanding } from "@/components/ModuleLanding";

export default function Page() {
  return (
    <ModuleLanding
      label="Ativos"
      description="Cadastro de ativos, hierarquia, planos e ordens de manutenção. Ativo não é estoque."
      items={[
        { label: "Ativos", href: "/ativos/lista", description: "Cadastro de ativos físicos, com hierarquia de sub-ativos." },
        { label: "Categorias", href: "/ativos/categorias", description: "Classificação dos ativos." },
        { label: "Locais", href: "/ativos/locais", description: "Onde cada ativo está instalado." },
        { label: "Planos de manutenção", href: "/ativos/planos-manutencao", description: "Preventiva, corretiva e preditiva." },
        { label: "Ordens de manutenção", href: "/ativos/ordens-manutencao", description: "Da abertura à conclusão, com consumo de peças." },
      ]}
    />
  );
}
