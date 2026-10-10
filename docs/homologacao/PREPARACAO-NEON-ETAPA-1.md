# Etapa 1 — Preparação da infraestrutura Neon (10/10/2026)

Branch `claude/atlas-neon-ux-crm`. **Nada foi alterado em produção, no Supabase
ou no Neon.** Supabase de produção (`educa.erp`, sa-east-1) consultado só para
leitura: catálogo do banco, contagens agregadas e logs de autenticação. O Neon
não foi acessado: o conector do Neon desta sessão exige autorização e o
contêiner não alcança `*.neon.tech` (mesma limitação registrada nas rodadas
anteriores).

Este documento complementa [`../SUPABASE_PARA_NEON.md`](../SUPABASE_PARA_NEON.md)
(estado e plano), [`../PRE_CUTOVER_CHECKLIST.md`](../PRE_CUTOVER_CHECKLIST.md) e
[`../CUTOVER_RUNBOOK.md`](../CUTOVER_RUNBOOK.md). Não repete o que já está lá;
registra o que mudou e o que foi comprovado agora.

## 1. Ponto de partida encontrado

A preparação Neon já existia e estava avançada no `main` (branches
`poc/supabase-to-neon` e `feat/neon-auth-migration` integradas, sem commits
pendentes):

| Peça | Onde | Situação |
|---|---|---|
| Seleção de backend | `DATA_BACKEND` (`supabase`/`postgres`, falha fechada), `AUTH_PROVIDER` (`supabase`/`neon`) | pronta |
| Cliente PostgreSQL no formato do supabase-js | `src/lib/database/pg` | pronto (323 `.from()`, 233 `.rpc()` sem mudança) |
| Neon Auth | `src/lib/auth/neon/*`, `src/lib/auth/provisioning.ts`, rotas `/api/auth/*` | pronto (login, sessão, logout, convite, primeiro acesso, recuperação) |
| Reconstrução do banco | `poc/neon-full/plan-prod-equivalente.txt` (93 arquivos) + `build-local.sh` | pronta |
| Compatibilidade Supabase → Postgres puro | `poc/neon-full/sql/00_supabase_compat.sql` (papéis `anon`/`authenticated`/`service_role`, `auth.uid()`, `auth.users` sem senha), `10_app_login_role.sql` (`educa_app`) | pronta |
| Cópia de dados | `poc/neon-full/migrate/copy-data.sh` + `table-hashes.sql` | pronta, **não executada** contra produção |
| Proteção de produção | `scripts/homolog/vercel-guard.mjs` (build recusa trocar o backend sem `EDUCA_CUTOVER_NEON_CONFIRMADO=sim`), testes `homolog-guard`/`environment` | ativa — **não foi alterada** |

Supabase: Storage, Realtime, Edge Functions e cron **não são usados** (confirmado
no código; nada a migrar). Autorização = RBAC + RLS no banco (`has_permission`,
328 policies).

### O que mudou desde o último registro (29/09)

| Item | Documentado | Verificado em 10/10 |
|---|---|---|
| Migrations no Supabase de produção | até 0073 | **até 0075** (`0074` às 16:54 e `0075` às 16:56 de 29/09, em `supabase_migrations.schema_migrations`) |
| Neon `main` | até 0073 | não verificável nesta sessão (sem acesso ao Neon) |
| Uso de produção | 2 logins, dados fictícios | **4 empresas, 8 logins (6 com acesso nos últimos 7 dias), 14 convites, 20 clientes**, 0 leads, 0 pedidos de venda; banco com 28 MB |

Consequência: **o Neon `main` está duas migrations atrás da produção** e a
produção já tem pessoas reais usando. A cópia de dados e o mapa de identidades
(runbook) passam a envolver contas reais, não só o Owner.

## 2. Esquema-destino: o que foi feito e comprovado

Sem acesso ao Neon, a validação foi feita num **PostgreSQL 16 local**
(o Neon é 17), com o plano do repositório, e comparada com a **produção atual**
por uma consulta que só lê o catálogo.

| Verificação | Resultado |
|---|---|
| Reconstrução do zero pelo plano (`build-local.sh`) | **93/93** arquivos, 0 erro |
| Caminho do Neon `main`: banco até 0073 + `0074` + `0075` aplicadas por cima | esquema **idêntico** à reconstrução completa (mesma impressão digital) |
| Impressão digital normalizada × **Supabase de produção hoje** | **9 de 10 categorias idênticas**: colunas (2.153), constraints (1.350), funções com corpo (336), permissões de funções (336), índices (706), policies (328), RLS (172), triggers (171), views (4) |
| 10ª categoria (`tacl`, permissões de tabela) | difere **só** pelo privilégio `MAINTAIN` (`m`), que existe no PostgreSQL 17 e não no 16: mesmos 3 padrões e as mesmas contagens (170/1/1) dos dois lados. A evidência anterior registra o Neon `main` com o mesmo hash da produção nessa categoria |
| Testes do repositório contra o banco reconstruído (`POC_DATABASE_URL`/`POC_DATABASE_OWNER_URL`) | 806 no total: 796 aprovados, 3 `todo` (defeitos do banco, §2), 7 cancelados no teste preexistente de reserva (precisa da semente fictícia de homologação, ausente no banco local); 0 falhas |
| E2E local (app compilado, `AUTH_PROVIDER=neon`, `DATA_BACKEND=postgres`, nenhuma variável `SUPABASE_*`) | **210/210** (depois de corrigir o roteiro, §5) |

