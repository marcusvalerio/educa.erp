import { ModuleLanding } from "@/components/ModuleLanding";

export default function Page() {
  return (
    <ModuleLanding
      label="CRM"
      description="Leads, pipeline de oportunidades e atividades comerciais."
      items={[
        { label: "Leads", href: "/crm/leads", description: "Captação e qualificação de leads." },
        { label: "Pipeline", href: "/crm/pipeline", description: "Visão Kanban das oportunidades abertas por estágio." },
        { label: "Oportunidades", href: "/crm/oportunidades", description: "Lista de oportunidades com valor, probabilidade e previsão." },
        { label: "Atividades", href: "/crm/atividades", description: "Histórico de ligações, reuniões e follow-ups." },
      ]}
    />
  );
}
