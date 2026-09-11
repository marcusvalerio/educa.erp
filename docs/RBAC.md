# RBAC e RLS — Fase 2b

Este documento descreve a camada de segurança/autorização introduzida
nesta fase: RLS real (não mais "habilitada mas vazia") e RBAC
(usuários, papéis, permissões). Ver também **docs/SUPABASE.md §7** (RLS)
e **docs/TESTING.md** (roteiro de verificação).

## 1. Modelo

```
auth.users (Supabase Auth)
    -> public.users (auth_user_id)             cadastro/perfil do ERP
        -> public.user_companies                empresas do usuário
        -> public.user_roles (por empresa)       papéis do usuário na empresa
             -> public.roles (por empresa)
                  -> public.role_permissions
                       -> public.permissions      catálogo global
```

- **`permissions`** é global (não por empresa): cada linha é um código
  `modulo.acao` (ex.: `products.delete`). Um módulo novo (estoque,
  comercial, compras...) só precisa inserir novas linhas aqui — nenhuma
  tabela central muda.
- **`roles`** é por empresa. Toda empresa nova ganha automaticamente 3
  papéis padrão via trigger (`fn_seed_company_rbac`, migration 0005):
  `admin` (todas as permissões), `operator` (leitura/criação/edição,
  sem exclusão, sem `rbac.manage`) e `viewer` (somente leitura). Esses
  3 papéis são `is_system = true` — RLS impede que sejam renomeados,
  excluídos ou tenham seu conjunto de permissões alterado (nem pelo
  próprio admin). Empresas podem criar papéis customizados livremente.
- **`user_companies`** e **`user_roles`** já suportam um usuário
  pertencer a mais de uma empresa e ter papéis diferentes em cada uma —
  útil mesmo o ERP hoje operando mono-empresa.
- Preparado para filial: a resolução de escopo hoje para em "empresa"
  (`current_company_id`/`user_in_company`). Quando existir uma tabela
  de filiais, o mesmo padrão (`user_branches` + `branch_id` nas
  policies) pode ser acrescentado sem redesenhar isto.

## 2. RLS real (migration 0006)

Três funções `SECURITY DEFINER` centralizam toda a lógica de
autorização — nenhuma policy reimplementa os JOINs:

- `current_app_user_id()` — id em `public.users` do usuário autenticado.
- `user_in_company(company_id)` — o usuário pertence a essa empresa?
- `has_permission(company_id, 'modulo.acao')` — o usuário tem, naquela
  empresa, um papel ativo com essa permissão? **Esta é a única função
  que as policies de dados de negócio consultam.**

Todas as tabelas de negócio (companies, suppliers, carriers, drivers,
vehicles, warehouse_locations, products, customers, users, audit_logs,
e as novas do catálogo) têm policies reais para `authenticated` —
SELECT/INSERT/UPDATE/DELETE gated por `has_permission`, nunca
`using (true)`. `anon` continua sem nenhuma policy (nega tudo — não há
acesso anônimo). `service_role` ignora RLS por definição (usado pelas
rotas `/api/*`), mas deixou de ser a única barreira: mesmo alguém
acessando o Supabase diretamente com uma sessão de usuário comum (anon
key + JWT), contornando a API do Next.js, esbarra nas mesmas policies.

## 3. Camada de aplicação (defesa em profundidade)

`src/lib/auth/context.ts` resolve o usuário autenticado real a partir
dos cookies de sessão (`getAuthContext()`) e expõe `hasPermission()`,
que chama a função `has_permission` do banco via RPC — a mesma lógica
do RLS, nunca duplicada em TypeScript.

`src/lib/api/handlers.ts` (`requireAccess`) exige, em toda rota de
cadastro, um usuário autenticado + a permissão `modulo.acao`
correspondente **antes** de tocar o repositório — 401 sem sessão, 403
sem permissão. `company_id` nunca mais é uma constante fixa nem vem do
cliente: vem de `public.users.company_id`, resolvido a partir da sessão
(`src/lib/database/table.ts` agora recebe `companyId` explícito em
`list/get/create/update/remove`). A auditoria (`audit_logs`) passa a
gravar `user_id` real quando o usuário está autenticado.

## 4. Bootstrap do primeiro administrador

Sem um "super admin" hardcoded: `public.bootstrap_admin_user()` (SQL,
`SECURITY DEFINER`, execução restrita a `service_role`) vincula um
usuário já criado em `auth.users` ao cadastro em `public.users` e
concede o papel `admin` — mas **só funciona enquanto a empresa ainda
não tiver nenhum admin**. Depois disso, conceder o papel admin a mais
alguém passa pela API normal de RBAC (que já exige `rbac.manage`, ou
seja, já exige ser admin).

```sql
-- SQL Editor do Supabase, depois de criar o usuário em Authentication > Users
select public.bootstrap_admin_user(
  p_auth_user_id => '<uuid de auth.users.id>',
  p_company_id   => '00000000-0000-0000-0000-000000000001',
  p_name         => 'Nome do administrador',
  p_email        => 'admin@empresa.com'
);
```

## 5. API de administração de RBAC

- `GET /api/permissions` — catálogo completo (qualquer usuário autenticado).
- `GET /api/roles` / `POST /api/roles` — papéis da própria empresa (POST exige `rbac.manage`).
- `GET/PATCH/DELETE /api/roles/:id` — papéis customizados (PATCH/DELETE exigem `rbac.manage`; papéis `is_system` são protegidos com erro `SYSTEM_ROLE`).
- `GET/POST/DELETE /api/users/:id/roles` — atribuir/revogar papel a um usuário (`POST`/`DELETE` exigem `rbac.manage`).

Não há UI dedicada de administração de RBAC nesta etapa (critério de
"verde" desta fase não exige UI — só backend real) — a API acima já é
suficiente para operar via `fetch`/Postman/scripts enquanto uma tela
não é construída em um ciclo futuro.

## 6. Login

`/login` (Supabase Auth `signInWithPassword`) e `src/proxy.ts`
(equivalente ao antigo `middleware.ts` — renomeado no Next.js 16;
atualiza a sessão a cada requisição, redireciona usuário sem sessão
para `/login`). Sem `.env.local` configurado, o proxy não bloqueia
nada — mesma degradação graciosa que o resto do app já tinha.

## 7. Limitações conhecidas desta etapa

- Sem UI de administração de papéis/permissões (só API).
- Um usuário só pertence efetivamente a uma empresa na prática (a
  estrutura já suporta múltiplas, mas não há seletor de empresa na UI).
- Sem filial (`branch_id`) — arquitetura preparada, tabela não criada
  ainda (não havia necessidade real de domínio nesta etapa).
- `supabase/tests/rls_rbac.sql` precisa de um projeto Supabase real
  configurado para rodar (não há Postgres disponível neste ambiente de
  desenvolvimento) — ver docs/TESTING.md.
