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

---

## 10. Neon Auth REAL — validação empírica (2026-09-25)

> Substitui as suposições das §9.3–9.4: tudo abaixo foi **observado** no
> serviço gerenciado, não lido na documentação.

### 10.1 Ambiente

| Item | Valor |
|---|---|
| Projeto Neon | `educa-neon-auth-test` (`delicate-band-84024217`), criado só para isto, aws-us-east-1, PG 17, 0,25 CU |
| Branch | `main` (`br-ancient-rice-b7nrvkic`) |
| Neon Auth | `better_auth` (Managed Better Auth) |
| Base URL | `https://ep-green-star-b7aphqm9.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth` |
| JWKS | `<base>/.well-known/jwks.json` — 1 chave `OKP/Ed25519`, `alg EdDSA`, `kid 7df458d1-…` |
| Usuários | só de teste, domínio reservado `@educa-teste.example.com` (RFC 2606, não entrega e-mail a ninguém) |
| Banco do EDUCA | **réplica local** (Postgres 17 + PostgREST), policies/RLS de produção intactas |
| Produção | não tocada (nem Supabase, nem Vercel, nem `main`) |

Como o container não alcança `*.neon.tech` (política de rede, 403), os
fluxos HTTP rodaram numa **Neon Function** do próprio projeto de teste
(`poc/neon-auth-real/probe/index.mjs`), acionada por gatilho agendado e
lida pelos logs via conector. Senhas geradas dentro da função; tokens e
cookies redigidos nos logs, exceto os JWTs de teste explicitamente
exportados para a ponte (validade 15 min, já expirados).

### 10.2 Token real (sem expor o token)

| Campo | Observado |
|---|---|
| `alg` / `kid` | `EdDSA` / `7df458d1-4e74-4c7f-a18a-8b77781ea804` (presente no JWKS) |
| `iss` | `https://ep-green-star-b7aphqm9.neonauth.c-13.us-east-1.aws.neon.tech` (origem da base URL) |
| `aud` | **existe** e é igual ao `iss` |
| `sub` | UUID = `neon_auth.user.id` (ex.: `8dfaa82e-…`) — ≠ `auth_user_id` do EDUCA |
| `email` | presente |
| `emailVerified` | **presente** (boolean) — a documentação não citava |
| `role` | `"authenticated"` |
| outros | `name`, `id`, `banned`, `banReason`, `banExpires`, `createdAt`, `updatedAt` |
| `exp - iat` | **900 s** |
| Assinatura | válida no JWKS real (Node `crypto` na função e `jose` na ponte) |
| Entrega | `GET /token` (JSON) e cabeçalho `set-auth-jwt` em `GET /get-session` |

### 10.3 Fluxos do Neon Auth (evidência)

| Teste | Resultado real |
|---|---|
| Cadastro público (padrão do projeto) | **aberto**: `POST /sign-up/email` → 200 e já loga, e-mail não confirmado |
| Cadastro com `disableSignUp` | 400 `EMAIL_PASSWORD_SIGN_UP_DISABLED` ✅ |
| Criação pelo servidor (admin/MCP) com cadastro fechado | ✅ `admin/create-user`; repetido → `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` |
| Conta criada pelo servidor | nasce **sem senha** (credential sem hash) → só entra pelo link de primeiro acesso |
| Login: senha errada / usuário inexistente / conta sem senha | 401 idêntico `INVALID_EMAIL_OR_PASSWORD` (sem enumeração) ✅ |
| Rate limit de login | 429 `X-Retry-After: 10` após rajada do mesmo IP |
| Origin não confiável | 403 `INVALID_ORIGIN` ✅ |
| Sessão | cookie `__Secure-neon-auth.session_token` (HttpOnly, Secure, SameSite=None, Partitioned), 7 dias; cache `session_data` |
| Logout | apaga cookies; `get-session` → `null` ✅ |
| `revoke-other-sessions` / `change-password {revokeOtherSessions}` | outras sessões invalidadas ✅ |
| Banimento (admin) | sessões encerradas; login → 403 `BANNED_USER` ✅ |
| Escalada pelo navegador | `admin/set-role`, `admin/update-user` → 403; `update-user {email,emailVerified,role}` → e-mail recusado, demais ignorados (conferido no banco) ✅ |
| Recuperação: resposta | igual para e-mail existente e inexistente ✅ |
| `redirectTo` externo | 403 `Invalid redirectURL` ✅ |
| Link: abrir com callback local | 302 para `/redefinir-senha?token=…` ✅ |
| Link: callback externo | 403 `INVALID_CALLBACK_URL` ✅ |
| Link: uso único | 2º uso → `INVALID_TOKEN` ✅ |
| Link: validade | 3600 s; expirado → `INVALID_TOKEN` ✅ |
| Link: rate limit | 429 `X-Retry-After: 60` para pedidos repetidos |
| **Redefinição confirma e-mail?** | **Não** — `emailVerified` continua `false` |
| **Redefinição revoga sessões antigas?** | **Não** — sessão anterior segue válida (senha antiga deixa de entrar) |
| OTP de recuperação | guardado com **hash** (não legível), validade 300 s, OTP errado → `INVALID_OTP` |
| Webhook para URL na infraestrutura Neon | recusado; com a config inválida o serviço **falha fechado** (400 em todas as rotas) |

