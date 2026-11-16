// Interface mínima do cliente de dados (supabase-js ou o adaptador pg do
// repositório): só RPC. Mantém os módulos da integração testáveis com
// qualquer implementação (PGlite nos testes).
export type RpcError = { message: string; code?: string };
export type RpcResult<T = unknown> = { data: T | null; error: RpcError | null };
export type OrionDb = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult> };

export type HeaderReader = { get(name: string): string | null };

export type HandlerResult = { status: number; body: unknown };

export type IntegrationSecretsRow = {
  company_id: string;
  status: string;
  orion_url: string;
  orion_company_id: string | null;
  key_id: string;
  secret_ciphertext_b64: string;
  previous_secret_ciphertext_b64: string | null;
};
