# Checklist pré-cutover — estado verificado em 2026-09-27 (rodada 5)

Cada linha foi conferida nesta data. Neon e Supabase pelo MCP, só leitura em
produção. Vercel e Neon Auth pela sonda no runner do GitHub
(`poc/neon-full/evidence/homolog-probe.md`, runs 36293119479 e 36293523306). Nada aqui executa a
virada. **Veredito: NÃO pronto**, porque o portão E (homologação real) não passou
(ver §BLOQUEIA CUTOVER).

Legenda: ✅ pronto · ❌ falta · ⚠️ pronto com ressalva · 👤 depende do dono ·
🤖 feito por mim

## Rodada 5 — preflight de 2026-09-27 (sessão sem acesso à Vercel)

| Verificação | Resultado |
|---|---|
| Vercel (API e `*.vercel.app`) a partir da sessão | **bloqueado** pela política de rede do ambiente (proxy recusa `api.vercel.com` e os domínios `vercel.app` com 403); nenhum token da Vercel no ambiente |
| GitHub a partir da sessão | token com admin no repositório, mas as APIs de **Environments** e **Actions secrets** respondem **403**: não dá para criar o Environment `homolog` nem cadastrar segredos |
| Neon (MCP) | acessível. Branch `homolog` = `br-icy-cell-b62lgh06`; Neon Auth `better_auth`, banco `authdb`, base `ep-royal-flower-b6tz0xde…/authdb/auth` |
| Conta de serviço `svc-educa@educaerp.com` (branch `homolog`) | existe, papel **admin**, credencial criada **sem senha**, `emailVerified` falso (o SQL do script corrige os dois) |
| Senha da conta de serviço | **não provisionada de propósito**: sem cofre de segredos acessível (GitHub 403, Vercel bloqueada), uma senha gerada nesta sessão ficaria só no contêiner efêmero e teria de ser trocada de novo |
| Sonda no runner (run 36336628971) | Preview ainda atrás da **Vercel Authentication** (302 para `vercel.com/sso-api`); Neon Auth de homologação 200; recuperação OK e redirect de outra origem recusado (403); **`allow_localhost` e `allow_sign_up` ainda ligados**; produção intacta (`AUTH_PROVIDER=supabase`) |
| E2E de homologação | **NÃO EXECUTADO** nesta rodada (0/33): sem Preview acessível nem segredos |

Nada foi alterado em produção, no Supabase ou nas branches do Neon nesta rodada.

## Destino (Neon de produção `educa-erp-prod`)

| Item | Estado verificado | |
|---|---|---|
| Projeto | `old-butterfly-53570465`, aws-sa-east-1, PG 17.11, plano **free_v3** | ✅ |
| Banco `educa` | ICU `en-US` (igual ao Supabase), 23 MB | ✅ |
| Esquema em `main` | 172 tabelas em `public`, 328 policies (conferido hoje). Funções iguais ao ensaio; as 7 diferenças com produção são só comentários | ⚠️ |
| Esquema do Supabase congelado | corpo das funções `aaf34b2b…`, 84 migrations | ✅ (manter até a janela) |
| Dados em `main` | só semente; Owner e vínculo ainda **0** (esperado: chegam na cópia). No Supabase: 1 Owner ativo, 1 vínculo em `auth_identity_links` | ✅ |
| Cabe no plano | Supabase 28 MB no total (10 MB em `public`+`auth`); limite free de 512 MB por branch | ✅ |
| Papéis | `educa_app` LOGIN, NOINHERIT, sem BYPASSRLS, membro só de anon/authenticated/service_role | ✅ |
| Senha do `educa_app` em `main` | **não existe** (de propósito até o dia) | ❌ 👤 |
| Retenção (PITR) | 6 h, o **máximo do free_v3**. 7 dias foi recusado pelo MCP 🤖, e snapshot agendado "não habilitado" | ⚠️ 👤 upgrade do plano, ou aceitar 6 h + Supabase só leitura 14 dias + branches manuais |
| Compute | autoscaling 0,25 CU fixo (free), escala a zero | ⚠️ primeiro acesso após ociosidade tem partida a frio |
| Branches | 5 de 10 (`main`, `homolog`, `rehearsal-1`, `rehearsal-2-educa`, `rehearsal-2-probes`) | ✅ cabem `pre-cutover` e as branches de sonda |
| Script de cópia | testado localmente | ⚠️ não executado Supabase→Neon real (precisa da senha do banco do Supabase: 👤 máquina do dono ou CI) |

## Autenticação de produção (`educa-auth-prod`, lido pelo MCP hoje)

