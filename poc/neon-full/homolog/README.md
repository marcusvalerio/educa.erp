# Homologação: Vercel Preview → Next.js → Neon Auth → Neon PostgreSQL

**Status: BLOQUEADO na Vercel** (atualizado em 2026-09-27, ver §Estado).

A Vercel já publica um Preview por branch pela integração com o GitHub (projeto
`meji-projects/educa.erp`). O Preview desta branch é
**`https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app`**, e é contra
ele que a homologação roda. O que falta é **configurar as variáveis desse Preview**
(tabela abaixo), e isso só se faz no painel da Vercel. Esta sessão não tem acesso
à Vercel: não há conector, e a política de rede recusa `*.vercel.app`,
`vercel.com` e `*.neon.tech` (403 no proxy). Todo o resto está pronto.

## O que já existe (criado nesta sessão, sem tocar em `main`)

| Peça | Onde | Estado |
|---|---|---|
| Banco de homologação | educa-erp-prod (`old-butterfly-53570465`, sa-east-1), branch **`homolog`** (`br-icy-cell-b62lgh06`), banco `educa` | cópia do ensaio: esquema de produção + dados de produção (173/173 tabelas iguais, ver `evidence/rehearsal-data.md`) |
| Neon Auth de homologação | mesma branch, banco `authdb` | provisionado: `https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth` (sa-east-1, a mesma região do banco) |
| Usuários do Neon Auth de homologação | `svc-educa@educaerp.com` (papel `admin`) e `contatomarcusjr@gmail.com` (Owner) | criados **sem senha** |
| Vínculo do Owner | `auth_identity_links` **só no banco `educa` da branch `homolog`** | apontado para o Owner do Auth de homologação (`2cdfefb7…`) |
| Papel da app | `educa_app` (herdado de `main`) | **sem senha**. A senha é criada no Console, só nesta branch |
| E2E remoto | `homolog/e2e-homolog.mjs` | 33/33 contra a pilha local; **ainda não executado contra o Preview** |
| Sonda sem segredos | `homolog/probe-preview.mjs` + `.github/workflows/homolog-probe.yml` | roda no runner do GitHub a cada push da homologação. Resultado em `../evidence/homolog-probe.md` |
| CI do E2E | `.github/workflows/homolog-e2e.yml` | dispara por push alterando `homolog/RUN_E2E` (o *Run workflow* manual só aparece depois que o arquivo estiver na `main`) |

O banco `neondb` da branch `homolog` tem um esquema `neon_auth` vazio, sobra de
uma primeira tentativa de provisionamento que falhou no Neon. Ele não é usado (o
Auth ficou em `authdb`). Remover é opcional e fica com o dono.

## Configuração do Neon Auth de homologação (Console → Auth, branch `homolog`)

O provisionamento veio com padrões que **não** servem para o EDUCA:

| Item | Veio | Agora | Quem |
|---|---|---|---|
| `email_password.enabled` | true | **true** ✅ | — |
| OAuth Google (compartilhado) | ligado | **removido** ✅ | feito pelo MCP |
| Trusted origins | vazio | **só** `https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app` ✅ | feito pelo MCP |
| `allow_sign_up` | true | **true** ❌ → false | Console (o MCP não expõe) |
| `allow_localhost` | true | **true** ❌ → false | Console (o MCP não expõe) |
| E-mail | remetente compartilhado do Neon | aceitável em homologação | — |

## Variáveis do Preview (Vercel → Settings → Environment Variables → Preview)

| Variável | Valor |
|---|---|
| `AUTH_PROVIDER` | `neon` |
| `DATA_BACKEND` | `postgres` |
| `DATABASE_URL` | string **pooled** do papel `educa_app`, branch `homolog`, banco `educa`, `sslmode=require` |
| `DATABASE_POOL_MAX` | `5` |
| `NEON_AUTH_BASE_URL` | `https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth` |
| `NEON_AUTH_SERVICE_EMAIL` / `NEON_AUTH_SERVICE_PASSWORD` | `svc-educa@educaerp.com` + senha gerada por `scripts/neon-service-account.mjs` (passo 2) |
| `APP_URL` | `https://educaerp-git-poc-supabase-to-neon-meji-projects.vercel.app` |
| `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_JWT_SECRET` | **não definir** (o modo postgres não usa; a ponte JWT fica inerte) |

Todas com escopo **Preview**, restritas à branch `poc/supabase-to-neon` (a Vercel
permite variável por branch de Preview). Assim, os outros Previews e a Produção
não mudam. Região das funções: `gru1` (São Paulo), a mesma do Neon (sa-east-1).

## Passo a passo (dono do projeto)

1. Console Neon → projeto educa-erp-prod → branch `homolog` → Roles → `educa_app` →
   *Reset password*. A senha vai **só** para `DATABASE_URL` do Preview.
2. Conta de serviço: na sua máquina,
   `node scripts/neon-service-account.mjs --email svc-educa@educaerp.com --out ./.neon-service-homolog.env`
   e colar o SQL impresso (só o hash) no SQL Editor da branch **`homolog`**, banco
   **`authdb`**. A senha fica só no arquivo `.env` local, fora do Git.
3. Console Neon → Auth da branch `homolog`: `allow_sign_up` = off,
   `allow_localhost` = off.
4. Vercel → Settings → Environment Variables → **Preview**, branch
   `poc/supabase-to-neon`: variáveis da tabela acima. Em Deployment Protection:
   ou desligar a proteção só para este Preview, ou criar um *Protection Bypass for
   Automation* (vira o segredo `VERCEL_BYPASS_TOKEN`). Depois, *Redeploy* do último
   deployment da branch.
5. Owner em homologação: *já vinculado* (tabela acima). "Esqueci a senha" no
   Preview com `contatomarcusjr@gmail.com` → e-mail do Neon Auth → nova senha.
6. Contas do E2E: com o Owner, criar a empresa B e convidar o admin B. Na ASTRA,
   convidar um admin A e um usuário com papel `leitura`. Cada convite chega por
   e-mail; a senha é criada no primeiro acesso.
7. GitHub → Settings → Environments → `homolog`: segredos listados em
   `.github/workflows/homolog-e2e.yml`.
8. Disparar: qualquer push que altere `poc/neon-full/homolog/RUN_E2E` (eu faço,
   se me pedir). O resultado sai no job **homolog-e2e** e no artefato
   `homolog-e2e-log`.

## Validação do script sem o Preview

`e2e-homolog.mjs` só usa HTTP e navegador. Foi executado contra a pilha local
(app `next start` + Neon Auth dublê + PostgreSQL com esquema de produção), com as
senhas das 4 contas trocadas pela API admin do dublê em memória, sem gravar nem
imprimir segredos. Resultado em `../evidence/homolog-e2e-local.log`.
