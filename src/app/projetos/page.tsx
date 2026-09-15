import { ModuleLanding } from "@/components/ModuleLanding";

export default function Page() {
  return (
    <ModuleLanding
      label="Projetos e Serviços"
      description="Projetos, tarefas, apontamentos operacionais e ordens de serviço."
      items={[
        { label: "Projetos", href: "/projetos/lista", description: "Projetos com cliente, orçamento e cronograma." },
        { label: "Tarefas", href: "/projetos/tarefas", description: "Tarefas com hierarquia e prioridade." },
        { label: "Apontamentos", href: "/projetos/apontamentos", description: "Apontamento operacional de horas — não é RH." },
        { label: "Ordens de serviço", href: "/projetos/ordens-servico", description: "Da abertura à conclusão, com consumo de material." },
      ]}
    />
  );
}