| Item | Estado | |
|---|---|---|
| Owner `33e3fb0b…` | existe; sem senha, `emailVerified=false` | ⚠️ esperado: primeiro acesso por "Esqueci a senha" (runbook passo 18) |
| `email_password.enabled` | **false** | ❌ 👤 |
| `allow_sign_up` | **true** | ❌ 👤 |
| `allow_localhost` | false | ✅ |
| OAuth | nenhum | ✅ |
| Trusted origins | só `https://educaerp.vercel.app` | ✅ |
| Conta de serviço | admin, sem senha | ❌ 👤 script → SQL (hash) → Vercel |
| Região | us-east-1 (o banco e as funções ficam em São Paulo) | ⚠️ +~120 ms por login e por resolução de sessão fora do cache curto |
| E-mail | remetente compartilhado do Neon | ⚠️ recomendado remetente próprio |

## Aplicação (Vercel)

| Item | Estado | |
|---|---|---|
| Produção | `AUTH_PROVIDER=supabase`, funções em `iad1`, API 401 correta | ✅ inalterada |
| Região `gru1` | `vercel.json` com `regions: ["gru1"]` no código 🤖. Build, tsc e lint ok de novo no commit final. Vale para a produção quando o código chegar à `main` (runbook passo 5); o merge é *fast-forward* (a `main` = `6cd762c` é ancestral; 19 commits; sem conflito) | ⚠️ no código, não em produção |
| Modo de auth no build | `AUTH_PROVIDER` vira `NEXT_PUBLIC_AUTH_PROVIDER` **no build**: a virada exige deploy com build novo (runbook passo 17); o *Instant Rollback* volta com o bundle antigo (modo supabase) | ✅ documentado |
| Variáveis de Produção | lista exata levantada do código no runbook passo 16 (8 variáveis; 2 sensitive) | ❌ 👤 |
| Build nos dois modos / testes | Supabase e postgres; `npm test` 719/719; E2E local 210/210 (de novo hoje) | ✅ |

## Homologação (portão E)

| Item | Estado | |
|---|---|---|
| Banco `homolog` | cópia fiel de produção (173 tabelas) | ✅ |
| Neon Auth de homologação | e-mail/senha ligado; OAuth removido 🤖; trusted origin só o Preview 🤖; recuperação provada (200; redirect de outra origem 403) 🤖 | ✅ |
| `allow_sign_up` / `allow_localhost` | **ligados** (sonda da rodada 5, run 36336628971). O MCP não altera | ❌ 👤 Console |
| Owner de homologação | 1 identidade (`2cdfefb7…`); vínculo só na branch `homolog`; 1 OWNER ativo; nenhum duplicado | ✅ |
| Contas de teste | automáticas: `bootstrap-homolog.mjs` 🤖, 33/33 local duas vezes seguidas | ✅ |
| Conta de serviço (senha) | usuário `svc-educa@educaerp.com` existe como **admin**, credencial **sem senha** (rodada 5, MCP) | ❌ 👤 |
| `educa_app` em `homolog` (senha) | não existe | ❌ 👤 |
| Preview: variáveis + bypass | não configurados; Vercel Authentication ativa (rodada 5). A sessão não alcança a Vercel | ❌ 👤 |
| Segredos do GitHub (`homolog`) | não existem; a sessão recebe 403 nas APIs de Environments/secrets | ❌ 👤 |
| E2E contra o Preview | **NÃO EXECUTADO** | ❌ roda assim que os itens 👤 acima estiverem prontos |

## Rollback

| Item | Estado | |
|---|---|---|
| Supabase de produção | intacto: 84 migrations (última `20260926032523`), 1 usuário no Auth, última mudança no Auth em 2026-09-26 22:43 UTC, sem modo só leitura. Nesta preparação só houve SELECT | ✅ |
| Backup do Supabase | plano **free** (sem PITR). O Supabase não é alterado no cutover (só fica só leitura) e há a cópia fiel na branch `rehearsal-2-educa` | ⚠️ `pg_dump` recomendado (👤, precisa da senha do banco) |
| Caminho de volta | *Instant Rollback* do deployment anterior + `alter role authenticator reset default_transaction_read_only` | ✅ documentado |
| Dados gravados no Neon após a virada | reaplicação manual (T0) | ⚠️ por decisão de segurança |

---

## BLOQUEIA CUTOVER

Só impeditivos técnicos reais: sem cada um, a virada não funciona ou não pode ser
verificada.

1. **Homologação real 33/33 contra o Preview** (portão E): **BLOQUEADA**. Preview
   atrás da Vercel Authentication e sem variáveis; `allow_sign_up`/`allow_localhost`
   de homologação ligados. Depende de AÇÃO HUMANA 1–5.
