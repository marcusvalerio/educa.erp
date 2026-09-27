# Homologação: Vercel Preview → Next.js → Neon Auth → Neon PostgreSQL

**Status: BLOQUEADO na Vercel** (atualizado em 2026-09-27, rodada 3). O Preview
existe, mas está atrás da Vercel Authentication e sem as variáveis de homologação.

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
| Contas de teste | `homolog/bootstrap-homolog.mjs` | cria/reaproveita admin A, leitura A e admin B pelo fluxo oficial de convite, senhas aleatórias só em memória, e roda o E2E. Validado na pilha local: 33/33 em duas execuções seguidas (a 2ª reaproveita as contas) |
| Região das funções | `vercel.json` → `regions: ["gru1"]` | vale para todo deployment feito a partir deste código (o Preview desta branch já nasce em São Paulo; a produção só quando o código chegar à `main`) |
| Sonda sem segredos | `homolog/probe-preview.mjs` + `.github/workflows/homolog-probe.yml` | roda no runner do GitHub a cada push da homologação. Resultado em `../evidence/homolog-probe.md` |
| CI do E2E | `.github/workflows/homolog-e2e.yml` | bootstrap + 33 verificações; dispara por push alterando `homolog/RUN_E2E` (o *Run workflow* manual só aparece depois que o arquivo estiver na `main`) |

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
| `allow_sign_up` | true | **true** ❌ → false | Console (o `update_auth_config` do MCP só muda o nome) |
| `allow_localhost` | true | **true** ❌ → false | Console (idem) |
| Recuperação de senha | — | **funciona** ✅: 200 com redirect no Preview, 403 com redirect de outra origem (sonda, run 36293119479) | — |

Cliques: Console Neon → projeto **educa-erp-prod** → branch **homolog** → **Auth** →
*Settings*: desligar **Allow sign-ups** (cadastro público) e **Allow localhost**.
Não mexer em *Email & password* (fica ligado) nem em *Trusted domains* (já só o
Preview). A sonda do próximo push mostra "desligado (OK)" nos dois.
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

## Passo a passo (dono do projeto) — só o que exige senha ou painel

Nada disto passa pelo chat. Contas de teste **não** são mais criadas à mão: o
`bootstrap-homolog.mjs` faz isso no runner.

1. **Neon Console → educa-erp-prod → branch `homolog` → Auth → Settings:**
   *Allow sign-ups* off, *Allow localhost* off.
2. **Neon Console → educa-erp-prod → branch `homolog` → Roles → `educa_app` →
   Reset password.** Montar a string **pooled**
   `postgresql://educa_app:<senha>@ep-royal-flower-b6tz0xde-pooler.c-2.sa-east-1.aws.neon.tech/educa?sslmode=require`
   e colar **só** na variável `DATABASE_URL` do Preview (passo 4).
3. **Conta de serviço**, na sua máquina:
   `node scripts/neon-service-account.mjs --email svc-educa@educaerp.com --out ./.neon-service-homolog.env`.
   Colar o SQL impresso (só o hash) no SQL Editor: branch **`homolog`**, banco
   **`authdb`**. A senha fica no arquivo local (fora do Git) e vai para dois lugares:
   a variável `NEON_AUTH_SERVICE_PASSWORD` do Preview e o segredo de mesmo nome do
   GitHub (passo 5).
4. **Vercel → projeto educa.erp → Settings → Environment Variables:** as variáveis
   da tabela acima, ambiente **Preview**, *Git branch* = `poc/supabase-to-neon`.
   **Settings → Deployment Protection:** manter a *Vercel Authentication* e criar
   **Protection Bypass for Automation** (gera um segredo). Depois, **Deployments →
   último deployment da branch → Redeploy** (sem cache).
5. **GitHub → Settings → Environments → New environment `homolog` → secrets:**
   `NEON_AUTH_SERVICE_EMAIL` (`svc-educa@educaerp.com`), `NEON_AUTH_SERVICE_PASSWORD`
   (passo 3), `VERCEL_BYPASS_TOKEN` (passo 4).
6. Me avisar. Eu faço o push em `homolog/RUN_E2E` e analiso o resultado.

### Como o `VERCEL_BYPASS_TOKEN` é usado (sem exposição)

- Fica só no segredo do ambiente `homolog` do GitHub. O Actions mascara o valor
  nos logs, e o workflow só roda em push desta branch (não em PR de fork).
- Os scripts o enviam no cabeçalho `x-vercel-protection-bypass` de cada pedido
  (`bootstrap-homolog.mjs` na função `app()`, `e2e-homolog.mjs` no `fetch` e no
  navegador). Não vai para a URL, não é gravado em arquivo e não é impresso.
- Ele só abre os deployments **deste projeto** na Vercel para quem tem o segredo.
  A proteção continua valendo para qualquer outra pessoa. Para revogar: Deployment
  Protection → apagar o bypass.
- Alternativa sem segredo: desligar a proteção só para Previews. É menos seguro,
  porque o Preview fica público com dados de homologação (cópia de produção).

### O que o bootstrap faz no Neon Auth de homologação

- **Owner** (`contatomarcusjr@gmail.com`, o único; nunca cria outro): recebe uma
  senha aleatória a cada execução e fica com e-mail confirmado. Depois do E2E, o
  dono entra no Preview por "Esqueci a senha". Para manter uma senha fixa, defina o
  segredo `E2E_OWNER_PASSWORD`. **Só a homologação é afetada**: o Owner de produção
  está em outro projeto (`educa-auth-prod`).
- **Admin A:** `e2e.admin.a@example.com`, primeiro admin da ASTRA de homologação
  (convite da plataforma).
- **Leitura A:** `e2e.leitura.a@example.com`, criado pelo admin A.
- **Admin B:** `e2e.admin.b@example.com`, na empresa "Beta Homologação E2E", criada
  pelo Owner no primeiro run.
- As contas nascem no Neon Auth com senha e e-mail confirmado (a caixa
  `@example.com` não existe) e são vinculadas pelo convite oficial do app
  (`provisionIdentity` → vínculo 0073 → aceite).

## Validação do script sem o Preview

`e2e-homolog.mjs` só usa HTTP e navegador. Foi executado contra a pilha local
(app `next start` + Neon Auth dublê + PostgreSQL com esquema de produção), com as
senhas das 4 contas trocadas pela API admin do dublê em memória, sem gravar nem
imprimir segredos. Resultado em `../evidence/homolog-e2e-local.log`.
