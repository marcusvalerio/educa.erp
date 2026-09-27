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
| Neon de produção (destino) | projeto `educa-erp-prod` `old-butterfly-53570465` (aws-sa-east-1, PG 17.11, **plano free_v3**), branch `main` `br-lively-darkness-b683lnw7`, endpoint `ep-rapid-hall-b6m1arxn` (pooler `ep-rapid-hall-b6m1arxn-pooler.c-2.sa-east-1.aws.neon.tech`), banco **`educa`** (ICU en-US) |
| Neon Auth de produção | projeto `educa-auth-prod` `young-mode-67474663`, branch `main`, `https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth` (us-east-1; Owner `33e3fb0b…` já existe; o vínculo está em `auth_identity_links` do Supabase e chega ao Neon na cópia) |
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
| E — Homologação | `homolog-e2e` verde contra o Preview | **BLOQUEADO**: o Preview da branch existe, mas está atrás da Vercel Authentication e sem as variáveis de homologação (`evidence/homolog-probe.md`, run 36293119479). Contas de teste já são automáticas (`homolog/bootstrap-homolog.mjs`) |

## Passos

### Preparação (sem janela)

1. **Congelar esquema.** Nenhuma migration no Supabase até o fim da janela. Rodar
   de novo as impressões digitais (categorias de `evidence/prod-schema-fingerprint.md`
   + `md5(prosrc)`) Supabase × Neon `main`. Divergência nova = parar.
2. **Confirmar os portões A–E** (tabela acima) e o horário da janela com o dono.
3. 🔒 **Neon Auth de produção** (Console → projeto `educa-auth-prod` → branch `main`
   → Auth → Settings): **Email & password** ligado (hoje desligado: sem isso ninguém
   entra), **Allow sign-ups** desligado (hoje ligado), **Allow localhost**
   desligado (já está), *Trusted domains* só `https://educaerp.vercel.app` (já
   está), sem OAuth (já está). Remetente próprio de e-mail é recomendado (hoje é o
   compartilhado do Neon). Conta de serviço de produção:
   `node scripts/neon-service-account.mjs --email svc-educa@educaerp.com --out ./.neon-service-prod.env`
   na máquina do dono → SQL (só hash) no SQL Editor de `educa-auth-prod`, banco
   `neondb` → senha direto na variável de Produção.
4. 🔒 **Senha do `educa_app`** em `main`, pelo dono, sem passar por chat, arquivo ou
   log:
   1. Neon Console → projeto **educa-erp-prod** → **Branches → main → Roles**
      → `educa_app` → **Reset password** (a senha aparece uma vez).
   2. Botão **Connect** do projeto: Branch `main`, Compute primário, Database
      **`educa`**, Role **`educa_app`**, **Connection pooling ligado**. A string
      mostrada já é a certa (host `ep-rapid-hall-b6m1arxn-pooler.c-2.sa-east-1.aws.neon.tech`,
      `/educa`, `sslmode=require`). Conferir que o host tem `-pooler` e o banco é
      `educa` (não `neondb`).
   3. Vercel → educa.erp → Settings → Environment Variables → **Add** →
      `DATABASE_URL`, ambiente **só Production**, tipo *Sensitive*. Colar e salvar.
      Não usar em Preview/Development.
   4. Não criar outro papel nem usar `neondb_owner` na aplicação: o `educa_app` é o
      único papel que respeita RLS pela troca de papel por transação.
   Se a senha vazar: repetir o Reset (invalida a anterior) e atualizar a variável.
5. 🔒 **Código na `main` (PR `poc/supabase-to-neon` → `main`)**, antes da janela e
   com aprovação. O código funciona nos dois modos (build Supabase e postgres
   testados). Com as variáveis de produção ainda em `AUTH_PROVIDER=supabase`, o
   deploy de produção continua no Supabase. O `vercel.json` do PR põe as funções em
   **`gru1`** (São Paulo, a mesma região do banco; hoje estão em `iad1`,
   Washington). Depois do deploy: a sonda (`homolog-probe`, ou um GET em
   `/api/session/context`) tem que mostrar `→ gru1`, e o Owner tem que entrar como
   hoje (modo Supabase). Se algo quebrar, *Instant Rollback* para o deployment
   anterior. Alternativa sem merge: Vercel → Settings → Functions → Region =
   `gru1` (painel; o `vercel.json` tem precedência quando estiver na `main`).
