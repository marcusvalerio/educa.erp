import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminAccessConfigured, createAdminClient } from "@/lib/supabase/admin";

// POST /api/landing/contato — contato deixado na landing (/nova). Público,
// sem sessão: grava só os campos abaixo, validados aqui e no banco (0125).
// Campo "website" é armadilha para robôs: preenchido, a resposta é ok e nada
// é gravado.

const schema = z
  .object({
    name: z.string().trim().min(2, "Informe o seu nome.").max(120),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(254),
    company: z.string().trim().max(160).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    monthlyRevenue: z.number().min(0).max(1e10).nullable().optional(),
    people: z.number().int().min(0).max(100000).nullable().optional(),
    monthlyLeak: z.number().min(0).max(1e10).nullable().optional(),
    maturityScore: z.number().int().min(0).max(100).nullable().optional(),
    pains: z.array(z.string().max(80)).max(10).optional().default([]),
    consent: z.literal(true, { message: "É preciso concordar com o contato." }),
    website: z.string().max(200).optional(),
  })
  .strict();

const ok = () => NextResponse.json({ success: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
const fail = (status: number, message: string) => NextResponse.json({ success: false, error: { message } }, { status });

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Não foi possível ler os dados enviados.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  if (d.website) return ok();
  if (!adminAccessConfigured()) return fail(503, "Não foi possível registrar agora. Tente novamente mais tarde.");

  const { error } = await createAdminClient()
    .from("landing_leads")
    .insert({
      name: d.name,
      email: d.email,
      company: d.company || null,
      phone: d.phone || null,
      monthly_revenue: d.monthlyRevenue ?? null,
      people: d.people ?? null,
      monthly_leak: d.monthlyLeak ?? null,
      maturity_score: d.maturityScore ?? null,
      pains: d.pains,
      consent: true,
      source: "nova",
      user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400) || null,
    });
  if (error) {
    console.error("[landing] contato não gravado:", error.message);
    return fail(500, "Não foi possível registrar agora. Tente novamente em instantes.");
  }
  return ok();
}
