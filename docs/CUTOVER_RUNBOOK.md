# EDUCA.ERP — Runbook de cutover Supabase → Neon

Arquitetura final: **Neon Auth → Next.js → PostgreSQL Neon**. RLS, RBAC, funções e
gatilhos continuam no banco. Não há ponte JWT: com `DATA_BACKEND=postgres` o
servidor fixa papel e claims na própria transação (`src/lib/database/pg`), e
`SUPABASE_JWT_SECRET` não é lido. O Supabase Auth deixa de ser autoridade.

**Este runbook não foi executado.** O cutover só começa quando os portões A–E
abaixo estiverem verdes e o dono aprovar. Cada passo marcado 🔒 altera produção e
exige aprovação explícita na hora.

Referências: `docs/PRE_CUTOVER_CHECKLIST.md` (estado verificado de cada pré-condição),
`docs/SUPABASE_TO_NEON_AUDIT.md` (auditoria e estado),
`poc/neon-full/migrate/copy-data.sh` (cópia), `poc/neon-full/evidence/*`
(provas), `poc/neon-full/homolog/README.md` (homologação),
`docs/DEBITOS_PRE_EXISTENTES.md` (bugs anteriores à migração, fora do cutover).

## Recursos

| Recurso | Identificador |
|---|---|
| Supabase de produção (origem) | `bshvfsxapwwfntowdxyr` (sa-east-1, PG 17.6) |
| Neon de produção (destino) | projeto `educa-erp-prod` `old-butterfly-53570465` (aws-sa-east-1, PG 17.11), branch `main` `br-lively-darkness-b683lnw7`, endpoint `ep-rapid-hall-b6m1arxn`, banco **`educa`** (ICU en-US) |
| Neon Auth de produção | projeto `educa-auth-prod` `young-mode-67474663`, branch `main`, `https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth` (Owner já existe e já está vinculado) |
| Papel da app | `educa_app` (LOGIN NOINHERIT, só SET em anon/authenticated/service_role) |
| Ensaio de dados | branch `rehearsal-2-educa` `br-autumn-sunset-b6j8aw5a` |
| Homologação | branch `homolog` `br-icy-cell-b62lgh06` + Neon Auth em `authdb` |

## Portões A–E (todos verdes antes do passo 1)

| Portão | Critério | Estado em 2026-09-27 |
|---|---|---|
| A — Esquema | impressões digitais Neon `main` = Supabase (13 categorias + corpo das funções) | **PASS COM RESSALVA** (7 funções diferem só por linhas de comentário) |
| B — Dados | ensaio 173/173 tabelas + 43 sequences iguais; script testado | **PASS** no ensaio por MCP; `copy-data.sh` testado localmente, **NÃO EXECUTADO** contra Supabase→Neon (sem rede nem senha do Supabase) |
| C — Segurança | sondas sobre os dados migrados | **PASS** 56/56 |
| D — App | E2E local 210/210, `npm test` 719/719, 2 builds | **PASS** |
| E — Homologação | `homolog-e2e` verde contra o Preview | **BLOQUEADO**: o Preview da branch existe, mas está atrás da Vercel Authentication e sem as variáveis de homologação (`evidence/homolog-probe.md`) |

## Passos

### Preparação (sem janela)

1. **Congelar esquema.** Nenhuma migration no Supabase até o fim da janela. Rodar
   de novo as impressões digitais (categorias de `evidence/prod-schema-fingerprint.md`
   + `md5(prosrc)`) Supabase × Neon `main`. Divergência nova = parar.
2. **Confirmar os portões A–E** (tabela acima) e o horário da janela com o dono.
3. 🔒 **Neon Auth de produção** (Console, `educa-auth-prod`): `email_password.enabled`
   = **true** (hoje false: sem isso ninguém entra), `allow_sign_up` = **false** (hoje
   true), `allow_localhost` = false, trusted origins só com o domínio de produção,
   sem OAuth compartilhado. Remetente próprio de e-mail recomendado (hoje é o
   compartilhado do Neon).
4. 🔒 **Senha do `educa_app`** em `main` (Console → Roles → Reset). A string
   **pooled** (`…-pooler…/educa?sslmode=require`) vai só para a variável de
   Produção da Vercel. Nunca para o Git, chat ou log.
5. 🔒 **Região das funções da Vercel** = `gru1` (São Paulo), a mesma do banco. **Hoje
   está em `iad1` (Washington)**, conforme a sonda de 2026-09-27. Settings → Functions.
6. 🔒 **Backup do Supabase:** `pg_dump -Fc` de produção guardado fora do Git (com a
   senha do banco, pelo dono). Anotar o horário para PITR.
7. **Backup do Neon:** branch `pre-cutover` a partir de `main` (esquema vazio de
   dados, ponto de volta do destino).
8. **Aviso aos usuários** (hoje só o Owner acessa) com janela e duração estimada
   (≤ 30 min).

### Janela

9. 🔒 **Congelar escrita:** modo manutenção na Vercel e, no Supabase,
   `alter role authenticator set default_transaction_read_only = on;` seguido de
   `select pg_terminate_backend(pid) from pg_stat_activity where usename = 'authenticator';`.
10. **Confirmar que não há escrita:** repetir `table-hashes.sql` duas vezes com 1 min
    de intervalo; os resultados têm que ser iguais.
11. **Fotografar a origem:** guardar a saída de `table-hashes.sql` e as sequences
    (evidência T0).