**E-mail — o que foi e o que não foi provado.** O remetente padrão
(`auth@mail.myneon.app`) aceitou os pedidos e criou os tokens, mas a
entrega não foi observável (domínio de teste sem caixa). SMTP próprio
(`email_provider` configurável) e webhooks `send.otp`/`send.magic_link`
existem, mas **não foram exercitados**: SMTP exige credenciais de um
remetente real e o webhook exige um endpoint HTTPS público fora da Neon
(ex.: rota do EDUCA na Vercel). Limitação do **remetente padrão** ≠
limitação do Neon Auth: com SMTP/webhook próprio o limite passa a ser o
do provedor escolhido. Nenhum e-mail foi enviado a pessoas reais.

### 10.4 Neon real → ponte → Postgres do Supabase (réplica)

`poc/neon-auth-real/run-real.mjs` — tokens **emitidos pelo Neon real**,
verificados pelo JWKS real, pela `src/lib/auth/neon-bridge.ts`
**sem nenhuma alteração de código** (só configuração: `issuer` = `audience`
= origem do Neon Auth):

**53/53** — identidade (4 contas), vínculo 0073, `auth.uid()` →
`current_app_user_id()` → `has_permission()` → RLS; multi-tenant A/B
(SELECT/INSERT/UPDATE/DELETE cruzados, IDOR, convite cruzado, estado do
banco conferido); RBAC (leitura sem escrita, sem autopromoção, sem
`user_roles` direto, gatilho 0072); segurança (payload adulterado, outra
chave com o mesmo `kid`, `kid` inexistente, `alg=none`, HS256, `iss`/`aud`
errados, `emailVerified=false`, token do banco forjado/expirado, token do
Neon direto no PostgREST → 401); desativação no EDUCA.

Os mesmos tokens reais, depois de `exp`: `INVALID_TOKEN`
(`run-real.mjs --so-expiracao`).

### 10.5 POC local × Neon real

| Item | POC local | Neon real | Compatível? | Adaptação |
|---|---|---|---|---|
| JWT | EdDSA, 5 min | EdDSA, 15 min | Sim | nenhuma |
| JWKS | `/api/auth/jwks` | `/.well-known/jwks.json` | Sim | URL por variável |
| issuer | `http://localhost:3400` | origem do Neon Auth | Sim | variável |
| audience | `educa-erp` | = issuer | Sim | variável |
| sub | id não-UUID | UUID do Neon | Sim | nenhuma (vínculo é texto) |
| email | claim | claim | Sim | — |
| email verification | claim via `definePayload` | claim nativa | Sim | **redefinição não confirma** → servidor confirma no primeiro acesso (`admin/update-user`) |
| exp | 300 s | 900 s | Sim | token do banco segue ≤ 300 s |
| refresh | `/token` | `/token` e `set-auth-jwt` | Sim | renovar a cada ≤ 15 min |
| sessão | cookie Better Auth | `__Secure-neon-auth.*`, 7 dias | Sim | servidor confere sessão (ver R6) |
| logout | revoga sessão | revoga sessão; JWT vale até `exp` | Parcial | ponte checa a sessão, não só o JWT |
| password reset | `onPasswordReset` confirma e revoga | **não confirma, não revoga** | Parcial | servidor: confirmar + `revoke-user-sessions` |
| convite | `createUser` | `admin/create-user` sem senha + link | Sim | usuário de serviço admin no servidor |
| cadastro público | desligado | **aberto por padrão**; `disableSignUp` funciona | Sim | desligar; remover Google compartilhado |
| webhook | — | existe; exige HTTPS público fora da Neon; falha fechado | Sim | endpoint no EDUCA |
| SMTP | caixa local | remetente compartilhado; SMTP próprio configurável | A validar | configurar SMTP antes de produção |
| Next.js SDK | — | não exercitado (sem rede para o app) | A validar | `@neondatabase/auth` na integração |
| cookies | `better-auth.*` | `__Secure-neon-auth.*`, SameSite=None, Partitioned | Sim | domínio confiável na config |

