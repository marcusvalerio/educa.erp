// Links de convite enviados pelo Supabase Auth (auth.admin.inviteUserByEmail)
// chegam com a sessão no fragmento da URL (#access_token=...&type=invite).
// O cliente do navegador usa PKCE e não aceita esse formato sozinho — por
// isso a página que recebe o link lê o fragmento explicitamente, instala a
// sessão e APAGA o fragmento da barra de endereço (o token não fica no
// histórico nem em capturas de tela).

export type AuthHash =
  | { kind: "session"; accessToken: string; refreshToken: string; type: string | null }
  | { kind: "error"; message: string }
  | { kind: "none" };

export function parseAuthHash(hash: string): AuthHash {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return { kind: "none" };
  const params = new URLSearchParams(raw);
  if (params.get("error") || params.get("error_code") || params.get("error_description")) {
    const code = params.get("error_code") ?? "";
    return {
      kind: "error",
      message: /expired|otp_expired/i.test(code + (params.get("error_description") ?? ""))
        ? "O link de acesso expirou ou já foi usado. Peça um novo ao administrador."
        : "Não foi possível validar o link de acesso. Peça um novo ao administrador.",
    };
  }
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken, type: params.get("type") };
  return { kind: "none" };
}

type AuthLike = {
  auth: {
    setSession: (s: { access_token: string; refresh_token: string }) => Promise<{ error: unknown }>;
  };
};

/** Instala a sessão do fragmento (se houver) e limpa a URL. Só no navegador. */
export async function consumeAuthHash(supabase: AuthLike): Promise<{ type: string | null; error: string | null }> {
  if (typeof window === "undefined") return { type: null, error: null };
  const parsed = parseAuthHash(window.location.hash);
  if (parsed.kind === "none") return { type: null, error: null };
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (parsed.kind === "error") return { type: null, error: parsed.message };
  const { error } = await supabase.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
  return error ? { type: null, error: "Não foi possível validar o link de acesso. Peça um novo ao administrador." } : { type: parsed.type, error: null };
}
