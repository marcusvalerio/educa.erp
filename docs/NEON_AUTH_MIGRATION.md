# Migração Supabase Auth → Neon Auth — auditoria e decisão de arquitetura

Branch: `feat/neon-auth-migration` (a partir de `main` em `d7d448f`).
Estado: **investigação concluída; implementação NÃO iniciada — parada
deliberada** pelos bloqueios da §5, conforme a regra da tarefa: "se
existir limitação que impeça preservar o comportamento atual, pare e
registre antes de criar um workaround perigoso".

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