### 10.6 Riscos atualizados

| # | Estado |
|---|---|
| R1 assinatura aceita pelo PostgREST de produção | **aberto** — não testável sem tocar produção |
| R2 login sombra | mantido (fixtures da réplica) |
| R4 Neon ≠ Better Auth local | **resolvido** — diferenças medidas em §10.3/10.5 |
| R5 e-mail | parcialmente: limite é do remetente compartilhado; SMTP/webhook próprio pendente |
| R6 janela após logout | **ampliado para até 15 min** se a ponte confiar só no JWT → integração deve validar a sessão (`getSession`) a cada troca de token |
| Novo: Google OAuth compartilhado ligado por padrão | desligar (cadastro por OAuth não passa por `disableSignUp`) — não exercitado |
| Novo: `allow_localhost: true` por padrão | desligar em produção |

### 10.7 Veredito

🟢 **PLANO A VALIDADO** (arquitetura): Neon Auth real + Postgres do
Supabase + RLS/RBAC/multi-tenancy atuais funcionam juntos, sem alterar
policies, sem desligar RLS e sem `service_role` para autorizar usuário.
Não há incompatibilidade estrutural. A integração no app precisa das
adaptações das §10.5/10.6 (confirmação de e-mail e revogação de sessões
no primeiro acesso/redefinição, checagem de sessão na ponte, cadastro e
OAuth desligados, SMTP/webhook próprio) e da decisão R1 antes de
produção.

---

## 11. Plano A — Etapa 2: integração do Neon Auth ao app (2026-09-25)

> Substitui a §9.5 (desenho): a chave `AUTH_PROVIDER` está **implementada**.
> Produção, `main`, Supabase de produção e Vercel **não foram tocados**.

### 11.1 Arquitetura final

```
navegador ──(só rotas do app; cookie HttpOnly educa_session)──▶ Next.js (servidor)
                                                                 │
     ┌───────────────────────────────────────────────────────────┤
     ▼                                                           ▼
 Neon Auth (Managed Better Auth)                         Supabase PostgreSQL
  /sign-in, /get-session, /sign-out,                      PostgREST + RLS (328 policies)
  /request-password-reset, /reset-password,               auth.uid() = auth_user_id do EDUCA
  /admin/* (conta de serviço)                             current_app_user_id() / has_permission()
     │  JWT EdDSA 15 min (JWKS)                                   ▲
     ▼                                                           │ Authorization: Bearer <token curto HS256, 300 s>
 ponte (src/lib/auth/neon-bridge.ts) ── vínculo 0073 (service_role, só leitura do vínculo) ──┘
```

**Padrão BFF.** O navegador nunca fala com o Neon Auth nem guarda cookie
dele. O servidor guarda o par de cookies da sessão do Neon dentro de um
cookie próprio (`educa_session`: HttpOnly, `Secure` em produção,
SameSite=Lax, 7 dias). A cada requisição que precisa de identidade:

1. `GET /get-session` no Neon com o cookie (sessão revogada/expirada/banida → sem sessão);
2. JWT do cabeçalho `set-auth-jwt` verificado no **JWKS remoto** (só `EdDSA`;
   `iss` = `aud` = origem do Neon Auth; `exp`/`iat`; `emailVerified` obrigatório;
   `banned` recusa);
3. `sub` do JWT **tem que ser** o `user.id` da sessão consultada;
4. vínculo `neon → auth_user_id` lido na tabela 0073 (`fn_resolve_identity_link`, `service_role`);
5. token curto do banco (HS256, `sub` = `auth_user_id` do EDUCA, `role`/`aud`
   `authenticated`, 300 s) assinado com `SUPABASE_JWT_SECRET`;
6. cliente PostgREST do usuário com esse token → RLS/RBAC **inalterados**.

