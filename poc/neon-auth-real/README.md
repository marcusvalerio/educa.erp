# POC — Plano A com o Neon Auth REAL

Resultado: **53/53** (ponte + RLS/RBAC/multi-tenant com tokens emitidos
pelo Neon Auth gerenciado) e expiração real conferida. Detalhes e
evidências: `docs/NEON_AUTH_MIGRATION.md` §10.

- `probe/index.mjs` — Neon Function (sem dependências) implantada no
  projeto de teste `educa-neon-auth-test`. Executa um roteiro
  (`PROBE_PLAN`) contra `NEON_AUTH_BASE_URL` quando acionada pelo gatilho
  agendado da Neon e registra o resultado nos logs da função. Existe
  porque o ambiente de desenvolvimento não alcança `*.neon.tech`.
- `run-real.mjs` — recebe o JWKS público e os JWTs reais (arquivos fora do
  repositório) e roda a ponte real (`src/lib/auth/neon-bridge.ts`) contra a
  réplica local (PostgREST 53000 / Postgres 54322).

```bash
NEON_REAL_JWKS=… NEON_REAL_TOKENS=… NEON_REAL_ORIGIN=https://<ep>.neonauth.<região>.aws.neon.tech \
REPLICA_SERVICE_KEY=… REPLICA_JWT_SECRET=… REPLICA_PGPASS=… \
node --import tsx poc/neon-auth-real/run-real.mjs            # 53 verificações
node --import tsx poc/neon-auth-real/run-real.mjs --so-expiracao   # após exp
```

Nada aqui é usado pelo app, pelo build ou pelo `tsc` (`poc/` excluído).
