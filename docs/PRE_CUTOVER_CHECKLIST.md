# Checklist pré-cutover — estado verificado em 2026-09-27

Cada linha foi conferida nesta data (Neon e Supabase pelo MCP, só leitura em
produção; Vercel pela sonda do GitHub, `poc/neon-full/evidence/homolog-probe.md`).
Nada aqui executa a virada. **Veredito: NÃO pronto**, porque o portão E
(homologação real) não passou.

Legenda: ✅ pronto · ❌ falta · ⚠️ pronto com ressalva · 👤 depende do dono ·
🤖 posso executar

## Destino (Neon de produção)

| Item | Estado verificado | |
|---|---|---|
| Projeto | `educa-erp-prod` `old-butterfly-53570465`, aws-sa-east-1, PG 17.11 | ✅ |
| Banco `educa` | collation ICU `en-US` (igual ao Supabase) | ✅ |
| Esquema em `main` | 172 tabelas, 328 policies, 330 funções, 171 gatilhos, 172 com RLS. Corpo das funções igual ao ensaio (`b9cb8656…`), e as 7 diferenças com produção são só comentários | ⚠️ |
| Esquema do Supabase congelado | corpo das funções `aaf34b2b…`, igual ao de 2026-09-26; 84 migrations | ✅ (manter congelado até a janela) |
| Dados em `main` | só as linhas de semente do plano (1 empresa, ~1,4 mil linhas de catálogo). `copy-data.sh` faz `TRUNCATE` de tudo antes de copiar | ✅ |
| Papéis | anon/authenticated sem login; service_role BYPASSRLS; `educa_app` LOGIN NOINHERIT, só SET nos 3 papéis, 0 privilégio direto, CONNECT em `educa` | ✅ |
| Senha do `educa_app` em `main` | **não existe** (de propósito até o dia) | ❌ 👤 Console → Roles → Reset. A string vai só para a variável de Produção da Vercel |
| Retenção de histórico (PITR) | 6 h (21.600 s) | ❌ 👤 subir para ≥ 7 dias (depende do plano Neon) |
| Script de cópia | testado localmente (FKs com ciclo, sequences, idempotente, travas) | ⚠️ não executado Supabase→Neon real (precisa de rede e da senha do banco do Supabase: 👤 roda na máquina do dono ou em CI com os segredos) |

## Autenticação (Neon Auth de produção `educa-auth-prod`)

| Item | Estado verificado | |
|---|---|---|
| Owner | `33e3fb0b…` existe; vínculo `auth_identity_links` → `auth.users 527fad15…` → `platform_members` OWNER | ✅ |
| Owner: senha / e-mail | sem senha, `emailVerified=false` | ⚠️ esperado: primeiro acesso por "Esqueci a senha" no smoke (runbook passo 18) |
| `email_password.enabled` | **false** | ❌ 👤 Console (sem isso ninguém entra) |
| `allow_sign_up` | **true** | ❌ 👤 Console (cadastro público aberto) |
| `allow_localhost` | false | ✅ |
| OAuth | nenhum | ✅ |
| Trusted origins | só `https://educaerp.vercel.app` | ✅ |
| Conta de serviço `svc-educa@educaerp.com` | papel admin, **sem senha** (de propósito) | ❌ 👤 `scripts/neon-service-account.mjs` na máquina do dono → SQL (só hash) no SQL Editor → senha direto na Vercel |
| E-mail | remetente compartilhado do Neon | ⚠️ 👤 recomendado remetente próprio |
| Login / recuperação | provados no E2E local (210/210) e no script de homologação (33/33 local) | ⚠️ **não provados contra app publicado** (portão E) |

## Aplicação (Vercel)

| Item | Estado verificado | |
|---|---|---|
| Produção | `AUTH_PROVIDER=supabase`, sem proteção, API 401 correta | ✅ inalterada |
| **Região das funções** | **`iad1` (Washington)** | ❌ 👤 Settings → Functions → `gru1` (São Paulo). Mudar na janela (é configuração de produção) |
| Variáveis de Produção para o cutover | lista no runbook passo 16 | ❌ 👤 (e remover `SUPABASE_JWT_SECRET`, se existir) |
| Preview da branch | existe, atrás da **Vercel Authentication**, e sem variáveis de homologação | ❌ 👤 ver `poc/neon-full/homolog/README.md` §Passo a passo |
| Build nos dois modos | Supabase e postgres | ✅ |
| Testes | `npm test` 719/719, tsc ok | ✅ |

## Homologação (portão E)

| Item | Estado verificado | |
|---|---|---|
| Banco `homolog` | cópia fiel (173 tabelas, `3a89c64e…`), 171 gatilhos | ✅ |
| Neon Auth de homologação | e-mail/senha ligado; OAuth removido 🤖; trusted origin só o Preview 🤖 | ✅ |
| `allow_sign_up` / `allow_localhost` (homologação) | ainda true / true | ❌ 👤 Console (o MCP não expõe esses campos) |
| Conta de serviço + Owner de homologação | criados sem senha 🤖; vínculo do Owner apontado só na branch `homolog` 🤖 | ⚠️ falta a senha da conta de serviço (👤 script) |
| `educa_app` em `homolog` | sem senha | ❌ 👤 Console → branch `homolog` → Reset |
| Variáveis do Preview + proteção | não configuradas | ❌ 👤 Vercel |
| Contas de teste + segredos do GitHub (ambiente `homolog`) | não existem | ❌ 👤 |
| E2E contra o Preview (33 verificações) | **NÃO EXECUTADO** | ❌. Depois dos itens 👤, eu disparo (push em `homolog/RUN_E2E`) e investigo as falhas |

## Rollback

| Item | Estado | |
|---|---|---|
| Supabase de produção intacto | somente leitura por esta sessão | ✅ |
| Caminho de volta | *Promote* do deployment anterior na Vercel + `alter role authenticator reset default_transaction_read_only` | ✅ documentado (runbook §Rollback) |
| Dados gravados no Neon depois da virada | reaplicação manual (T0) | ⚠️ por decisão de segurança (o script nunca grava no Supabase) |

## Quem faz o quê

**Eu (sem segredo e sem tocar produção):** disparar e analisar o E2E de
homologação quando os itens 👤 estiverem prontos; corrigir o que for da migração;
rodar a sonda de novo; ajustar trusted origins/OAuth pelo MCP; as sondas de segurança
no dia (branch filha de `main`); conferências de hash antes e depois da cópia.

**O dono (só no painel/máquina dele, nunca pelo chat):**
1. Vercel: variáveis do Preview da branch + proteção (bypass ou desligada).
2. Neon Console, homologação: `allow_sign_up` off, `allow_localhost` off, senha do
   `educa_app` na branch `homolog`.
3. Máquina local: `scripts/neon-service-account.mjs` para homologação (SQL no
   `authdb` da branch `homolog`) → senha direto na Vercel (Preview).
4. Contas de teste pelo Preview (Owner por "Esqueci a senha", convites) e segredos
   no ambiente `homolog` do GitHub.
5. Para o dia do cutover: Neon Auth de produção (e-mail/senha on, cadastro off),
   conta de serviço de produção, senha do `educa_app` em `main`, região `gru1`,
   retenção ≥ 7 dias, senha do banco do Supabase para o `copy-data.sh` (na máquina
   dele ou como segredo de CI).