O resultado fica em cache **só em memória, só se "ok", por 10 s**
(`resolveNeonSessionCached`); logout apaga o cache. Falha do Neon → falha
fechada (sem sessão).

### 11.2 `AUTH_PROVIDER`

| Valor | Efeito |
|---|---|
| ausente / `supabase` (padrão) | comportamento anterior, byte a byte nos ramos Supabase |
| `neon` | fluxos abaixo pelo Neon Auth |
| qualquer outro | erro na inicialização (`AUTH_PROVIDER inválido`) |

Um único ponto de decisão: `src/lib/auth/provider.ts` (lido via
`NEXT_PUBLIC_AUTH_PROVIDER`, embutido no build por `next.config.ts` a partir
de `AUTH_PROVIDER`). Quem decide: `session.ts` (identidade/logout),
`supabase/server.ts` (origem do token), `proxy.ts`, `auth/client.ts`
(telas), `provisioning.ts` (convite/bootstrap), rotas `/api/auth/*`
(404 fora do modo neon) e `/auth/callback` (inerte no modo neon).
Consumidores (`governance.ts`, `context.ts`, 222 usos de rotas) não sabem
qual provedor está ativo.

### 11.3 Fluxos

| Fluxo | Modo neon |
|---|---|
| Login | `POST /api/auth/sign-in` → Neon `/sign-in/email` → ponte inteira; sem vínculo ou e-mail não confirmado → 403 `ACCESS_NOT_READY` e a sessão do Neon é encerrada; senha errada/inexistente/banido → 401 genérico; 429 repassado |
| Logout | `POST /api/auth/logout` → Neon `/sign-out`, cookie apagado, cache esquecido; cookie antigo reaproveitado → 401 |
| Recuperação | `POST /api/auth/password/recover` sempre 200; link do Neon (1 h, uso único) → `/redefinir-senha` |
| Redefinição | `POST /api/auth/password/reset`: troca a senha, entra com a senha nova (prova o e-mail), confirma o e-mail (conta de serviço), **revoga todas as outras sessões**, encerra e volta ao login |
| Primeiro acesso | igual à redefinição, mas continua logado e segue para o convite |
| Sessão | `GET /api/auth/session` devolve só `{authenticated, email}`; o proxy renova/apaga o cookie local conforme o Neon |
| Expiração | sessão expirada/revogada no Neon → 401 nas APIs e proxy → `/login?next=` |
| Usuário desativado | EDUCA `status ≠ active` → contexto `inactive`, RLS sem dados; banido no Neon → sessão cai e login recusado |

O token do link sai da barra de endereço assim que a tela abre
(`openPasswordLink`) e só vive na memória da página.

### 11.4 Convite, vínculo e login sombra (Fase 6)

`src/lib/auth/provisioning.ts` (`inviteWithNeon`) — só servidor, na ordem:

1. **login sombra** no Supabase Auth (`admin.createUser`, e-mail confirmado,
   `app_metadata.provider = "neon"`): dá o UUID `auth_user_id` que o RLS usa.
   O GoTrue guarda um hash aleatório; a senha do Neon **não** autentica nele
   (provado no E2E);
2. identidade no Neon (`/admin/create-user`, **sem senha**, papel `user`),
   reaproveitada se já existir (corrida `USER_EXISTS` tratada);
3. vínculo 0073 (`fn_link_identity`, `service_role`): `neon_user_id → auth_user_id`;
4. e-mail de primeiro acesso = link de redefinição do Neon para
   `/redefinir-senha?primeiro-acesso=1&next=/convite/<token>`.

O UUID do RLS é sempre o do EDUCA. O navegador não escolhe nem altera o
vínculo: `auth_identity_links` e as duas funções têm `revoke all` de
`public/anon/authenticated` (RLS ligado, sem policy); `users.auth_user_id`
é protegido pela 0072; não há coluna `neon_user_id` — o id do Neon só existe
em `auth_identity_links.external_user_id`; corpo de API com `auth_user_id`
é recusado (E2E). Criar vínculo exige e-mail igual ao do login sombra e já
confirmado, um vínculo por identidade e um por `auth_user_id`.
O bootstrap do Owner (`scripts/bootstrap-platform-owner.mjs`, com
`AUTH_PROVIDER=neon`, rodando com `node --import tsx`) usa o mesmo caminho.

