# Migração Supabase Auth → Neon Auth — auditoria e decisão de arquitetura

Branch: `feat/neon-auth-migration` (a partir de `main` em `d7d448f`).
Estado (2026-09-25): **Plano A — POC concluída (§8)**. As §1–§7 são a
auditoria de 2026-09-24 e ficam como histórico. O bloqueio B2 da §5 foi
revisto pela POC: a identidade do Neon Auth chega à RLS do Supabase por
uma ponte no servidor, sem mover o banco e sem alterar policies.

Nada foi alterado em produção, no banco, na `main` ou em variáveis de
ambiente. As consultas ao banco de produção foram somente leitura.

---

## 1. Motivação e premissa

Motivação: o envio de e-mails de autenticação (convite, primeiro acesso,
recuperação) pelo SMTP padrão do Supabase é o gargalo para testar o
onboarding de vários usuários.

**Premissa verificada e falsa:** o Neon Auth tem o mesmo gargalo. Pela
documentação da Neon, o remetente embutido (`auth@mail.myneon.app`)
permite **2 e-mails de autenticação por hora, no projeto inteiro**, até
que um SMTP próprio seja configurado (Neon Docs — *Customize emails* e
*Auth production checklist*). É o mesmo limite do SMTP padrão do
Supabase. Em qualquer dos dois provedores, a solução para enviar e-mail
em volume é a mesma: **SMTP próprio** (ex.: Resend).

---

## 2. Auditoria do acoplamento atual ao Supabase Auth (Fase 1)

### 2.1 Código (`src`, `scripts`)

| Ponto de acoplamento | Ocorrências | Arquivos |
|---|---|---|
| Chamadas ao Auth (`getUser`, `signIn*`, `signOut`, `updateUser`, `resetPasswordForEmail`, `exchangeCodeForSession`, `verifyOtp`, `setSession`, `auth.admin`) | 16 | 11 |
| Cliente do usuário (`@/lib/supabase/server|client`) | 28 | 28 |
| Cliente administrativo (`createAdminClient`, service_role) | 222 | 25 |
| Consultas a tabelas via PostgREST (`.from(...)`) | 305 | 28 |
| Funções SQL via PostgREST (`.rpc(...)`) | 218 | 24 |
| `auth_user_id` | 18 | 12 |
| `educa_password_pending` | 7 | 4 |
| Rotas de API (`route.ts`) | 421 | — |

Variáveis de ambiente do Auth em uso: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

### 2.2 Banco (produção, somente leitura)

| Item | Valor |
|---|---|
| Tabelas em `public` | 171, **todas com RLS** |
| Policies | 328; 322 via helpers (`has_permission`, `current_app_user_id`, `current_user_company_ids`, `has_platform_permission`…), 2 com `auth.uid()` direto |
| Funções que leem `auth.uid()` | 17: `current_app_user_id`, `current_platform_member_id`, `current_platform_role`, `current_user_company_ids`, `current_user_permissions`, `fn_accept_user_invitation`, `fn_dashboard_context`, `fn_log_platform_audit`, `fn_platform_invite_company_admin`, `fn_user_context`, `fn_user_effective_permissions`, `fn_user_has_branch_access`, `has_permission`, `has_platform_permission`, `is_platform_admin`, `is_platform_member`, `is_platform_owner` |
| Chaves estrangeiras para `auth.users` em `public` | `users.auth_user_id`, `platform_members.auth_user_id`, `user_invitations.accepted_auth_user_id` |
| Proteção do vínculo | gatilho `guard_users_auth_link` (0072) |
| Migrations que referenciam `auth.uid()` / `auth.users` | 7 / 6 arquivos |

---

## 3. Mapa de dependências (Fase 2)

### Autenticação (hoje)

| Fluxo | Implementação |
|---|---|
| Login | `signInWithPassword` no navegador → cookies do `@supabase/ssr` |
| Sessão | cookies renovados em `src/proxy.ts`; servidor lê com `getUser()` |
| Logout | `POST /api/auth/logout` → `signOut` no servidor |
| Convite | banco emite o convite (token em hash, 0071); o login novo é criado por `auth.admin.inviteUserByEmail` (service_role) |
| Primeiro acesso / criação de senha | `/redefinir-senha` (sessão do link) ou `/convite/<token>` → `updateUser({ password })` |
| Recuperação | `resetPasswordForEmail` (PKCE, `sb_flow_id`) → `/auth/callback` troca o código no servidor → `/redefinir-senha` |
| Link no Site URL | `/login` encaminha o fragmento para `/redefinir-senha` (commit `5d5a1cf`) |
| Proteção de rota | `src/proxy.ts` (sem sessão → `/login`) |

