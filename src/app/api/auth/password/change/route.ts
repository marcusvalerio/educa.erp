import { changeOwnPassword } from "@/lib/auth/change-password-handlers";

// Troca de senha com o usuário logado (confere a senha atual).
export const POST = changeOwnPassword;
