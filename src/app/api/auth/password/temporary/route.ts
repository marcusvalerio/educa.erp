import { changeTemporaryPassword } from "@/lib/auth/temporary-password-handlers";

// Primeiro acesso com senha provisória: troca obrigatória antes da sessão.
export const POST = changeTemporaryPassword;