2. **Neon Auth de produção:** `email_password.enabled` = true (hoje false; sem isso
   ninguém entra) e `allow_sign_up` = false (hoje true; cadastro público aberto).
3. **Conta de serviço de produção com senha** (convites e administração de
   identidades).
4. **`DATABASE_URL` de Produção** com o `educa_app` de `main` (runbook passo 4).
5. **Variáveis de Produção** (runbook passo 16) e **deploy com build novo** (passo 17).
6. **Código na `main`**: o modo neon/postgres e o `vercel.json` só existem nesta
   branch. Merge *fast-forward*, sem conflito, **só com a sua aprovação**.
7. **Cópia dos dados na janela** (passo 12): `copy-data.sh` com a senha do Supabase,
   ou o caminho do ensaio pelas ferramentas MCP (sem senha), com aprovação na hora.

## RECOMENDADO (não impede a virada)

- `pg_dump` do Supabase antes da janela. O Supabase não é alterado e a branch
  `rehearsal-2-educa` é uma cópia fiel, mas é a única cópia fora dos dois provedores.
- Retenção de 7 dias no Neon (plano pago; hoje 6 h, o máximo do free).
- Branch `pre-cutover` de `main` imediatamente antes da cópia (eu crio na janela).
- Remetente próprio de e-mail no Neon Auth de produção.
- Neon Auth de produção em sa-east-1 (hoje us-east-1; +latência só fora do cache de
  sessão). Mudar exige recriar Owner e vínculo; não vale o risco agora.
- Compute acima de 0,25 CU / sem escala a zero, se a partida a frio incomodar.
- Débitos pré-existentes (`docs/DEBITOS_PRE_EXISTENTES.md`), fora do cutover.
- Limpeza de branches de ensaio (runbook passo 28), só com aprovação.

## AÇÃO HUMANA (só o que esta sessão comprovadamente não consegue)

Motivo, verificado de novo nesta rodada (uma tentativa cada):
- `api.vercel.com`, `*.vercel.app` e `*.neon.tech`: `connect_rejected` no proxy.
- Nenhum conector da Vercel instalado.
- Nenhuma credencial no ambiente.
- O MCP do Neon não altera `allow_sign_up`, `allow_localhost` nem `email_password`
  (o `update_auth_config` só aceita `name`).
- Senhas não passam pelo chat.

**Homologação** (passo a passo com cliques em `poc/neon-full/homolog/README.md`):

1. Neon Console → educa-erp-prod → branch `homolog` → Auth → Settings: *Allow
   sign-ups* **off**, *Allow localhost* **off**.
2. Neon Console → branch `homolog` → Roles → `educa_app` → Reset password → Connect
   (branch `homolog`, banco `educa`, role `educa_app`, pooling on) → string só na
   `DATABASE_URL` do Preview.
3. Na sua máquina: `node scripts/neon-service-account.mjs --email svc-educa@educaerp.com --out ./.neon-service-homolog.env`
   → SQL impresso (só hash) no SQL Editor, branch `homolog`, banco `authdb`.
4. Vercel → Environment Variables → **Preview**, branch `poc/supabase-to-neon`:
   variáveis do README; Deployment Protection → **Protection Bypass for
   Automation**; **Redeploy** do último deployment da branch.
5. GitHub → Settings → Environments → **`homolog`** → secrets
   `NEON_AUTH_SERVICE_EMAIL`, `NEON_AUTH_SERVICE_PASSWORD`, `VERCEL_BYPASS_TOKEN`.
   Depois me avisar.

**Produção** (antes da janela; runbook passos 3–5):

6. Neon Console → `educa-auth-prod` → Auth → Settings: *Email & password* **on**,
   *Allow sign-ups* **off**. Conta de serviço de produção pelo mesmo script (SQL no
   banco `neondb` de `educa-auth-prod`) → senha em `NEON_AUTH_SERVICE_PASSWORD` de
   Production.
7. `educa_app` de `main`: Reset password → Connect (branch `main`, banco `educa`,
   pooling on) → `DATABASE_URL` de Production (runbook passo 4).
8. Aprovar o merge `poc/supabase-to-neon` → `main` (runbook passo 5).
9. Na janela: variáveis de Production + Redeploy sem cache (passos 16–17).
10. Recomendado: `pg_dump` do Supabase; upgrade do plano Neon (retenção).

**Eu faço, sem segredo:**
- disparar o E2E real assim que os itens 1–5 estiverem prontos, e corrigir o que
  for da migração até 33/33;
- abrir o PR para a `main` quando pedido (sem merge);
- sonda antes e depois de cada deploy;
- branch `pre-cutover`, hashes T0 e cópia pelo caminho do ensaio (com aprovação);
- as 56 sondas de segurança numa branch filha de `main`.
