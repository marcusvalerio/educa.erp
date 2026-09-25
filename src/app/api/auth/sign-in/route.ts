import { neonSignIn } from "@/lib/auth/neon/handlers";

// Login com AUTH_PROVIDER=neon (404 com o Supabase Auth). Ver src/lib/auth/neon/handlers.ts.
export const POST = neonSignIn;
