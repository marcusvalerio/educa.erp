import { issueTemporaryPassword, revokeTemporaryPassword } from "@/lib/auth/temporary-password-handlers";

// Senha provisória (0095): gerar (POST) e revogar (DELETE).
export const POST = issueTemporaryPassword;
export const DELETE = revokeTemporaryPassword;