6. **Backup do Supabase (recomendado, não bloqueia):** o plano do Supabase é
   **free** (sem PITR). O Supabase não é alterado no cutover (só fica só leitura) e
   continua sendo a cópia de volta. Há também a branch Neon `rehearsal-2-educa`
   (cópia fiel de 2026-09-27, 173/173 tabelas). Mesmo assim: `pg_dump -Fc` de
   produção guardado fora do Git, feito pelo dono (precisa da senha do banco).
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
16. 🔒 **Variáveis de Produção na Vercel** (lista exata, levantada do código):

    | Variável | Valor | Lida por |
    |---|---|---|
    | `AUTH_PROVIDER` | `neon` | `next.config.ts` → `NEXT_PUBLIC_AUTH_PROVIDER` **no build** |
    | `DATA_BACKEND` | `postgres` | `src/lib/database/backend.ts` |
    | `DATABASE_URL` | passo 4 (sensitive) | `src/lib/database/pg/client.ts` |
    | `DATABASE_POOL_MAX` | `5` (opcional; o padrão já é 5) | idem |
    | `NEON_AUTH_BASE_URL` | `https://ep-long-leaf-b86ezbh8.neonauth.c-14.us-east-1.aws.neon.tech/neondb/auth` | `src/lib/auth/neon/server.ts` |
    | `NEON_AUTH_SERVICE_EMAIL` | `svc-educa@educaerp.com` | idem |
    | `NEON_AUTH_SERVICE_PASSWORD` | passo 3 (sensitive) | idem |
    | `APP_URL` | `https://educaerp.vercel.app` | idem + convites (`onboarding-handlers.ts`) |

    Todas só em **Production**. As `SUPABASE_*`/`NEXT_PUBLIC_SUPABASE_*` ficam como
    estão durante a janela de volta: no modo neon/postgres não são lidas (o
    `proxy.ts` só as usa no modo supabase), e saem no passo 27.
    `SUPABASE_JWT_SECRET` só é lido pelo caminho `mint` (modo supabase de dados):
    **remover** de Production, porque a ponte JWT não faz parte da arquitetura final.
17. 🔒 **Deploy de produção com build novo.** `AUTH_PROVIDER` entra no bundle **no
    build** (`NEXT_PUBLIC_AUTH_PROVIDER`), então trocar a variável sem novo build não
    muda o modo. Vercel → Deployments → último deployment de Production (commit da
    `main`) → **Redeploy**, **sem** "Use existing Build Cache". Anotar o deployment
    anterior (é ele que o rollback promove). Conferir com a sonda: `POST
    /api/auth/sign-in` de outra origem → **403** (modo neon) e função em **gru1**.
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
25. **Retenção:** `history_retention_seconds` está em 6 h (21.600 s), o **máximo do
    plano free_v3**. O MCP recusou 7 dias ("exceeds allowed maximum… 21600"), e
    snapshot agendado "não está habilitado para este projeto". Para ≥ 7 dias: 👤
    Console → Billing → plano pago → Settings → *Instant restore / History
    retention* = 7 dias. Sem o upgrade, a volta no tempo fica em 6 h. A defesa é o
    Supabase só leitura por 14 dias + a branch `pre-cutover` + uma branch manual por
    dia nos primeiros dias (limite do plano: 10 branches; hoje há 5).
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
   Rollback.** Funciona mesmo com `AUTH_PROVIDER` embutido no build: o deployment
   anterior foi construído em modo supabase e volta com o próprio bundle. Ele volta com as variáveis antigas (`AUTH_PROVIDER=supabase`, sem
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
