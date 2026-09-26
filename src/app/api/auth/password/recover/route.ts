import { neonRecoverPassword } from "@/lib/auth/neon/handlers";

// "Esqueci minha senha" com AUTH_PROVIDER=neon (404 com o Supabase Auth).
export const POST = neonRecoverPassword;
