# RLS / RBAC — rodada 1 (fundação real)

Este documento descreve o que foi implementado nesta rodada para tirar
**RLS/Segurança** e **Usuários/RBAC** de um estado incompleto para um
estado funcional e testável — não é a maturidade final desses dois
domínios (ver "O que fica para a próxima rodada" no final).

Migrations: `supabase/migrations/0006` a `0011`.

## 1. Modelo

```
auth.users (Supabase Auth — credencial/sessão)
   │ auth_user_id
   ▼
public.users (cadastro de negócio — já existia, Cadastros → Usuários)
   │ company_id                         │ user_id
   ▼                                    ▼
public.companies                 public.user_roles (N:N)
                                         │ role_id
                                         ▼
                                  public.roles (por empresa)
                                         │ role_id
                                         ▼
                                  public.role_permissions (N:N)
                                         │ permission_id
                                         ▼
                                  public.permissions (catálogo global)
```

**Por que não existe uma tabela `user_companies` nova:** `public.users`
já é, por linha, "o cadastro desta pessoa nesta empresa" (tem
`company_id`, e os `unique` de email/login já são só dentro da
empresa). Uma pessoa com acesso a mais de uma empresa vira mais de uma
linha de `users` com o mesmo `auth_user_id` — o vínculo empresa↔usuário
já é essa linha, e os papéis dela ficam naturalmente por empresa
porque `user_roles` referencia `users.id` (não `auth_user_id`).
Reaproveita o que já existia em vez de duplicar.

**Preparação para filial:** `public.branches` (empresa → filiais) e
`users.branch_id` (opcional) existem desde já. RLS desta rodada ainda
não filtra por filial (só por `company_id`) — é a granularidade da
próxima rodada.

## 2. Por que não há custom claims no JWT

A abordagem mais comum de RLS multiempresa usa uma claim customizada
(`company_id`) no JWT, alimentada por um *Custom Access Token Hook*
configurado no painel do Supabase — fora do alcance desta sessão (não
há ferramenta para configurar isso via API/MCP). Em vez disso, as
policies usam duas funções `security definer` que casam `auth.uid()`
direto contra `public.users`:

- `current_user_company_ids()` — as empresas do usuário logado.
- `has_permission(company_id, code)` — se o usuário logado tem essa
  permissão *nessa* empresa.
- `current_user_permissions(company_id)` — lista completa (usada por
  `/api/me`, não é camada de segurança, só conveniência de UI).

Isso é o padrão que a própria documentação do Supabase recomenda
quando não há custom claims — sem depender de nada fora do banco.

## 3. RLS real (não mais "habilitado sem policy")

Antes desta rodada: RLS **habilitado** em todas as tabelas, **zero**
policies — Postgres nega tudo por padrão sem policy, então só o
`service_role` (que ignora RLS) conseguia acessar qualquer coisa. Isso
não era "RLS real", era só uma trava fechada com uma única chave
mestra.

Agora: cada tabela de negócio tem 4 policies (SELECT/INSERT/UPDATE/
DELETE), sempre casando `company_id` com `has_permission()` — nenhuma
usa `using (true)` em dado de empresa. As duas exceções documentadas,
ambas sem `company_id` e sem dado sensível (catálogo global, mesmo
raciocínio de infraestrutura compartilhada):

- `public.permissions` — SELECT livre para `authenticated`.
- `public.units` — SELECT livre para `authenticated`.

`public.audit_logs` só tem policy de SELECT — de propósito, não tem
INSERT/UPDATE/DELETE para `authenticated`: a auditoria só deve ser
gravada pelo backend confiável, nunca diretamente por quem está
logado, senão deixa de ser confiável.

### Bug real encontrado e corrigido na própria implementação

A migration 0006 criou as 5 tabelas novas de RBAC (`branches`,
`permissions`, `roles`, `role_permissions`, `user_roles`) **sem**
`enable row level security`, e a 0007 criou policies em cima delas —
Postgres ignora policy sem RLS habilitado, ou seja, essas 5 tabelas
ficaram sem proteção nenhuma por alguns minutos, entre a 0006 e a
correção. Detectado via `get_advisors` (achados `policy_exists_
rls_disabled` e `rls_disabled_in_public`, nível ERROR) antes de
qualquer outro avanço, corrigido na migration 0008
(`0008_rls_rbac_hardening.sql`), e reconfirmado limpo depois. Registrado
aqui porque a auditoria pediu honestidade sobre o processo, não só o
resultado.

## 4. Prova empírica (não só "a policy existe")