Reprodução, sem rede e sem segredos:

```bash
PGPORT_POC=55440 poc/neon-full/tools/verify-schema-local.sh
```

O script (novo) reconstrói o plano completo, reconstrói até 0073 e aplica o
delta, compara os dois e imprime a impressão digital. A mesma consulta
(`poc/neon-full/sql/fingerprint-normalized.sql`, novo, só leitura) roda no Neon
e no Supabase para comparar.

### Atualização do Neon `main` (preparada, não executada)

O que falta no destino é aplicar, nesta ordem, as duas migrations que a
produção já tem — exatamente o que o script prova localmente:

1. `supabase/migrations/0074_fix_reserve_sales_order_stock.sql`
2. `supabase/migrations/0075_company_roles_and_user_invites.sql`

Antes: branch de segurança do `main` no Neon. Depois: a consulta de impressão
digital no Neon `main` (banco `educa`) tem de dar os mesmos hashes da produção
na tabela acima, inclusive `tacl` (`472ac385…`). **Isso exige o seu acesso ao
Neon** (Console ou conector autorizado) e fica para a próxima etapa.

### Itens de banco que precisam de decisão (não aplicados)

A investigação do CRM e da interface encontrou **defeitos que já estão em
produção** (corpo das funções com o mesmo md5 do repositório). Preparei
correções como **propostas**, fora da cadeia de migrations, para que o destino
continue idêntico à produção até a sua decisão:

| Proposta | Corrige | Validação |
|---|---|---|
| [`../CRM/proposta-0076-crm-conversoes.sql`](../CRM/proposta-0076-crm-conversoes.sql) | lead → cliente e lead → oportunidade sempre falham; lead convertido pode voltar a `NEW` | cópia descartável do banco: 12/12 em `tests/crm-funnel-db.test.ts` (sem a proposta: 9 + 3 `todo`) |
| [`proposta-relatorios-ambiguidade.sql`](proposta-relatorios-ambiguidade.sql) | painéis Fiscal, Estoque e Produção sempre em erro (`column reference ... is ambiguous`) | cópia descartável: as 3 funções falham antes e respondem depois |
| (sem SQL ainda) permissões `units.*`, `product_categories.*`, `product_brands.*`, `unit_conversions.*` | a API exige códigos que não existem no catálogo (nem em produção) | ver [`AVALIACAO-UX-UI-ATLAS.md`](AVALIACAO-UX-UI-ATLAS.md) U-01 |

Se aprovadas, viram migrations `0076`/`0077` aplicadas **no Supabase e no Neon**,
para os dois continuarem iguais até o cutover.

## 3. Autenticação

O código para o Neon Auth já estava pronto (tabela em
`SUPABASE_PARA_NEON.md` §4). Nesta etapa:

| Fluxo | Validado agora (E2E local, Neon Auth dublê = Better Auth 1.4.18, o motor do Neon Auth) |
|---|---|
| Login, sessão (cookie HttpOnly `educa_session`, SameSite=Lax), logout | ✅ |
| Convite → conta no Neon Auth pela conta de serviço → login sombra → vínculo `auth_identity_links` → link de primeiro acesso | ✅ |
| Primeiro acesso (criar senha) e confirmação do e-mail pelo servidor | ✅ |
| Recuperação e redefinição de senha (revoga as outras sessões) | ✅ |
| Contexto da sessão, redirecionamento por perfil (`/app`, `/app/admincentral`), isolamento entre empresas A/B, RBAC | ✅ |
| Telas de acesso (login, recuperar, link expirado, convite inválido) em 1280 px e 390 px | ✅ revisadas no navegador |

**Não validado** (depende de você): o serviço Neon Auth real de produção e de
homologação. Pendências de configuração continuam as de
`PRE_CUTOVER_CHECKLIST.md` (e-mail/senha desligado e cadastro público aberto em
produção, conta de serviço sem senha, trusted domains, *Application Name*).

**Credenciais:** senhas **não** são migradas. Cada login do Supabase é recriado
no Neon Auth com o mesmo `auth_user_id` e a pessoa cria a senha pelo link de
primeiro acesso (runbook). Com 8 logins reais hoje, isso significa 8 e-mails de
primeiro acesso no dia — ver §4, porque o remetente compartilhado do Neon não
comporta isso.

## 4. E-mail transacional — origem da limitação

### Evidência (logs de autenticação de produção, últimas 24 h, só leitura)