### 11.5 Invite-only (Fase 7)

Três camadas, todas testadas:

1. **No provedor:** `disableSignUp` no Neon Auth (projeto de teste:
   `neon_auth.project_config`) → `POST /sign-up/email` = 400
   `EMAIL_PASSWORD_SIGN_UP_DISABLED` (Neon real e dublê);
2. **No app:** não existe rota de cadastro (E2E);
3. **Na ponte:** uma identidade que exista no Neon sem vínculo no EDUCA é
   recusada no login (403, sem cookie) e em qualquer token — mesmo que
   o cadastro fosse reaberto ou viesse por OAuth.

Pendente para produção: desligar o **Google OAuth compartilhado** (ligado
por padrão; a camada 3 já barra quem entrar por ele).

### 11.6 RLS, RBAC e multi-tenancy (Fase 8)

Nenhuma policy foi alterada, removida ou criada; RLS não foi desligado;
`service_role` só lê/grava o vínculo 0073 e cria o login sombra (o que o
Supabase Auth já fazia) — consultas de usuário seguem pelo token do usuário.

| Prova | Resultado |
|---|---|
| E2E modo neon (app inteiro, dublê local) | **55/55** — isolamento A/B, IDOR, escalada, Owner × Company Admin, leitura sem escrita, operador sem autopromoção, desativação, banimento |
| Tokens **reais** do Neon, obtidos pelo `neon/client.ts` do app, pela ponte atual → PostgREST/RLS da réplica | **52/52** (`run-real.mjs`; o 53º item exige token com e-mail não confirmado, coberto nos testes unitários) |
| Mesmos tokens reais pela ponte endurecida (`verify-app-tokens.mts`) | **4/4** |

### 11.7 R1 — PostgREST de produção aceita o token da ponte?

**Não validado.** Evidência só leitura: a chave anon legada de produção é
um JWT HS256 com `disabled: false` (Supabase MCP `get_publishable_keys`),
logo o PostgREST de produção hoje aceita tokens do segredo legado. A
aceitação de um token emitido pela ponte **não foi testada**: exige o
`SUPABASE_JWT_SECRET` de produção (não pedido, não exposto) e rede até
`supabase.co` (bloqueada neste ambiente).

Para fechar, quem tem o segredo roda numa máquina confiável:

```
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> \
SUPABASE_JWT_SECRET=<segredo> node --import tsx scripts/verify-bridge-token.mjs
```

Só `GET rpc/current_app_user_id` (função `stable`): token da ponte → 200
`null`; outro segredo → 401; expirado → 401. Nada é gravado nem impresso.
Validado 3/3 contra a réplica local.

Atenção: as sessões do Supabase Auth em produção já são **ES256** (chaves
de assinatura novas, §8.4 R1); o HS256 da ponte depende de o segredo legado
continuar aceito. Se ele for revogado, a ponte precisará assinar com uma
chave importada no Supabase — mudança de configuração, não de policy.

### 11.8 Variáveis (modo neon)

| Variável | Onde | Uso |
|---|---|---|
| `AUTH_PROVIDER` | build | `supabase` (padrão) ou `neon` |
| `NEON_AUTH_BASE_URL` | servidor | `https://<ep>.neonauth.<região>.aws.neon.tech/neondb/auth` (https obrigatório fora de localhost) |
| `NEON_AUTH_SERVICE_EMAIL` / `NEON_AUTH_SERVICE_PASSWORD` | servidor | conta de serviço (papel `admin` no Neon Auth): criar usuário, confirmar e-mail, revogar |
| `SUPABASE_JWT_SECRET` | servidor | assina o token curto do banco |
| `APP_URL` | servidor | origem dos links de e-mail |
| existentes | — | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

Nenhum segredo está no código. No Neon Auth: domínio do app como origem
confiável, `disableSignUp`, Google compartilhado desligado,
`allow_localhost` desligado, SMTP próprio.

### 11.9 Rollback

`AUTH_PROVIDER=supabase` (ou remover a variável) e **redeploy** (a variável
entra no build). Nenhum código muda; o banco não muda (0073 é aditiva e só
é lida no modo neon). Prova: com o build padrão, E2E **102/102** e
**19/19** (os mesmos da `main`). Efeitos: sessões `educa_session` deixam de
valer (todos entram de novo pelo Supabase Auth); contas criadas no modo neon
têm login sombra no Supabase Auth com senha aleatória → usam "esqueci a
senha" uma vez.

