# Autenticação, Autorização e Usuários — decisão arquitetural pendente

Este documento registra a análise feita na etapa de "fundação" do ASTRA.ERP
(pós-auditoria funcional) sobre autenticação/autorização e sobre a
duplicidade de "Usuários". **Nada aqui foi implementado em código** — é a
decisão que precisa ser tomada antes de implementar, para não gerar uma
solução improvisada que teria que ser refeita.

## Por que não implementar agora

1. Depende do Supabase do ASTRA.ERP estar validado e acessível (ver
   `docs/SUPABASE.md` — nesta etapa, a validação ficou bloqueada por
   ambiguidade sobre qual projeto Supabase pertence ao ASTRA.ERP; ver
   relatório da sessão).
2. Depende de decisões de produto que não são técnicas — ver seção
   "Decisões que faltam" abaixo. Implementar login "só para marcar como
   concluído" sem essas respostas provavelmente exigiria refazer o
   trabalho depois.

## Estado atual (confirmado por auditoria)

- Não existe login, sessão, Supabase Auth, middleware de rota ou RBAC no
  código. Busca por `auth`/`login`/`middleware` no `src/` não retorna nada.
- Todas as rotas `/api/*` usam `createAdminClient()`
  (`src/lib/supabase/admin.ts`), o cliente **service_role**, que ignora
  Row Level Security por definição. Ou seja: hoje, qualquer requisição que
  alcançar essas rotas tem acesso total ao banco, sem checagem alguma.
- `RLS` está habilitado nas tabelas mas sem nenhuma policy para
  `anon`/`authenticated` (migration `0004_rls_policies.sql`) — isso impede
  acesso direto do navegador ao Supabase, mas não protege nada em relação
  à própria API do Next.js, que é o único caminho usado hoje.
- `audit_logs` grava sempre o mesmo ator fixo (`DEV_ACTOR_LABEL =
  "dev-system"`), porque não há usuário autenticado para identificar.
- Existe um único `DEFAULT_COMPANY_ID` fixo — não há isolamento real
  multi-empresa.
- Existem **duas listagens de "Usuários"** sem nenhuma relação entre si:
  - `Cadastros → Usuários`: CRUD real (API + Supabase), tabela `users`
    criada na migration `0002_core_entities.sql`.
  - `Configurações → Usuários`: página mock (`ModulePage` + dado
    gerado por seed determinístico), sem persistência.

## Modelo alvo (cadeia completa)

```
AUTH (Supabase Auth) → SESSION (cookie via @supabase/ssr)
   → USUÁRIO (perfil ligado a auth.users)
      → EMPRESA (company_id)
         → PAPEL/PERMISSÃO (role)
            → AUTORIZAÇÃO DA API (checagem no route handler)
               → RLS (policy por company_id/role usando o JWT)
```

### Recomendação técnica

- **Identidade**: usar `Supabase Auth` (`auth.users`) em vez de
  autenticação própria — o projeto já é Supabase/Postgres, não há
  motivo para reinventar login/hash de senha/reset de senha.
- **Sessão**: `@supabase/ssr` (já é dependência do projeto) para
  sessão via cookie no Next.js App Router — troca o cliente
  `service_role` das rotas `/api/*` pelo cliente autenticado da
  requisição, que passa a respeitar RLS de verdade.
- **Usuário = resolução da duplicidade (Fase 6)**: a tabela `users`
  criada em `0002_core_entities.sql` (hoje exposta em
  `Cadastros → Usuários`) passa a ser a **fonte única de verdade** para
  dado cadastral de usuário (nome, cargo, departamento, `company_id`,
  `role`, status ativo/inativo) — ganha uma coluna `auth_user_id`
  (FK para `auth.users.id`). `Supabase Auth` continua responsável
  **apenas** por credencial/sessão (e-mail, senha, tokens) — nunca duplica
  dado cadastral.
  `Configurações → Usuários`, sendo uma tela mock, deve ser
  **descontinuada e substituída por um link/atalho para
  `Cadastros → Usuários`** — não deve virar uma segunda implementação.
  Essa mudança de código fica fora do escopo desta etapa (ver "Não avançar
  para os mocks" no pedido original) e deve ser feita junto da
  implementação de Auth, não antes.
- **Papel/Permissão**: começar com papéis fixos (ex.: `admin`,
  `operador`, `leitura`) armazenados como coluna `role` em `users`, em vez
  de uma matriz granular por módulo/ação — a tela mock
  `Configurações → Permissões` sugere um modelo granular, mas isso é uma
  decisão de produto maior que pode vir depois, sobre a base de papéis
  fixos.
- **Autorização da API**: um helper único (`requireSession()` /
  `requireRole()`) chamado no topo de cada route handler antes de tocar
  o repositório — nega 401/403 antes de qualquer query.
- **RLS real**: policies como
  `using (company_id = (auth.jwt() ->> 'company_id')::uuid)`, alimentadas
  por uma claim customizada no JWT (via *custom access token hook* do
  Supabase Auth, ligando `auth.users.id` → `users.company_id`).
- **audit_logs**: passa a gravar o `auth.users.id`/e-mail real do ator,
  não mais o placeholder fixo.

## Decisões que faltam (não técnicas — precisam de resposta antes de implementar)

1. Método de login: e-mail+senha, magic link, SSO/OAuth, ou mais de um?
2. Modelo de empresa: cada usuário pertence a exatamente uma empresa, ou
   pode alternar entre empresas (multi-tenant por usuário)?
3. Papéis: lista fixa de papéis é suficiente para o lançamento, ou é
   obrigatório ter permissão granular por módulo/ação desde já?
4. Convite/provisionamento: quem cria o primeiro usuário admin de uma
   empresa nova? Existe autoatendimento (self-signup) ou só convite?
5. O que fazer com o dado de `Configurações → Usuários` hoje (é
   inteiramente mock/descartável, ou alguém já espera ver algo específico
   ali que precisa ser preservado)?

Enquanto essas respostas não existirem, a implementação de Auth fica
parada nesta análise — implementar sem elas seria uma solução
improvisada.
