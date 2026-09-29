# ATLAS.ERP — Supabase → Neon: estado atual, dependências e plano de desligamento

Documento vivo. Diz **o que já está no Neon, o que ainda depende do Supabase,
o que falta e o que precisa acontecer para desligar o Supabase**. Os
documentos anteriores ficam como registro histórico:
[`SUPABASE_TO_NEON_AUDIT.md`](SUPABASE_TO_NEON_AUDIT.md) (auditoria inicial),
[`NEON_AUTH_MIGRATION.md`](NEON_AUTH_MIGRATION.md) (Neon Auth, Plano A),
[`PRE_CUTOVER_CHECKLIST.md`](PRE_CUTOVER_CHECKLIST.md) e
[`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) (passo a passo da virada).

Levantamento de 29/09/2026: código da branch `claude/atlas-erp`; Supabase de
produção, Neon de produção e Neon de homologação consultados **só para
leitura**. Nada foi alterado em produção.

---

## 1. Resumo

| Camada | Produção hoje | Neon hoje | Situação |
|---|---|---|---|
| Aplicação (código) | modo `supabase` | modos `neon` e `neon + postgres` prontos e testados | ✅ código pronto para os dois provedores |
| Banco — esquema | Supabase, migrations até **0073** | Neon `main`: esquema até 0073; **homologação: até 0075** (29/09, com branch de segurança `homolog-antes-atlas-20260929`) | ⚠️ **0074 e 0075** fora da produção (Supabase e Neon `main`) |
| Banco — dados | Supabase (empresa ASTRA.ERP, cadastros fictícios, 2 logins) | Neon `main` **vazio** (1 empresa, 0 usuários); homologação com cópia fictícia | ❌ carga de dados não feita |
| Autenticação | Supabase Auth | Neon Auth: homologação ligada; produção com **login por e-mail/senha desligado** | ❌ configuração de produção pendente |
| E-mails de autenticação | remetente do Supabase | remetente **compartilhado** da Neon (`auth@mail.myneon.app`) | ⚠️ limitado; nome da aplicação ainda é o do projeto |
| Vercel | Production: `AUTH_PROVIDER=supabase` | Preview de homologação sem as variáveis do Neon | ❌ variáveis pendentes (painel) |

**Conclusão:** o ATLAS.ERP já **roda inteiro sobre o Neon** (banco + Neon Auth) na
homologação e na pilha local — o código não chama o Supabase nesse modo. O
Supabase continua sendo a **dependência de produção** porque os dados e os
logins de produção estão nele e porque o Neon de produção ainda não foi
configurado nem carregado. Trocar `AUTH_PROVIDER` sozinho **não** migra nada
(e o build de produção recusa a troca sem a confirmação do cutover — seção 9).

---

## 2. Modos da aplicação

Duas variáveis decidem o backend (lidas no build/servidor, nunca no navegador):

| `AUTH_PROVIDER` | `DATA_BACKEND` | Login | Dados | Uso |
|---|---|---|---|---|
| `supabase` (padrão) | ausente ou `supabase` | Supabase Auth | PostgREST do Supabase | **produção atual** |
| `neon` | ausente ou `supabase` | Neon Auth + ponte JWT | PostgREST do Supabase | Plano A (transição; não é o destino) |
| `neon` | `postgres` | Neon Auth | PostgreSQL direto (Neon) | **destino**; homologação e testes locais |

No modo destino (`neon` + `postgres`), nenhum código chama o Supabase:
`createClient()`/`createAdminClient()` devolvem o cliente PostgreSQL
(`src/lib/database/pg`), que imita a interface do supabase-js (inclusive
`auth.admin.listUsers/createUser` sobre `auth.users`), e o proxy usa a sessão
do Neon Auth.

---

## 3. Banco de dados

| Item | Supabase (produção) | Neon | Observação |
|---|---|---|---|
| PostgreSQL | 17.6, sa-east-1 | 17, `educa-erp-prod` (aws-sa-east-1) | mesma região das funções da Vercel (`gru1`) |
| Migrations | 84 registradas (versões próprias), última **0073** | esquema aplicado até 0073 (`poc/neon-full`, adaptador de SQL) | **0074** (reserva de estoque) e **0075** (papéis e convite da empresa) aplicadas **só na homologação Neon** (29/09); fora do Supabase e do Neon `main` |
| RLS / policies | 328 policies | as mesmas (conferidas no pré-cutover) | autoridade continua no banco |
| Funções / triggers | SECURITY DEFINER, `has_permission`, gatilhos de papéis e auditoria | as mesmas | GUC técnico `educa.auth_link` (0071/0072) mantido |
| Esquema `auth` | nativo do Supabase (`auth.users`, `auth.uid()`) | **réplica mínima** criada pelo adaptador (`auth.users`, `auth.uid()` lendo `request.jwt.claims`) | é o que mantém RLS e funções idênticas |
| Papéis do banco | `anon`, `authenticated`, `service_role` (Supabase) | recriados; login da aplicação `educa_app` | nome técnico mantido |
| Extensões | `pgcrypto` (schema `extensions`), `uuid-ossp` | equivalentes disponíveis no Neon | — |
| Sequences | numeração de documentos (`document_sequences`) | copiadas com os dados | conferir após a carga |
| Views | relatórios e painéis | as mesmas | — |
| Storage | **não usado** | — | nada a migrar |
| Realtime / Edge Functions / cron | **não usados** | — | nada a migrar |

---

## 4. Autenticação — mapa completo

| Fluxo | Supabase Auth (produção) | Neon Auth (destino) | Código |
|---|---|---|---|
| Login | `signInWithPassword` no navegador; cookies `@supabase/ssr` | `POST /api/auth/sign-in` → Neon Auth; cookie **HttpOnly** `educa_session` (nome técnico mantido) | `src/lib/auth/client.ts`, `src/lib/auth/neon/handlers.ts` |
| Sessão / refresh | proxy renova a sessão a cada navegação | sessão do Neon Auth (7 dias), validada no servidor; identidade só vale com vínculo (`auth_identity_links`, 0073) | `src/proxy.ts`, `src/lib/auth/neon/server.ts` |
| Logout | `signOut` | `POST /api/auth/logout` encerra a sessão no Neon e apaga o cookie | `src/app/api/auth/logout` |
| Convite | banco emite o convite (0071) + `inviteUserByEmail` (e-mail do Supabase) | banco emite o convite + conta criada no Neon Auth pela conta de serviço + login sombra + vínculo + **link de primeiro acesso** (e-mail de redefinição de senha do Neon) | `src/lib/auth/provisioning.ts`, `src/lib/api/onboarding-handlers.ts` |
| Criação de usuário | `auth.admin.createUser` | `admin/create-user` do Neon Auth (sem senha) | idem |
| Confirmação de e-mail | pelo link do convite | ao concluir o primeiro acesso, o servidor marca o e-mail como confirmado; conta não confirmada **não** entra | `src/lib/auth/neon/flows.ts` |
| Recuperação de senha | `resetPasswordForEmail` → `/auth/callback` → `/redefinir-senha` | `request-password-reset` do Neon → `/redefinir-senha` com token | `src/app/(auth)/recuperar-senha`, `/api/auth/password/*` |
| Redefinição de senha | `updateUser` | `reset-password` + revoga as outras sessões | `src/lib/auth/neon/flows.ts` |
| Troca de senha logado | **não existe** | **não existe** | pendência de produto (hoje: *Esqueci minha senha*) |
| Troca de e-mail | **não existe** | **não existe** | pendência de produto |
| Callback | `/auth/callback` (PKCE/OTP do Supabase) | não usado (links apontam para `/redefinir-senha`) | remover depois do Supabase |
| Tokens | JWT do Supabase | sessão do Neon; `SUPABASE_JWT_SECRET` só no Plano A | — |
| Trusted domains | Redirect URLs do painel do Supabase | *Trusted domains* do Neon Auth por branch | seção 7 |
| Cadastro público | desligado | recusado pela aplicação; **`allow_sign_up` ainda `true` nos dois Neon Auth** | pendência de configuração |

### Contas e vínculos (produção, somente leitura)

| Onde | Situação em 29/09/2026 |
|---|---|
| Supabase Auth | 2 logins: o **Owner** (sua conta, ativa) e o **Admin da plataforma** criado em 28/09 |
| `platform_members` | OWNER ativo e ADMIN ativo |
| Usuários de empresa | 10 cadastros da ASTRA, **nenhum com login**, **nenhum papel atribuído** |
| Convites | nenhum |
| Neon Auth de produção (`educa-auth-prod`) | a conta do Owner existe (registrada no runbook); nenhum outro usuário |

A sua conta de produção **não foi alterada**. Na migração, ela é recriada no
Neon Auth com o **mesmo `auth_user_id`** (a identidade do banco não muda) e
você cria a senha pelo link de primeiro acesso — o runbook descreve o passo.

---

## 5. E-mails de autenticação

O que o Neon Auth faz **hoje**, segundo a documentação oficial (*Auth
production checklist* e *Customize emails*, consultadas em 29/09/2026) e a
configuração lida dos projetos:

| Ponto | Situação |
|---|---|
| Remetente disponível sem domínio próprio | **Compartilhado**: `auth@mail.myneon.app`, nome "Neon Auth" — configurado em homologação e produção |
| Limite | o remetente compartilhado é **limitado** ("rate-limited") e indicado para desenvolvimento e testes. A documentação atual não publica o número; a versão consultada em 26/09 citava **2 e-mails de autenticação por hora por projeto** |
| Recuperação / redefinição de senha | **funciona** com o remetente compartilhado |
| Convite / primeiro acesso | funciona (é um e-mail de redefinição de senha do Neon) |
| Confirmação por **código** | funciona com o compartilhado |
| Confirmação por **link** | exige **SMTP próprio** |
| Nome exibido nos e-mails | **Application Name** do Neon Auth — hoje é o nome do projeto (`educa-erp-prod`, `educa-auth-prod`). **Precisa virar `ATLAS.ERP`** (painel Auth → Configuration → Project Info, por branch) |
| Remetente / modelo próprios | SMTP próprio (host, porta, usuário, senha, remetente) ou webhooks `send.otp` / `send.magic_link` |
| Modelos pelo painel | ainda não disponíveis na Neon (previstos) |

**O que isso significa para o ATLAS.ERP:** o Neon já assume todos os fluxos de
e-mail da autenticação usando o remetente compartilhado, sem domínio próprio.
Para produção com vários usuários, o limite do remetente compartilhado é o
mesmo tipo de gargalo do SMTP padrão do Supabase: **a solução definitiva é um
SMTP com domínio próprio** (vale para qualquer provedor). Enquanto isso, o
convite também entrega o **link para copiar** na tela, que funciona sem e-mail.

---

## 6. Aplicação — tudo que ainda usa o Supabase

| Onde | Uso | Quando roda | Destino |
|---|---|---|---|
| `package.json` | `@supabase/supabase-js`, `@supabase/ssr` | tipos em todo o código; execução só no modo `supabase` | remover após a janela de volta (troca de tipos em ~30 handlers) |
| `src/lib/supabase/{server,admin,client,env}.ts` | fábrica de clientes; no modo `postgres` devolve o cliente PostgreSQL | sempre (despacho) | virar `src/lib/database/client.ts` sem o SDK |
| `src/proxy.ts` | `createServerClient` (renovação de sessão) | só `AUTH_PROVIDER=supabase` | remover o ramo Supabase |
| `src/app/auth/callback/route.ts` | `exchangeCodeForSession`, `verifyOtp` | só `supabase` | remover a rota |
| `src/lib/auth/client.ts` | login/senha no navegador pelo SDK | só `supabase` | remover o ramo Supabase |
| `src/lib/auth/session.ts`, `context.ts` | `auth.getUser()` | só `supabase` | idem |
| `src/lib/api/onboarding-handlers.ts` | `auth.admin.inviteUserByEmail` | só `supabase` | idem |
| `scripts/bootstrap-platform-owner.mjs` | `auth.admin.*` | bootstrap do Owner | manter só o caminho Neon |
| `src/lib/auth/neon/server.ts` | `SUPABASE_JWT_SECRET` (ponte do Plano A) | só `neon` + dados no Supabase | remover com o Plano A |
| `public/landing/index.html` | encaminha `#access_token=…` (links antigos do Supabase) para `/login` | sempre | remover depois que não houver links antigos |
| Variáveis | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` | Production | apagar da Vercel após a janela de volta |
| `.env.local.example` | exemplo com as variáveis do Supabase | desenvolvimento | reescrever para o modo Neon |
| Workflows do GitHub | **nenhum** usa segredo do Supabase | — | — |
| `supabase/` | pasta das migrations (nome histórico) | sempre | manter o caminho (histórico e scripts dependem dele) |

---

## 7. Configuração necessária

### Variáveis (Vercel)

| Variável | Valor | Ambiente | Observação |
|---|---|---|---|
| `AUTH_PROVIDER` | `neon` | Preview (branch) e, no cutover, Production | entra no **build** (redeploy obrigatório) |
| `DATA_BACKEND` | `postgres` | idem | — |
| `DATABASE_URL` | conexão *pooled* do Neon com o papel `educa_app` | idem | **Sensitive** |
| `DATABASE_POOL_MAX` | `5` (opcional) | idem | — |
| `NEON_AUTH_BASE_URL` | URL do Neon Auth da branch | idem | homologação: `…ep-royal-flower-b6tz0xde…/authdb/auth` |
| `NEON_AUTH_SERVICE_EMAIL` / `NEON_AUTH_SERVICE_PASSWORD` | conta de serviço (`scripts/neon-service-account.mjs`) | idem | senha **Sensitive** |
| `APP_URL` | origem pública do ambiente | idem | usada nos links de convite |
| `APP_ENV` | `homologacao` | só Preview de homologação | mostra o selo e a trava |
| `EDUCA_CUTOVER_NEON_CONFIRMADO` | `sim` | só Production, **no dia do cutover** | nome técnico mantido |
| `SUPABASE_*` | `desativado` | Preview de homologação | a trava recusa o build se ativas |

### Neon (por branch do Neon Auth)

1. **Application Name = `ATLAS.ERP`** (homologação e produção) — hoje os e-mails mostram o nome do projeto.
2. **Email/password habilitado** — **desligado** no Neon Auth de produção.
3. **Cadastro público desligado** (`allow_sign_up: false`) — hoje `true` nos dois.
4. **Trusted domains:** produção só o domínio público; homologação, as URLs do Preview (a da branch `claude/atlas-erp` incluída).
5. **Allow localhost:** desligado em produção (já está); ligado só em homologação.
6. **Conta de serviço** criada e com a senha na Vercel.
7. **SMTP próprio** quando houver domínio (remetente com SPF/DKIM).

### Vercel

- Preview da branch com as variáveis da tabela **restritas à branch** (senão ele usa as variáveis gerais de Preview, que apontam para o Supabase de produção).
- Production só muda no cutover, com o runbook.

---

## 8. Responsabilidade da aplicação (independe do provedor)

- **Autorização:** RBAC e RLS no banco (`has_permission`, papéis, isolamento por empresa). O provedor só diz **quem** é a pessoa.
- **Convites:** emitidos, validados e aceitos pelo banco (token em hash, uso único, validade, e-mail conferido).
- **Vínculo de identidade:** só o servidor liga uma conta do Neon Auth a um `auth_user_id`, e só com e-mail confirmado e igual ao do login.
- **Governança:** Owner/Admin da plataforma × Administrador da empresa × operação (papéis de sistema e anti-escalada, migration 0075).
- **Telas de acesso:** login, primeiro acesso, recuperação, aceite de convite (as mesmas nos dois provedores).

---

## 9. Antes de qualquer cutover (checklist)

1. ~~Aplicar **0074** e **0075** na homologação~~ — feito em 29/09 (branch de segurança antes); validar no Preview (RBAC, convite, reserva de estoque).
2. Configurar o Preview da branch para a homologação Neon e fazer o QA com a conta QA.
3. Neon Auth de produção: login habilitado, cadastro público desligado, Application Name `ATLAS.ERP`, trusted domain de produção, conta de serviço.
4. **Mapa de identidades**: para cada login do Supabase (hoje 2), criar a conta no Neon Auth com o mesmo e-mail e vincular ao mesmo `auth_user_id`.
5. **Carga de dados** Supabase → Neon `main` com contagem por tabela e sequences (roteiro de ensaio em `poc/neon-full`).
6. Conferir papéis, permissões, `user_roles`, convites e isolamento entre empresas no Neon (`tests/*-db.test.ts` contra uma branch de ensaio).
7. Snapshot/branch de segurança do Neon `main` antes da carga final.
8. Variáveis de Production + `EDUCA_CUTOVER_NEON_CONFIRMADO=sim` + deploy novo.
9. Smoke somente leitura e login do Owner.

### Rollback

- **Aplicação:** voltar as variáveis de Production para `AUTH_PROVIDER=supabase` e sem `DATA_BACKEND`, e promover o deploy anterior (a Vercel mantém os deploys). O Supabase fica intacto e somente leitura durante a janela de volta.
- **Banco:** restaurar a branch de segurança do Neon (instant restore) se a carga falhar.
- **Dados escritos no Neon durante a janela** não voltam sozinhos ao Supabase: a janela deve ser curta e a decisão de encerrá-la explícita.

---

## 10. Plano de remoção definitiva do Supabase

Só depois do cutover estável (sugestão: 2 semanas):

1. Remover o ramo `supabase` de `proxy.ts`, `auth/client.ts`, `session.ts`, `context.ts`, `onboarding-handlers.ts` e a rota `/auth/callback`.
2. Remover a ponte do Plano A (`SUPABASE_JWT_SECRET`, `neon-bridge` no modo misto).
3. Trocar os tipos `SupabaseClient` pelo tipo do cliente PostgreSQL e remover `@supabase/supabase-js` e `@supabase/ssr`.
4. Remover o encaminhamento de `#access_token` da landing.
5. Apagar as variáveis `SUPABASE_*` da Vercel; reescrever `.env.local.example`.
6. Pausar o projeto Supabase (backup final guardado); excluir só com a sua autorização.

Cada passo é um commit separado e reversível.