### 11.10 Segurança

- Identidade só vem de sessão viva no Neon + JWT verificado; nada do navegador escolhe o usuário.
- Só `EdDSA`; HS256/`alg=none`/outra chave/`kid` desconhecido/`iss`/`aud` errados recusados.
- `sub` do JWT = usuário da sessão (`SUBJECT_MISMATCH`).
- Token do banco ≤ 300 s; o JWT do Neon nunca chega ao PostgREST (401 se tentar).
- Janela após logout: 0 (a sessão é consultada no Neon; cache ≤ 10 s por instância).
- Mensagens de login genéricas; recuperação responde igual para e-mail inexistente.
- `next` sempre caminho interno; `redirectTo`/callback externo recusado pelo Neon.
- Redefinição revoga as demais sessões (o Neon sozinho não revoga).

### 11.11 Limitações conhecidas

- **R1** aberto (§11.7).
- **Rede deste ambiente** não alcança `*.neon.tech` nem `supabase.co`: o **app
  em execução não foi ligado ao Neon real**. O E2E do app usou o dublê local
  (mesmo motor, contrato medido); o código do app (`neon/client.ts`,
  `flows.ts`, `links.ts`) foi exercitado no Neon real dentro de uma Neon
  Function: conta de serviço, convite sem senha, busca por e-mail
  (sem diferenciar maiúsculas), primeiro acesso com confirmação de e-mail,
  link de uso único, recuperação revogando as 2 sessões antigas, senha antiga
  recusada, tokens reais.
- **Limite de taxa por IP:** o servidor repassa `x-forwarded-for`, mas o
  efeito no Neon real foi **inconclusivo** (5 falhas rápidas não deram 429;
  3 logins certos em ~10 s deram). Risco: todos os usuários parecerem vir
  do IP do servidor.
- **R3:** o login sombra torna a recuperação do Supabase Auth um segundo
  caminho até a virada — desligar o provedor de e-mail do Supabase Auth no
  cutover.
- **E-mail:** SMTP próprio e webhooks não exercitados; remetente padrão
  limitado.
- Proxy sem `NEON_AUTH_BASE_URL` não redireciona (como o ramo Supabase sem
  URL); as APIs continuam recusando sem sessão.
- Cache de identidade de 10 s por instância: desativação no EDUCA leva até
  10 s para valer em requisições já em cache.
- SDK `@neondatabase/auth` não usado: a integração fala HTTP com o contrato
  medido (menos dependência, mas acompanha mudanças do serviço à mão).

### 11.12 POC × implementação real

| Item | POC (Etapa 1) | Etapa 2 |
|---|---|---|
| Provedor | Better Auth local | Neon Auth real (projeto de teste) + dublê para E2E |
| App | intocado | chave `AUTH_PROVIDER`, BFF, rotas `/api/auth/*`, telas neutras |
| Ponte | `verify` do JWT | + sessão viva, `sub` = sessão, `banned`, só EdDSA, cache 10 s |
| Convite | fixtures | `inviteWithNeon` + bootstrap do Owner |
| Redefinição | ganchos do Better Auth | compensações no servidor (confirmar e-mail, revogar sessões) |
| Testes | 53 (ponte) | 690 unitários, E2E 102 + 19 (supabase) e 55 (neon), 52 + 4 com tokens reais |

### 11.13 O que NÃO foi feito em produção

- Nenhuma migration aplicada (a 0073 **não** está em produção nem na `main`).
- Nenhuma variável, deploy, configuração de Auth, chave ou policy alterada
  no Supabase ou na Vercel; nenhum merge.
- Leitura única em produção: `get_publishable_keys` (metadados das chaves públicas).
- Nenhum e-mail enviado a pessoas reais; o Owner real não foi usado.

### 11.14 Antes de ligar em produção

1. Fechar R1 (`scripts/verify-bridge-token.mjs`).
2. Aplicar a 0073 em produção (decisão à parte).
3. Projeto Neon de produção: origem confiável, `disableSignUp`, Google e
   `allow_localhost` desligados, SMTP próprio, conta de serviço.
4. Rodar o E2E neon contra o Neon real num ambiente com rede (liberar
   `*.neon.tech`).
5. Decidir o limite de taxa por IP e desligar o e-mail do Supabase Auth (R3).
