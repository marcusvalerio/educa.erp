// Acesso ao Beta (/beta): lista de e-mails autorizados na variável de
// ambiente BETA_EMAILS (separados por vírgula, ponto e vírgula ou espaço).
// Lista vazia = beta fechado para todos. Só o servidor lê a variável.
// Não concede nada além de VER a moldura nova: dados e ações continuam
// sob as mesmas permissões e RLS do ERP.

export function parseBetaEmails(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isBetaAllowed(email: string | null | undefined, raw: string | undefined | null = process.env.BETA_EMAILS): boolean {
  if (!email) return false;
  return parseBetaEmails(raw).includes(email.trim().toLowerCase());
}
