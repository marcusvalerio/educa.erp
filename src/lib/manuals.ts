/**
 * Manuais do ATLAS.ERP oferecidos dentro da aplicação (Configurações →
 * Documentação e Administração Central → Políticas).
 *
 * Fonte única: os PDFs versionados em docs/manual/pdf, publicados em
 * /landing/manuais/ por scripts/copy-landing-manuals.mjs no build. O app
 * aponta para esses mesmos arquivos — não há cópia nem segunda versão. A
 * landing não os oferece: os manuais pertencem ao produto.
 */
export type ManualId = "usuario" | "administracao";

export type Manual = {
  id: ManualId;
  title: string;
  description: string;
  /** Caminho público do PDF (o mesmo publicado pelo build). */
  href: string;
  /** Nome do arquivo em docs/manual/pdf. */
  file: string;
  audience: string;
};

export const MANUALS: readonly Manual[] = [
  {
    id: "usuario",
    title: "Manual do Usuário",
    description: "Uso diário por área: cadastros, comercial, estoque e logística, financeiro, fiscal, produção e os demais módulos.",
    href: "/landing/manuais/ATLAS-ERP-Manual-do-Usuario.pdf",
    file: "ATLAS-ERP-Manual-do-Usuario.pdf",
    audience: "Todos os usuários",
  },
  {
    id: "administracao",
    title: "Manual de Administração",
    description: "Administração da empresa e da plataforma: convites, papéis e permissões, unidades, módulos, auditoria e primeiro acesso.",
    href: "/landing/manuais/ATLAS-ERP-Manual-de-Administracao.pdf",
    file: "ATLAS-ERP-Manual-de-Administracao.pdf",
    audience: "Administradores da empresa e da plataforma",
  },
];

/** Permissões que identificam quem administra a empresa (papel Administrador). */
export const COMPANY_GOVERNANCE_PERMISSIONS = ["roles.manage", "users.create"] as const;

/**
 * Quais manuais cada pessoa vê. O Manual do Usuário é de todos; o de
 * Administração, de quem administra a empresa (convida usuários ou gerencia
 * papéis) e dos membros da Administração Central. O Gerente, sem governança,
 * vê só o do Usuário. Isto organiza a tela — os PDFs em si são públicos.
 */
export function manualsFor({ governsCompany, platformMember }: { governsCompany: boolean; platformMember: boolean }): Manual[] {
  return MANUALS.filter((m) => m.id === "usuario" || governsCompany || platformMember);
}
