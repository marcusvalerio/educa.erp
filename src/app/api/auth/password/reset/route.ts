import { neonResetPassword } from "@/lib/auth/neon/handlers";

// Nova senha pelo link do Neon Auth (primeiro acesso e recuperação).
export const POST = neonResetPassword;
