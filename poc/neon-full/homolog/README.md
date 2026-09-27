# Homologação: Vercel Preview → Next.js → Neon Auth → Neon PostgreSQL

**Status: BLOQUEADO.** Falta um único item: **acesso à Vercel** para publicar o
Preview com as variáveis abaixo. Este contêiner não tem integração com a Vercel e
não alcança `*.vercel.app` nem `*.neon.tech`. O Neon e os scripts estão prontos.

## O que já existe (criado nesta sessão, sem tocar em `main`)

| Peça | Onde | Estado |
|---|---|---|
| Banco de homologação | educa-erp-prod (`old-butterfly-53570465`, sa-east-1), branch **`homolog`** (`br-icy-cell-b62lgh06`), banco `educa` | cópia do ensaio: esquema de produção + dados de produção (173/173 tabelas iguais, ver `evidence/rehearsal-data.md`) |
| Neon Auth de homologação | mesma branch, banco `authdb` | provisionado: `https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth` (sa-east-1, a mesma região do banco) |
| Papel da app | `educa_app` (herdado de `main`) | **sem senha**. A senha é criada no Console, só nesta branch |
| E2E remoto | `homolog/e2e-homolog.mjs` | validado contra a pilha local (ver abaixo); ainda não executado contra o Preview |
| CI | `.github/workflows/homolog-e2e.yml` | disparo manual com a URL do Preview |

O banco `neondb` da branch `homolog` tem um esquema `neon_auth` vazio, sobra de
uma primeira tentativa de provisionamento que falhou no Neon. Ele não é usado (o
Auth ficou em `authdb`). Remover é opcional e fica com o dono.

## Configuração do Neon Auth de homologação (Console → Auth, branch `homolog`)

O provisionamento veio com padrões que **não** servem para o EDUCA:

| Item | Veio | Ajustar para |
|---|---|---|
| `email_password.enabled` | true | true |
| `allow_sign_up` | **true** | **false** (só convite) |
| `allow_localhost` | **true** | **false** |
| OAuth Google (compartilhado) | **ligado** | **remover** |
| Trusted origins | vazio | a URL do Preview (`https://<preview>.vercel.app`) |
| E-mail | remetente compartilhado do Neon | aceitável em homologação |

## Variáveis do Preview (Vercel → Settings → Environment Variables → Preview)

| Variável | Valor |
|---|---|
| `AUTH_PROVIDER` | `neon` |
| `DATA_BACKEND` | `postgres` |
| `DATABASE_URL` | string **pooled** do papel `educa_app`, branch `homolog`, banco `educa`, `sslmode=require` |
| `DATABASE_POOL_MAX` | `5` |
| `NEON_AUTH_BASE_URL` | `https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth` |
| `NEON_AUTH_SERVICE_EMAIL` / `NEON_AUTH_SERVICE_PASSWORD` | conta de serviço (role `admin`) criada no Neon Auth de homologação |
| `APP_URL` | URL do Preview |
| `SUPABASE_*`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_JWT_SECRET` | **não definir** (o modo postgres não usa; a ponte JWT fica inerte) |

Região das funções da Vercel: `gru1` (São Paulo), a mesma do Neon (sa-east-1).

## Passo a passo (dono do projeto)

1. Console Neon → projeto educa-erp-prod → branch `homolog` → Roles → `educa_app` →
   *Reset password*. A senha vai **só** para `DATABASE_URL` do Preview.
2. Ajustar o Neon Auth de homologação (tabela acima) e criar a conta de serviço.
3. Vercel: variáveis do Preview (tabela acima) e deploy do branch `poc/supabase-to-neon`.
4. Owner em homologação: criar o usuário do Owner no Neon Auth de homologação
   (Console → Auth → Users) e apontar o vínculo **só no banco `educa` da branch
   `homolog`**:
   ```sql
   update public.auth_identity_links set external_user_id = '<id do usuário no Neon Auth de homologação>'
   where provider = 'neon' and email = 'contatomarcusjr@gmail.com';
   ```
   Depois, "Esqueci a senha" no Preview.
5. Contas do E2E: com o Owner, criar a empresa B e convidar o admin B. Na ASTRA,
   convidar um admin A e um usuário com papel `leitura`. Cada convite chega por
   e-mail; a senha é criada no primeiro acesso.
6. GitHub → Settings → Environments → `homolog`: segredos listados em
   `.github/workflows/homolog-e2e.yml`. Actions → **homolog-e2e** → *Run workflow*
   com a URL do Preview.

## Validação do script sem o Preview

`e2e-homolog.mjs` só usa HTTP e navegador. Foi executado contra a pilha local
(app `next start` + Neon Auth dublê + PostgreSQL com esquema de produção), com as
senhas das 4 contas trocadas pela API admin do dublê em memória, sem gravar nem
imprimir segredos. Resultado em `../evidence/homolog-e2e-local.log`.