| Sinal | Quantidade |
|---|---|
| `POST /invite` respondido com **`429: email rate limit exceeded`** | **7** |
| Convites efetivamente enviados (`mail.send`, tipo `invite`) | 2 |
| Remetente | `noreply@mail.app.supabase.io` (SMTP **padrão** do Supabase) |
| Cliques em link de convite já inválido (`403: Email link is invalid or has expired`) | 3 |
| Pedidos de recuperação de senha (`/recover`) | sem `mail.send` correspondente no período |

### Diagnóstico

- O ATLAS.ERP **não envia e-mail próprio**: convite e recuperação saem do
  provedor de autenticação (`auth.admin.inviteUserByEmail` /
  `resetPasswordForEmail` no Supabase; `request-password-reset` no Neon Auth).
  Quando o envio falha, o app já mostra o **link para copiar** (`deliveryNote`).
- A limitação vem do **SMTP padrão do Supabase**, que tem cota muito baixa por
  hora e é indicado só para testes. Não há SMTP próprio configurado (o
  remetente é o do Supabase).
- Os links inválidos têm causa provável no reenvio: o mesmo e-mail aparece
  convidado várias vezes nos logs, e cada convite novo invalida o link do
  anterior. **Não validado** de ponta a ponta.
- **Trocar para o Neon Auth não resolve sozinho**: o remetente compartilhado do
  Neon (`auth@mail.myneon.app`) também é limitado e indicado para
  desenvolvimento (`SUPABASE_PARA_NEON.md` §5).

### Arquitetura recomendada (preparada, depende de você)

```
App (convite/recuperação) ──▶ Provedor de auth (Supabase Auth hoje / Neon Auth depois)
                                   │ SMTP próprio (configuração no painel do provedor)
                                   ▼
                     Provedor transacional (Amazon SES, Postmark, Resend, Brevo…)
                                   │ domínio próprio verificado: SPF + DKIM + DMARC
                                   ▼
                                Caixa do usuário
```

- Os e-mails de autenticação **devem continuar saindo do provedor de auth**,
  porque é ele que gera e valida os tokens. A correção é configurar **SMTP
  próprio** no provedor, não enviar pelo app.
- Funciona **já no Supabase** (Authentication → Emails → SMTP Settings), sem
  esperar o cutover, e depois no Neon Auth (SMTP próprio por branch).
- Passos: (1) escolher o provedor transacional; (2) domínio ou subdomínio de
  envio (ex.: `mail.<seu-domínio>`) com SPF, DKIM e DMARC; (3) usuário/senha
  SMTP só no painel do provedor de auth (nunca no Git); (4) ajustar a cota de
  e-mails de auth no Supabase; (5) testar com um e-mail seu.
- **Não implementado:** não há domínio verificado nem credencial SMTP; nenhum
  e-mail foi enviado; nenhuma configuração do Supabase foi alterada.
- Nenhuma mudança de código é necessária para isso. Um envio pelo próprio app
  (ex.: o link do convite do ATLAS.ERP) só faria sentido como canal adicional e
  mudaria o fluxo de convite — fica como decisão de produto, não feito.

## 5. O que foi alterado no repositório nesta frente

| Arquivo | Mudança |
|---|---|
| `poc/neon-full/e2e/e2e-postgres.mjs` | o aceite de convite leva a `/app` desde 28/09; o roteiro esperava `/` ou `/admin` e parava em 24/25 |
| `poc/neon-full/tools/verify-schema-local.sh` | novo: verificação reproduzível do esquema-destino e do delta |
| `poc/neon-full/sql/fingerprint-normalized.sql` | novo: impressão digital normalizada (só leitura) |
| este documento | novo |

## 6. Resumo: criado × executado × testado × pendente

| | |
|---|---|
| **Criado** | script de verificação do esquema, consulta de impressão digital, propostas SQL (CRM e relatórios), este documento |
| **Executado** | reconstrução local do destino (93/93); delta 0073→0075; E2E local 210/210; consultas só de leitura na produção |
| **Testado** | igualdade do esquema local × produção (9/10 + `tacl` explicado); fluxos de autenticação no modo Neon; testes automatizados (779 sem banco; com banco 796 aprovados, 3 `todo`, e o teste preexistente de reserva cancelado por falta da semente fictícia de homologação no banco local) |
| **Depende de credenciais/configuração externa** | acesso ao Neon (aplicar 0074/0075 no `main`, comparar hashes); configuração do Neon Auth de produção; senha do `educa_app`; variáveis da Vercel; SMTP próprio + domínio |
| **Depende da migração de dados** | cópia Supabase → Neon (`copy-data.sh` + hashes por tabela), sequences, mapa das 8 identidades reais, convites pendentes |
| **Validar na próxima etapa** | esquema do Neon `main` após o delta (hashes = produção, inclusive `tacl`); ensaio de cópia numa branch do Neon; E2E de homologação contra o Preview; envio real por SMTP próprio |
