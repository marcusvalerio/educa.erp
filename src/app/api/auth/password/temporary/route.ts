import { neonChangeTemporaryPassword } from "@/lib/auth/neon/handlers";

// Primeiro login com a senha provisória: cria a senha nova (troca obrigatória).
export const POST = neonChangeTemporaryPassword;