12. 🔒 **Copiar os dados:**
    `SOURCE_URL=<Supabase, sessão> TARGET_URL=<Neon main, neondb_owner, banco educa> CONFIRM_TARGET=ep-rapid-hall-b6m1arxn poc/neon-full/migrate/copy-data.sh`
    (uma transação no destino. Qualquer erro desfaz tudo).
13. **Conferir a cópia:** saída `DADOS IGUAIS: 173 tabelas …, 43 sequences` e
    `gatilhos_desligados = 0`.
14. **Integridade:** 567 FKs recriadas (a recriação valida), `customers_segment_check`
    continua `NOT VALID` como em produção, cadeia do Owner (`auth.users` →
    `platform_members` OWNER → `auth_identity_links` → usuário `33e3fb0b…` no Neon Auth).
15. **Sondas de segurança** numa branch filha de `main` (a bateria de
    `evidence/rehearsal-data.md` §Segurança). Esperado 56/56. Apagar a branch depois,
    com aprovação.
16. 🔒 **Variáveis de Produção na Vercel:** `AUTH_PROVIDER=neon`,
    `DATA_BACKEND=postgres`, `DATABASE_URL` (passo 4), `DATABASE_POOL_MAX=5`,
    `NEON_AUTH_BASE_URL` (Neon Auth de produção), `NEON_AUTH_SERVICE_EMAIL/PASSWORD`,
    `APP_URL`. **Remover** `SUPABASE_JWT_SECRET`, se existir. As demais `SUPABASE_*`
    ficam durante a janela de volta (não são lidas no modo postgres) e saem no passo 27.
17. 🔒 **Deploy de produção** (redeploy com as variáveis novas). Anotar o deployment
    anterior (é ele que o rollback promove).
18. **Smoke do Owner:** "Esqueci minha senha" no app → link do Neon Auth → nova senha
    (isso também confirma o e-mail. Hoje o Owner está `emailVerified=false`, e o app
    recusa login sem e-mail confirmado) → login → `/admincentral`; contexto OWNER.
19. **Smoke do app:** as leituras de `homolog/e2e-homolog.mjs` (módulos, 401 sem
    sessão, CSRF, cadastro público recusado) contra produção, só com a conta do Owner.
    Nenhuma escrita de teste em produção.
20. 🔒 **Descongelar:** tirar a manutenção. O Supabase **continua** só leitura
    (passo 9 não é desfeito).

### Pós-cutover

21. **Supabase só leitura por 2 semanas.** Não apagar, não pausar, não alterar.
22. **Usuários:** os 10 `public.users` não têm login (`auth_user_id` nulo) e
    `user_roles` está vazio em produção. O admin atribui papéis e envia convites
    (primeiro acesso cria a senha no Neon Auth; nenhuma senha é migrada).
23. **Monitorar 24 h intensivo:** Vercel (5xx, latência), Neon (conexões ativas do
    pooler, `pg_stat_statements`, slow queries), Neon Auth (falhas de login).
24. **Critérios de rollback** (qualquer um): 5xx > 2% por 15 min; qualquer indício de
    dado de outra empresa visível; perda/alteração de dado; login do Owner impossível
    por > 30 min sem causa conhecida.
25. **Retenção:** `history_retention_seconds` do projeto está em 6 h (21.600 s). Subir
    para ≥ 7 dias (plano pago) antes de descongelar ou logo depois.
26. **D+1 a D+14:** conferir contagens diárias por tabela. Comparar com o volume
    esperado.
27. 🔒 **D+14, decisão do dono:** encerrar o Supabase (exportar, pausar; apagar só com
    aprovação) e remover `@supabase/*`, `supabase/client.ts`, callback, `SUPABASE_*` e
    o caminho `mint` da ponte (`src/lib/auth/neon-bridge.ts`) em PR separado.
28. 🔒 **Limpeza (com aprovação):** branches `rehearsal-1`, `rehearsal-2-educa`,
    `rehearsal-2-probes`, `homolog` (se não for mais usada), `pre-cutover`; banco
    `neondb` de `main` (collation C, sem uso); esquema `poc_sec` e função
    `remoteapply` do projeto `educa-neon-poc`. Atualizar a auditoria com o resultado.

## Rollback

Objetivo: voltar ao Supabase **sem apagar nada** (Supabase, Neon e backups ficam).

1. 🔒 **Vercel → Deployments → deployment anterior (passo 17) → Promote/Instant
   Rollback.** Ele volta com as variáveis antigas (`AUTH_PROVIDER=supabase`, sem
   `DATA_BACKEND`). Alternativa: voltar as duas variáveis e fazer redeploy.
2. 🔒 **Supabase de volta à escrita:**
   `alter role authenticator reset default_transaction_read_only;`
3. **Dados gravados no Neon depois do passo 20:** não existe cópia automática de
   volta. `copy-data.sh` recusa destino Supabase de propósito, porque o
   `TRUNCATE auth.users` apagaria as senhas do GoTrue. Exportar do Neon as linhas com
   `created_at/updated_at > T0` (passo 11), revisar e reaplicar no Supabase à mão.
   Hoje o volume esperado é mínimo (1 usuário ativo).
4. O Owner volta a entrar com a senha do Supabase Auth (intacta).
5. Registrar a causa na auditoria. O Neon `main` fica como estava para a próxima
   tentativa (ou é restaurado da branch `pre-cutover`).
