import { neonCurrentSession } from "@/lib/auth/neon/handlers";

// Sessão atual com AUTH_PROVIDER=neon (autenticado + e-mail; sem ids).
export const GET = neonCurrentSession;
export const dynamic = "force-dynamic";