Sem a `SUPABASE_SERVICE_ROLE_KEY` (ainda pendente — ver
`docs/SUPABASE.md`), a rota HTTP externa ficou bloqueada pela política
de rede deste ambiente. Em vez de pular a prova, ela foi feita da
forma que o próprio Supabase recomenda para testar RLS diretamente no
Postgres — simulando exatamente a sessão que o PostgREST monta:

```sql
set role authenticated;
set request.jwt.claims = '{"sub":"<auth_user_id>","role":"authenticated"}';
```

Um usuário Auth real foi criado via SQL + `pgcrypto`
(`extensions.crypt()`), sem precisar da service_role key (que só falta
para os handlers admin da própria aplicação Next.js — não é uma
limitação desta prova). Testes executados e resultados:

| Cenário | Papel do usuário | Resultado |
| --- | --- | --- |
| SELECT em `products` da própria empresa | `leitura` | 30/30 linhas visíveis |
| INSERT em `products` | `leitura` | rejeitado (`42501 new row violates row-level security policy`) |
| SELECT em `products`/`companies`/`roles` de uma **segunda empresa** criada só para o teste | `leitura` (só tem acesso à empresa A) | 0 linhas em tudo — isolamento confirmado em 3 tabelas diferentes |
| INSERT em `products` | `operador` (ganhou o papel) | sucesso |
| DELETE do produto criado acima | `operador` | 0 linhas afetadas (RLS filtra silenciosamente, sem erro) |
| DELETE do mesmo produto | `admin` (ganhou o papel) | sucesso |
| SELECT em `products`/`companies`/`units` | `anon` (sem login) | 0 linhas em tudo, inclusive no catálogo "global" `units` |

Toda a massa de teste (empresa B, usuário Auth, cadastro de usuário,
papéis extras) foi removida ao final — as contagens de `products`
(30) e `companies` (1) foram reconferidas exatamente iguais às de
antes do teste.

## 5. RBAC

Papéis semeados automaticamente para **toda** empresa (trigger
`seed_default_roles` em `companies`, mais o backfill da empresa
semente):

| Papel | Código | Permissões |
| --- | --- | --- |
| Administrador | `admin` | todas (43 nesta rodada) |
| Operador | `operador` | `read`+`create`+`update` de todos os módulos, exceto `rbac` |
| Somente leitura | `leitura` | só `read` de todos os módulos |

Catálogo de permissões (`public.permissions`): `products`, `customers`,
`suppliers`, `carriers`, `drivers`, `vehicles`, `warehouse_locations`,
`users` (cada um com `read`/`create`/`update`/`delete`), `rbac`
(`roles.read`/`roles.manage`), `audit` (`audit_logs.read`), `catalog`
(`categories.*`/`brands.*`) e `branches` (`branches.read`/
`branches.manage`). `product_units`/`product_suppliers`/
`product_prices` reaproveitam as permissões `products.*` (são
sub-recursos de produto, não módulos próprios — evita inflar o
catálogo sem necessidade real nesta rodada).

Adicionar uma permissão nova (para um módulo futuro) é uma linha em
`public.permissions` — nenhuma mudança estrutural.

## 6. O que NÃO foi feito nesta rodada (de propósito, documentado)

- **As 8 rotas `/api/*` de cadastro existentes continuam no cliente
  `service_role`** (ignora RLS), não no cliente de sessão. Trocar isso
  é uma decisão de produto ainda pendente (método de login,
  provisionamento do primeiro usuário admin — ver
  `docs/AUTH_ARCHITECTURE.md`, seção "Decisões que faltam", que
  **continua válida**). RLS já é real e ativa no banco independente
  disso — qualquer acesso direto ao Postgres/PostgREST já respeita as
  regras agora, só a API do Next.js ainda não migrou de autoridade.
- **Sem tela de login.** `src/lib/auth/session.ts` e `/api/me` existem
  e são reais/testáveis (usam o cliente de sessão, não admin), mas não
  há UI para autenticar — ver decisões pendentes no mesmo documento.
- **RLS ainda não filtra por filial** (`branch_id` existe, mas não
  entra em nenhuma policy) — granularidade da próxima rodada.
- **Sem reparentamento de categoria pós-criação** (ver
  `docs/CATALOGO.md`).
- **`roles.manage` não tem UI** (nem a tela mock `Configurações →
  Permissões` foi religada aos dados reais) — a API existe
  (`/api/roles` não foi criada nesta rodada; só o schema/RLS/seed
  estão prontos) e fica para a próxima rodada, quando entrar em
  discussão junto com a UI de Auth.