### Autorização (hoje)

```text
JWT do Supabase Auth ──(PostgREST valida)──► auth.uid()
      │
      ▼
current_app_user_id()  → public.users (auth_user_id = auth.uid(), ativo)
has_permission(company, code) → user_roles → roles → role_permissions (+ módulo habilitado)
current_user_company_ids()   → isolamento por empresa
has_platform_permission()    → platform_members (auth_user_id = auth.uid())
      │
      ▼
328 policies de RLS em 171 tabelas + funções SECURITY DEFINER
```

**A identidade entra no banco por um único ponto: `auth.uid()`**, que o
PostgREST preenche depois de validar o JWT emitido pelo Supabase Auth.
Todo o RBAC, a RLS e o isolamento entre empresas dependem disso.

---

## 4. Neon Auth — o que a documentação atual diz (Fase 3)

| Tema | Neon Auth ("Managed Better Auth") | Fonte |
|---|---|---|
| Base | Better Auth gerenciado (versão 1.4.x) | Neon Docs — *Managed Better Auth* |
| Onde ficam usuários e sessões | schema `neon_auth` **dentro de um banco Neon** | *Managed Better Auth* |
| Identidade na RLS | JWT com `sub` = `neon_auth.user.id`, validado por JWKS pela **Neon Data API**; RLS usa `auth.user_id()` | *Authentication flow*, *Row-Level Security with Neon* |
| E-mail padrão | remetente compartilhado, **2 e-mails/hora por projeto** | *Customize emails*, *Auth production checklist* |
| SMTP próprio | suportado (host, porta, usuário, senha, remetente) ou webhooks (`send.otp`, `send.magic_link`) | *Customize emails*, *Webhooks* |
| Recuperação de senha | por link de verificação no e-mail | *Password reset* |
| Cadastro público | ligado por padrão; a documentação diz que **restringir cadastro ainda está "em breve"** (a validar na data da implementação; alternativa: webhook `user.before_create`) | *Authentication flow* |
| Convite | nativo só no plugin **Organization** (organização do Better Auth), não para "cadastro existente do ERP" | *Organization plugin* |
| Migração de usuários/hashes do Supabase | não encontrada documentação | — |

Não foi possível abrir as páginas da Neon diretamente nesta sessão (o
domínio está bloqueado pela política de rede); as informações vêm do
índice de busca da documentação oficial e precisam ser reconfirmadas
antes de qualquer implementação.

---

## 5. Bloqueios — por que a implementação não foi iniciada

### 🔴 B1. O Neon Auth não resolve o problema que motivou a migração
O limite de e-mail padrão é o mesmo (2/hora). Sem SMTP próprio, o
onboarding de vários usuários continua travado; com SMTP próprio, o
Supabase Auth atual já resolve (§7).

### 🔴 B2. A identidade do Neon Auth não chega à RLS do banco do EDUCA
O Neon Auth guarda usuários num banco **Neon** e entrega a identidade à
RLS pela **Neon Data API**. Os dados do EDUCA (171 tabelas, 328
policies) estão no Postgres do **Supabase**, e a identidade entra pelo
`auth.uid()` do PostgREST do Supabase, que só confia em JWTs do Supabase
Auth ou de provedores terceiros específicos (Clerk, Firebase, Auth0,
Cognito, WorkOS — Supabase Docs, *Third-party auth*). As saídas
possíveis são todas destrutivas ou de alto risco:

