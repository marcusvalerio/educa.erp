import { ModuleLanding } from "@/components/ModuleLanding";

export default function Page() {
  return (
    <ModuleLanding
      label="Qualidade"
      description="Checklists, inspeções, não conformidades e ações corretivas/preventivas."
      items={[
        { label: "Checklists", href: "/qualidade/checklists", description: "Critérios de inspeção por tipo." },
        { label: "Inspeções", href: "/qualidade/inspecoes", description: "Inspeções vinculadas a recebimento, produção, expedição e mais." },
        { label: "Não conformidades", href: "/qualidade/nao-conformidades", description: "Desvios identificados, da análise ao tratamento." },
        { label: "Ações", href: "/qualidade/acoes", description: "Ações corretivas e preventivas." },
      ]}
    />
  );
}
