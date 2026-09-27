# Checklist pré-cutover — estado verificado em 2026-09-27 (rodada 3)

Cada linha foi conferida nesta data. Neon e Supabase pelo MCP, só leitura em
produção. Vercel e Neon Auth pela sonda no runner do GitHub
(`poc/neon-full/evidence/homolog-probe.md`, run 36293119479). Nada aqui executa a
virada. **Veredito: NÃO pronto**, porque o portão E (homologação real) não passou
(ver §BLOQUEIA CUTOVER).

Legenda: ✅ pronto · ❌ falta · ⚠️ pronto com ressalva · 👤 depende do dono ·
🤖 feito por mim

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
| Região `gru1` | `vercel.json` com `regions: ["gru1"]` no código 🤖 (build, tsc e lint ok). Vale para a produção quando o PR chegar à `main` (runbook passo 5) | ⚠️ aplicado no código, não em produção |
| Variáveis de Produção | lista no runbook passo 16 | ❌ 👤 |
| Build nos dois modos / testes | Supabase e postgres; `npm test` 719/719; E2E local 210/210 (de novo hoje) | ✅ |

## Homologação (portão E)

| Item | Estado | |
|---|---|---|
| Banco `homolog` | cópia fiel de produção (173 tabelas) | ✅ |
| Neon Auth de homologação | e-mail/senha ligado; OAuth removido 🤖; trusted origin só o Preview 🤖; recuperação provada (200; redirect de outra origem 403) 🤖 | ✅ |
| `allow_sign_up` / `allow_localhost` | **ligados** (MCP e sonda). O MCP não altera | ❌ 👤 Console |
| Owner de homologação | 1 identidade (`2cdfefb7…`); vínculo só na branch `homolog`; 1 OWNER ativo; nenhum duplicado | ✅ |
| Contas de teste | automáticas: `bootstrap-homolog.mjs` 🤖, 33/33 local duas vezes seguidas | ✅ |
| Conta de serviço (senha) | não existe | ❌ 👤 |
| `educa_app` em `homolog` (senha) | não existe | ❌ 👤 |
| Preview: variáveis + bypass | não configurados; Vercel Authentication ativa | ❌ 👤 |
| Segredos do GitHub (`homolog`) | não existem | ❌ 👤 |
| E2E contra o Preview | **NÃO EXECUTADO** | ❌ roda assim que os itens 👤 acima estiverem prontos |

## Rollback

| Item | Estado | |
|---|---|---|
| Supabase de produção | intacto, só leitura nesta sessão | ✅ |
| Caminho de volta | *Instant Rollback* do deployment anterior + `alter role authenticator reset default_transaction_read_only` | ✅ documentado |
| Dados gravados no Neon após a virada | reaplicação manual (T0) | ⚠️ por decisão de segurança |

---

## BLOQUEIA CUTOVER

Só o que impede a virada de funcionar ou de ser verificada.

1. **Portão E: E2E 33/33 contra o Preview real.** Depende de AÇÃO HUMANA 1–5.
2. **Neon Auth de produção:** `email_password.enabled` = true e `allow_sign_up` =
   false. Sem o primeiro, ninguém entra; sem o segundo, qualquer pessoa cria conta
   (o app recusa login sem vínculo, mas a conta existe no Auth).
3. **Conta de serviço de produção com senha.** Sem ela não há convites nem
   administração de identidades.
4. **Senha do `educa_app` em `main`** → `DATABASE_URL` de Produção.
5. **Variáveis de Produção** (runbook passo 16).
6. **Código na `main`** (PR `poc/supabase-to-neon` → `main`, runbook passo 5). O
   modo Neon só existe neste código.
7. **Cópia real Supabase→Neon** na janela (runbook passo 12): `copy-data.sh` com a
   senha do banco do Supabase, ou o mesmo caminho do ensaio (leitura pelo MCP do
   Supabase, gravação pelo MCP do Neon, 173/173 conferidas por md5), que não precisa
   de senha e que eu executo com a aprovação na hora.

## NÃO BLOQUEIA CUTOVER (recomendado)

- Retenção de 7 dias (exige plano pago). Sem ela: 6 h de PITR + Supabase só
  leitura 14 dias + branch `pre-cutover` + branches manuais diárias.
- Região `gru1` em produção: já está no `vercel.json` e passa a valer com o PR. Se
  o PR atrasar, trocar no painel. `iad1` funciona, só fica mais lento.
- Neon Auth de produção em us-east-1: aceitável com o cache de sessão; mover para
  sa-east-1 exigiria recriar o Owner e o vínculo.
- Remetente próprio de e-mail no Neon Auth.
- Compute maior que 0,25 CU / sem escala a zero (plano pago), se a latência de
  partida a frio incomodar.
- Débitos pré-existentes (`docs/DEBITOS_PRE_EXISTENTES.md`), fora do cutover.
- Limpeza de branches de ensaio (runbook passo 28, com aprovação).

## AÇÃO HUMANA (o que esta sessão comprovadamente não consegue)

Motivo comum: esta sessão não tem conector da Vercel, a rede recusa `vercel.com` e
`*.neon.tech` (403 no proxy), o MCP do Neon não altera `allow_sign_up`,
`allow_localhost` nem `email_password` (o `update_auth_config` só muda o nome), e
senha nenhuma pode passar pelo chat.

**Homologação** (passo a passo em `poc/neon-full/homolog/README.md`):

1. Neon Console → educa-erp-prod → branch `homolog` → Auth → Settings: *Allow
   sign-ups* off, *Allow localhost* off.
2. Neon Console → branch `homolog` → Roles → `educa_app` → Reset password → string
   pooled só na `DATABASE_URL` do Preview.
3. Máquina local: `scripts/neon-service-account.mjs` → SQL (hash) no `authdb` da
   branch `homolog` → senha na variável do Preview e no segredo do GitHub.
4. Vercel: variáveis do Preview (branch `poc/supabase-to-neon`) + *Protection
   Bypass for Automation* + Redeploy.
5. GitHub → Environments → `homolog`: `NEON_AUTH_SERVICE_EMAIL`,
   `NEON_AUTH_SERVICE_PASSWORD`, `VERCEL_BYPASS_TOKEN`. Depois me avisar, e eu
   disparo e analiso o E2E.

**Cutover** (runbook):

6. Neon Console, `educa-auth-prod`: e-mail/senha on, sign-ups off; conta de serviço
   de produção (script → SQL → Vercel).
7. Senha do `educa_app` em `main` → `DATABASE_URL` de Produção.
8. Aprovar o PR `poc/supabase-to-neon` → `main` (eu abro quando pedir).
9. Variáveis de Produção na Vercel + redeploy (na janela).
10. `pg_dump -Fc` de backup do Supabase (precisa da senha do banco, na máquina do
    dono). A cópia em si pode ir pelo caminho do MCP, sem senha (BLOQUEIA 7).
11. Opcional: upgrade do plano Neon (retenção de 7 dias).

**Eu faço** (sem segredo): disparar e analisar o E2E de homologação e corrigir o
que for da migração; abrir o PR quando pedido; sonda antes e depois do deploy;
branch `pre-cutover`; hashes antes e depois da cópia; as 56 sondas de segurança
numa branch filha de `main`.