| Saída | O que exigiria | Risco |
|---|---|---|
| Mover todo o banco para o Neon | migrar 171 tabelas, 328 policies, 17 funções de identidade, papéis `anon/authenticated/service_role`, trocar PostgREST por Neon Data API em 421 rotas; o histórico de migrations do repositório **não reconstrói o banco de produção** (auditoria de branches: 0005–0011 aplicadas só existem no branch antigo) | 🔴 perda de dados/segurança; é uma migração de banco, não de Auth |
| Manter o banco no Supabase e acessar tudo com service_role | RLS deixa de ser a autoridade; autorização passaria para o código em 421 rotas | 🔴 viola a regra "não remova RLS para fazer funcionar" |
| Manter o banco e injetar a identidade por conexão direta (`set_config('request.jwt.claims', …)`) | reescrever a camada de dados (523 chamadas `.from`/`.rpc`), trocar as FKs de `auth_user_id` (tabelas de produção), manter um mapeamento Neon↔Supabase | 🟠 muito alto; troca a base de segurança de todo o ERP |
| Registrar o Neon Auth como provedor terceiro do Supabase | depende de o Supabase aceitar um emissor OIDC genérico (a documentação lista 5 provedores) | ⚪ não confirmado; mesmo assim `auth_user_id` → `auth.users` quebraria |

### 🟠 B3. Invite-only não é garantido
O EDUCA exige cadastro público desligado. A documentação do Neon Auth
indica que restringir cadastro ainda não é nativo; seria preciso um
webhook de bloqueio — um controle de segurança novo, fora do banco.

### 🟠 B4. Ambiente de teste inexistente
Não há projeto Neon, credenciais nem acesso de rede à Neon nesta sessão.
Qualquer código escrito agora seria **não testado** — o critério da
tarefa ("não considerar pronto porque compila") impede entregá-lo.

---

## 6. Comparação

| Área | Supabase Auth atual | Neon Auth proposto |
|---|---|---|
| Login | e-mail/senha, cookies `@supabase/ssr` | e-mail/senha (Better Auth), SDK próprio |
| Logout | `signOut` no servidor | equivalente no SDK |
| Sessão | JWT do Supabase; `auth.uid()` na RLS | JWT do Neon Auth; `auth.user_id()` só via Neon Data API |
| Recuperação | PKCE + `/auth/callback` (com `sb_flow_id`) | link de verificação; fluxo a reescrever |
| Convite | convite do banco (hash, uso único) + login criado pelo Auth | plugin Organization; convite do ERP teria de ser reimplementado |
| Primeiro acesso | `/redefinir-senha` e `/convite` | a reescrever |
| E-mail | SMTP padrão limitado; SMTP próprio configurável | remetente padrão **2/hora**; SMTP próprio configurável |
| Owner | `platform_members.auth_user_id → auth.users`, já em produção | exigiria novo vínculo e recriação do login |
| Admin / RBAC | no banco, via `has_permission` | continuaria no banco **só se** a identidade chegar ao banco (B2) |
| RLS | 328 policies funcionando | não alcançável sem mover o banco ou reescrever a camada de dados |
| Multi-tenancy | `current_user_company_ids()` na RLS | mesmo problema da RLS |
| Vercel | 4 variáveis | variáveis do Neon + as do Supabase (dados) |
| Preview | preview da Vercel + Supabase único | branching do Neon (vantagem real, se o banco estivesse no Neon) |
| Segurança | auditada, testada (642 unit, 102+19 E2E) | a reconstruir e reauditar |
| Complexidade | atual | dois provedores (identidade no Neon, dados no Supabase) ou migração de banco |
| Migração | — | recriar logins (sem migração de hash documentada), revincular Owner, trocar FKs |

---

## 7. Recomendação

1. **Não migrar a autenticação agora.** O gargalo é de e-mail, não de
   provedor de identidade.
2. **Configurar SMTP próprio no Supabase Auth atual** (ex.: Resend) —
   configuração no painel, sem mudança de código:
   Authentication → Emails → SMTP Settings (host, porta, usuário, senha,
   remetente de domínio verificado com SPF/DKIM, nome "EDUCA ERP") e,
   depois, Authentication → Rate Limits para ajustar o limite de e-mails
   por hora.
3. Se o objetivo for ter **branching de banco para previews** (vantagem
   real do Neon), tratar como projeto separado de migração de **banco**,
   começando por reconciliar o histórico de migrations do repositório
   com produção (item C1 da auditoria de branches).

---

## 8. Plano A — Neon Auth + Postgres do Supabase (POC, 2026-09-25)

### 8.1 Decisão de arquitetura

