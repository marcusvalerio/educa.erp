"use client";

import { Ban, Building2, Eye, FileClock, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useSession } from "@/components/shell/SessionProvider";

// Políticas de governança da plataforma. São regras garantidas pelo
// banco (RLS, has_permission sem bypass de plataforma, triggers de
// proteção), descritas aqui para quem opera a Administração Central.
const POLICIES = [
  { icon: Building2, title: "Isolamento entre empresas", text: "Cada empresa só enxerga os próprios dados. As permissões da plataforma não dão acesso a pedidos, estoque, financeiro ou cadastros de nenhuma empresa." },
  { icon: Ban, title: "Sem acesso como empresa", text: "Não existe impersonation, “entrar como empresa” nem modo de suporte com acesso aos dados de um cliente." },
  { icon: UserCog, title: "Hierarquia de membros", text: "Admins gerenciam apenas Admins. Owners são geridos somente por Owners, e o último Owner ativo não pode ser removido ou rebaixado." },
  { icon: ShieldCheck, title: "Contratação × habilitação", text: "A plataforma decide quais módulos cada empresa contrata; a própria empresa decide quais módulos contratados ficam habilitados. Módulos essenciais não são desligados." },
  { icon: FileClock, title: "Auditoria", text: "Mudanças de ciclo de vida, contratos de módulo e membros são registradas na auditoria da plataforma, separada da auditoria das empresas." },
  { icon: Eye, title: "Visibilidade do cadastro", text: "A plataforma identifica cada empresa pelo seu perfil SaaS (código, ciclo de vida, plano). Nome e documento pertencem ao cadastro da empresa." },
];

export default function PlatformPoliciesPage() {
  const { data } = useSession();
  const platform = data?.platform;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Políticas" description="Regras de governança da plataforma EDUCA, garantidas pelo banco de dados." />
      <Panel>
        <PanelHeader title="Seu acesso" />
        <dl className="grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Membro</dt>
          <dd>{platform?.name ?? platform?.email ?? "—"}</dd>
          <dt className="text-muted-foreground">Papel</dt>
          <dd>{platform ? <StatusBadge entity="platform_role" status={platform.role} /> : "—"}</dd>
          <dt className="text-muted-foreground">Permissões</dt>
          <dd className="tabular-nums">{platform?.permissions.length ?? 0}</dd>
        </dl>
      </Panel>
      <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-2">
        {POLICIES.map((policy) => {
          const Icon = policy.icon;
          return (
            <li key={policy.title} className="flex gap-3 bg-surface p-4">
              <Icon size={18} className="mt-0.5 shrink-0 text-subtle-foreground" aria-hidden />
              <div>
                <h2 className="text-sm font-semibold">{policy.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{policy.text}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
