import { issueTemporaryPassword, revokeTemporaryPassword } from "@/lib/auth/temporary-password-handlers";

// Senha provisória de um cadastro: gerar (mostrada uma vez) e revogar.
export const POST = issueTemporaryPassword;
export const DELETE = revokeTemporaryPassword;