```text
Neon Auth ── login, sessão, e-mail, JWT (EdDSA) publicado em JWKS
   │  token do provedor
   ▼
Servidor do EDUCA — src/lib/auth/neon-bridge.ts
   1. verifica o token: assinatura pelo JWKS, iss, aud, exp, algoritmo assimétrico
   2. exige e-mail confirmado no provedor
   3. traduz sub do provedor → auth_user_id pelo vínculo do banco (0073)
   4. emite token curto para o PostgREST: sub = auth_user_id, role = authenticated, ≤ 300 s
   ▼
PostgREST + Postgres do Supabase (inalterados)
   auth.uid() → current_app_user_id() → has_permission() → 328 policies de RLS
```

Respostas às perguntas da tarefa:

| Pergunta | Resposta |
|---|---|
| Fonte de identidade | Neon Auth (login, senha, sessão, e-mail) |
| Dados de negócio | Continuam no Postgres do Supabase |
| Relação Auth ↔ EDUCA | `auth_identity_links` (0073): `(provider, external_user_id) → auth_user_id`, um-para-um, criado só pelo servidor quando o e-mail do provedor, confirmado, é igual ao do login |
| RBAC | Intacto: `has_permission()` e papéis no banco; o Neon Auth não guarda papel de negócio |
| Multi-tenancy | Intacto: `current_user_company_ids()` e RLS |
| RLS | Nenhuma policy alterada: `auth.uid()` continua sendo o `sub` que o PostgREST valida |
| Por que `sub` não vai direto | O id do Better Auth/Neon Auth não é UUID (ex.: `5Iyne0AX…`) e `auth.uid()` é `uuid`; e `users.auth_user_id` referencia `auth.users` |

### 8.2 Mapa de dependências (código)

A superfície de integração é pequena:

| Ponto | Onde | Papel |
|---|---|---|
| Cliente de dados com a identidade do usuário | `src/lib/supabase/server.ts` → `createClient()` (28 arquivos) | trocar a sessão Supabase pelo token da ponte (`Authorization: Bearer`) |
| Leitura da identidade no servidor | `src/lib/api/governance.ts:20`, `src/lib/auth/context.ts:26`, `src/proxy.ts:50` (`auth.getUser()`) | passar a usar a identidade verificada pela ponte |
| Auth no navegador | `login/page.tsx`, `recuperar-senha`, `redefinir-senha`, `convite/[token]` (signIn, resetPassword, updateUser, getUser, signOut) | trocar pelo SDK do Neon Auth |
| Criação de login no convite | `auth.admin.inviteUserByEmail` (onboarding-handlers, bootstrap) | trocar por criação de conta no Neon Auth + vínculo |
| Consultas `.from/.rpc` (523) e cliente admin (222) | rotas de API | **não mudam** |

### 8.3 POC — o que foi executado

- **Identidade:** Better Auth **1.4.18** local (a mesma versão do "Managed
  Better Auth" da Neon), banco próprio separado, cadastro público
  desligado, plugin JWT (EdDSA/JWKS, `iss`/`aud`, 5 min).
- **Banco:** réplica local do banco de produção (Postgres 17 + PostgREST,
  mesmas 171 tabelas/328 policies), com a 0073 aplicada **só na réplica**.
- **Ponte:** o módulo real `src/lib/auth/neon-bridge.ts`, sem cópia.
- **Fixtures (só réplica):** POC Empresa A (A1 admin, A2 leitura), POC
  Empresa B (B1 admin, B2 operador), Owner da plataforma.

Resultado: **56/56** (`poc/neon-auth/run-poc.mjs`, duas execuções
seguidas sobre réplica recém-recriada).

| Área | Verificações |
|---|---|
| Primeiro acesso | contas criadas pelo servidor; cadastro público recusado; conta com e-mail não confirmado não obtém identidade no banco; link por e-mail → senha criada (5 contas); concluir o link confirma o e-mail |
| Vínculo | 5 vínculos; e-mail divergente recusado; identidade já vinculada não aponta para outro login; anon não lê nem cria |
| Identidade | `sub` do token do banco = `auth_user_id`; `current_app_user_id()` distingue A1, A2, B1, B2; `fn_user_context` correto |
| Plataforma | Owner tem permissão de plataforma, Company Admin não; Company Admin não cria empresa |
| Multi-tenancy | SELECT/INSERT/UPDATE/DELETE cruzados A↔B bloqueados pela RLS; `has_permission(B)` falso para A1; convite cruzado recusado; IDOR por id vazio |
| RBAC | leitura não cria; leitura e operador não se promovem a admin; insert direto em `user_roles` recusado; admin não troca `auth_user_id` (0072); admin gerencia papéis da própria empresa |
| Ponte | token forjado (outra chave, mesmo `kid`), payload adulterado, `alg=none`, lixo → recusados; token do banco forjado ou expirado → 401; sem token → nada; identidade sem vínculo → sem acesso |
| Desativação | cadastro inativo: sem `current_app_user_id`, só a própria linha (desenho do `users_select`), nenhum dado da empresa, nenhuma permissão |
| Recuperação | token inválido recusado; redirect só para origem confiável; `callbackURL` externo recusado (open redirect); link de uso único; senha antiga para de funcionar; sessões anteriores revogadas; mesma resposta para e-mail existente ou não |
| Login/logout | senha errada e usuário inexistente → mesma resposta; logout encerra a sessão no provedor |

Testes unitários da ponte (`tests/neon-bridge.test.ts`, 16, no `npm test`):
verificação (chave errada, `iss`/`aud`, expirado, adulterado, `none`,
HS256, sem `sub`/e-mail), emissão (claims, validade 30–600 s, UUID,
segredo curto), ponte (vínculo buscado só pelo `sub` verificado, e-mail não
confirmado, sem vínculo, token inválido nunca emite) e invariantes (ponte
fora do navegador, nenhum segredo `NEXT_PUBLIC_`, 0073 sem acesso de
anon/authenticated).

Regressão da branch: 658/658 testes, typecheck, lint e build limpos;
E2E da réplica 102/102 e 19/19 (baseline preservado).

### 8.4 Ressalvas — decisões antes de ligar no app

| # | Ponto | Por quê | Decisão/validação necessária |
|---|---|---|---|
| R1 | Assinatura aceita pelo PostgREST de **produção** | Na réplica o PostgREST confia no segredo HS256 do projeto. Em produção os tokens observados são **ES256** (chaves de assinatura novas do Supabase) | Validar no painel (Settings → JWT Keys) se o segredo legado ainda é aceito, ou cadastrar uma chave própria de assinatura; a ponte troca de algoritmo sem mudar o resto |
| R2 | Login "sombra" em `auth.users` para usuários novos | `users.auth_user_id` e `platform_members.auth_user_id` referenciam `auth.users`; manter a FK exige um registro sem senha por pessoa | Aceitar o registro sombra (criado pelo servidor, sem senha) ou planejar migração que desacople a FK |
| R3 | Dois caminhos de login | Enquanto o Supabase Auth aceitar e-mail/senha, o login antigo continua existindo | Desligar o provedor de e-mail do Supabase Auth na virada |
| R4 | Neon Auth gerenciado ≠ Better Auth local | No Neon não há `onPasswordReset` (só webhooks); restringir cadastro público é "em breve" na documentação | Validar num projeto Neon: confirmação de e-mail no primeiro acesso e bloqueio de cadastro (webhook `user.before_create`) |
| R5 | E-mail | O remetente padrão do Neon Auth também é 2/hora | SMTP próprio é necessário em qualquer provedor |
| R6 | Janela após logout | O token do banco já emitido vale até expirar | ≤ 300 s (hoje o access token do Supabase vale 3600 s); pode ser reduzida |
| R7 | Segredo de assinatura no servidor | Quem tiver o segredo emite identidade de qualquer usuário | Mesma classe de risco da `service_role` atual: só servidor, nunca `NEXT_PUBLIC_` (teste de invariante) |

### 8.5 Próxima etapa (não executada)

1. Resolver R1 e R4 num projeto Neon real e no painel do Supabase.
2. Ligar a ponte no app atrás de uma variável de ambiente:
   `createClient()`, `requireSession()`, `getSessionUser()`, `proxy.ts`;
   telas de login, recuperação, redefinição e convite no SDK do Neon.
3. Convite/primeiro acesso: servidor cria a conta no Neon Auth, cria o
   login sombra (R2), vincula (0073) e o aceite oficial (0071) segue igual.
4. Repetir E2E 102 + 19 com o Neon Auth real antes de qualquer merge.

---

## 9. Integração com o Neon Auth real — estado em 2026-09-25

**Bloqueio de acesso:** este ambiente não tem projeto Neon, conector do
Neon, credenciais nem rota de rede para `neon.com`, `console.neon.tech`,
`api.neon.tech` ou `*.neon.tech`. **O Neon real não foi testado.** Nenhum
código de integração foi ligado ao app para não construir sobre suposições
não validadas.

### 9.1 Auditoria — hoje × Neon Auth

| Área | Hoje (Supabase Auth) | Com Neon Auth | Precisa alterar? |
|---|---|---|---|
| Login | `signInWithPassword` no navegador (`login/page.tsx`) | SDK do Neon (`createNeonAuth`, handler em rota de API) | Sim |
| Logout | `POST /api/auth/logout` → `signOut` | sign-out do Neon + limpar estado local | Sim |
| Primeiro acesso | `/redefinir-senha` (fragmento de sessão, `updateUser`) | conta criada pelo servidor + link do Neon + senha pelo SDK | Sim |
| Convite | 0071 (token em hash) + `inviteUserByEmail` | 0071 igual + criação da conta no Neon + vínculo 0073 + login sombra | Sim (só a criação do login) |
| Recuperação | `resetPasswordForEmail` → `/auth/callback` (PKCE, `sb_flow_id`) → `/redefinir-senha` | fluxo de reset do Neon Auth | Sim |
| Sessão | cookies `@supabase/ssr`; `getUser()` no servidor | cookie do Neon (`NEON_AUTH_COOKIE_SECRET`); `getSession()` no servidor + token da ponte | Sim |
| Middleware | `src/proxy.ts` (`getUser`) | `middleware()` do SDK ou `getSession()` | Sim |
| API | `requireSession` / `getSessionUser` (`getUser`) | identidade vinda da ponte | Sim (2 funções) |
| RLS | `auth.uid()` do PostgREST | igual (token da ponte) | Não |
| RBAC | `has_permission()` | igual | Não |
| Admin Central | `has_platform_permission()` | igual | Não |

### 9.2 Dependências do Supabase Auth — classificação

| Ponto | Arquivo | Classe |
|---|---|---|
| `signInWithPassword` | `src/app/(auth)/login/page.tsx:48` | SUBSTITUIR |
| `resetPasswordForEmail` | `src/app/(auth)/recuperar-senha/RecoverPasswordForm.tsx:32` | SUBSTITUIR |
| `getUser`, `updateUser`, `signOut` (primeiro acesso/redefinição) | `src/app/(auth)/redefinir-senha/ResetPasswordForm.tsx:45,72,96` | SUBSTITUIR |
| `getUser`, `updateUser` (convite) | `src/app/(auth)/convite/[token]/InvitationFlow.tsx:69,214` | SUBSTITUIR |
| `setSession` do fragmento (`consumeAuthHash`) e encaminhamento em `/login` | `src/lib/onboarding/auth-hash.ts`, `login/page.tsx` | REMOVER com a virada (formato próprio do Supabase) |
| `exchangeCodeForSession`, `verifyOtp` | `src/app/auth/callback/route.ts:27,30` | REMOVER com a virada |
| `signOut` no servidor | `src/app/api/auth/logout/route.ts:10` | SUBSTITUIR |
| `getUser` no servidor | `src/lib/api/governance.ts:20`, `src/lib/auth/context.ts:26` | SUBSTITUIR (identidade da ponte) |
| `getUser` no proxy | `src/proxy.ts:50` | SUBSTITUIR |
| `createServerClient` (cliente de dados do usuário) | `src/lib/supabase/server.ts:17` | MANTER, trocando a origem do token (`Authorization: Bearer` da ponte) |
| `createBrowserClient` | `src/lib/supabase/client.ts:17` | REMOVER com a virada (usado só para Auth) |
| `inviteUserByEmail` | `src/lib/api/onboarding-handlers.ts:57` | SUBSTITUIR (conta no Neon + login sombra + vínculo) |
| `admin.listUsers` / `inviteUserByEmail` no bootstrap | `scripts/bootstrap-platform-owner.mjs:56,89` | SUBSTITUIR (bootstrap do Owner no Neon) |
| Cliente admin (`createAdminClient`, 222 usos) | rotas de API | MANTER (não é Auth) |
| `onAuthStateChange` | — | não existe no código |

Durante a migração, tudo o que é SUBSTITUIR fica atrás de `AUTH_PROVIDER`
(§9.5), com o caminho Supabase intacto como volta imediata.

### 9.3 Neon Auth real × o que a POC assumiu (pela documentação)

| Item | POC local | Neon Auth real (documentação) | Impacto na ponte |
|---|---|---|---|
| JWKS | `/api/auth/jwks` | `${NEON_AUTH_BASE_URL}/.well-known/jwks.json` | configuração |
| `iss` | URL da POC | origem da URL do Neon Auth (ex.: `https://ep-xx.aws.neon.tech`) | configuração |
| `aud` | `educa-erp` | **não documentado** | ⚪ validar; a ponte hoje exige `aud` |
| Algoritmo | EdDSA | EdDSA (Ed25519) | nenhum |
| Claims | `sub`, `email`, `emailVerified` | `sub`, `email`, `role`, `exp`, `iat`; **sem claims customizadas** | 🟠 a ponte hoje exige `emailVerified` no token → recusaria todo token real |
| Validade | 5 min | 15 min, renovação por `authClient.token()` | configuração |
| `sub` | id do Better Auth (não UUID) | `neon_auth.user.id` (formato a validar) | nenhum (o vínculo aceita texto) |
| Variáveis | — | `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥ 32 caracteres) | novas variáveis de servidor |
| Cadastro público | `disableSignUp` | restringir cadastro "em breve"; alternativa: webhook `user.before_create` | 🟠 invite-only a garantir |
| E-mail | caixa local | remetente padrão **2/hora por projeto**; SMTP próprio configurável; webhooks para e-mail próprio | SMTP próprio obrigatório |
| Gancho após redefinição | `onPasswordReset` | só webhooks | confirmação de e-mail no primeiro acesso a validar |

### 9.4 Adaptações obrigatórias da ponte (depois de validar no Neon real)

1. **E-mail confirmado:** como o token do Neon não traz `emailVerified`, a
   ponte deve obtê-lo da sessão consultada no servidor (`getSession()` do
   SDK, que autentica o cookie junto ao Neon) e conferir que o `sub` do
   token é o `user.id` da sessão.
2. **`aud`:** se o Neon não emitir `aud`, a verificação passa a exigir
   `iss` exato (a origem própria do projeto) e o `role` do token; a regra
   precisa de teste com token real antes de ser afrouxada.
3. **Endereços e validade:** JWKS e `iss` por variável de ambiente;
   renovação a cada 15 min.

Nenhuma dessas mudanças foi feita: sem um token real para testar, alterar
a verificação seria enfraquecê-la às cegas.

### 9.5 Chave `AUTH_PROVIDER` (desenho, não implementado)

- `AUTH_PROVIDER=supabase` (padrão): comportamento atual, sem mudança.
- `AUTH_PROVIDER=neon`: telas de login/recuperação/convite pelo SDK do
  Neon; `requireSession`/`getSessionUser`/`proxy.ts` pela identidade da
  ponte; `createClient()` com o token da ponte.
- Volta imediata: trocar a variável e fazer redeploy; o banco não muda
  (0073 é aditiva e só é lida no modo `neon`).

### 9.6 O que falta para testar o Neon real

1. Criar um **projeto Neon de teste** (separado de tudo) com **Auth
   habilitado** e, na configuração de Auth, cadastrar o domínio de
   desenvolvimento como origem confiável.
2. Dar acesso a este ambiente, por **um** destes caminhos:
   - instalar o conector do **Neon** no claude.ai e habilitá-lo nesta conversa; ou
   - no ambiente cloud da sessão (barra de título → ambiente → Edit):
     liberar em Network access o domínio do projeto (`*.neon.tech`) e
     `neon.com`, e cadastrar `NEON_AUTH_BASE_URL` e
     `NEON_AUTH_COOKIE_SECRET` como variáveis de ambiente.
3. Uma caixa de e-mail de teste que você controle (ou SMTP próprio de
   teste no projeto Neon), para os links de primeiro acesso e recuperação.
4. Decidir as ressalvas R1 (assinatura aceita pelo PostgREST de produção)
   e R2 (login sombra) da §8.4.
