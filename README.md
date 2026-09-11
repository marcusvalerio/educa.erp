# Educa ERP — Logístico

Sistema de gestão empresarial e operações logísticas.

## Status do projeto

- **Fase 1** — estrutura visual e de navegação completa (dashboard,
  menu, 9 módulos, dados simulados).
- **Fase 4** — módulo de Cadastros funcional (CRUD, validação,
  relacionamentos, auditoria) — inicialmente com persistência em
  `localStorage`.
- **Fase 2** — persistência definitiva em **Supabase / PostgreSQL**,
  API própria (`/api/*`) e repositório do cliente reescrito para falar
  com ela.
- **Fase 2b** (atual) — RLS real, RBAC (usuários/papéis/permissões),
  autenticação real via Supabase Auth (login), e evolução do catálogo
  de produtos (categorias, marcas, unidades/conversões, múltiplos
  fornecedores por produto). Ver **[docs/SUPABASE.md](docs/SUPABASE.md)**
  para configurar o banco, **[docs/RBAC.md](docs/RBAC.md)** para o
  modelo de segurança/autorização e **[docs/TESTING.md](docs/TESTING.md)**
  para o roteiro de testes.

Ainda não implementados (ciclos futuros): UI de administração de
papéis/permissões (hoje só via API), filiais, estoque real (saldo),
módulos de Comercial/Suprimentos/Logística/Financeiro/Fiscal além dos
cadastros, emissão fiscal real, integrações externas.

### Módulos

Dashboard · Cadastros · Comercial · Suprimentos · Logística · Financeiro ·
Fiscal · Gestão · Configurações

### Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Tailwind CSS v4
- [Supabase](https://supabase.com) (PostgreSQL) — banco de dados definitivo
- [Zod](https://zod.dev) — validação server-side
- [Recharts](https://recharts.org) para os gráficos do dashboard
- [lucide-react](https://lucide.dev) para ícones
- Fontes: [Inter](https://fonts.google.com/specimen/Inter) (texto) e
  [Supreme](https://www.fontshare.com/fonts/supreme) (títulos e destaques)

## Desenvolvimento

```bash
npm install
cp .env.local.example .env.local   # preencha com as credenciais do Supabase
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Sem um projeto
Supabase configurado, a UI carrega mas as chamadas de API retornam erro
— configure o banco primeiro (**[docs/SUPABASE.md](docs/SUPABASE.md)**).
Com o banco configurado, é preciso **entrar em `/login`** com um
usuário criado via `bootstrap_admin_user()` (**[docs/RBAC.md](docs/RBAC.md)**)
antes de usar `/cadastros/*` — todas as rotas de API agora exigem
autenticação e permissão RBAC.

```bash
npm run build   # build de produção (inclui typecheck completo)
npm run lint    # eslint
npm test        # testes automatizados (validação + mapeamento de dados)
```

## Estrutura do projeto

```
src/
  app/
    api/                 rotas REST (GET/POST/PATCH/DELETE) dos cadastros + catálogo + RBAC + audit-logs
    login/                página de login (Supabase Auth)
    <módulo>/<página>/    rotas de UI (App Router) — uma pasta por módulo/submódulo
  components/
    layout/              Sidebar, Topbar (com logout), AppShell
    ui/                   componentes reutilizáveis (tabela, filtros, drawer, etc.)
    cadastro/             CadastroPage, EntityDrawer/Form, RelatedList, AuditTrail
    dashboard/            gráficos do dashboard
  lib/
    nav.ts                estrutura do menu lateral
    pages/                configuração das telas mockadas (módulos ainda não migrados)
    mock/                 geradores de dados simulados (dashboard e módulos futuros)
    cadastros/             tipos, formulários, colunas, validação client-side, repository (fala com /api)
    validations/           schemas Zod usados pelas rotas de API (server-side)
    database/              mapeamento camelCase↔snake_case, acesso genérico às tabelas, auditoria
    supabase/               clientes Supabase (browser, server SSR, admin/service-role)
    auth/                   contexto do usuário autenticado + checagem de permissão (RBAC)
  proxy.ts                 sessão Supabase Auth + redirect para /login (Next.js 16: antigo middleware.ts)
supabase/
  migrations/             schema versionado (companies, cadastros, audit_logs, RBAC, RLS, catálogo)
  tests/                  verificação de RLS/RBAC contra um Supabase real (rls_rbac.sql)
  seed.sql                dados iniciais (gerado por scripts/generate-seed.mjs)
scripts/
  generate-seed.mjs        gera supabase/seed.sql a partir dos mesmos pools de dados da UI
tests/                    testes automatizados (node --test via tsx)
docs/
  SUPABASE.md             como configurar o banco, arquitetura, RLS, verificação de persistência
  RBAC.md                  modelo de usuários/papéis/permissões, RLS real, bootstrap do admin
  TESTING.md              roteiro de testes manuais e automatizados
```

A camada `src/lib/cadastros/repository.ts` mantém a mesma assinatura
pública desde a Fase 4 (`list/get/create/update/toggleStatus/remove`) —
por baixo, ela chama `/api/*`, que por sua vez fala com o Supabase. Os
componentes de tela (`CadastroPage`, `EntityDrawer`, etc.) não sabem
que existe um banco de dados por trás; trocar a implementação interna
do repositório de novo (ex.: cache mais elaborado, GraphQL) não deve
exigir tocar nas telas.
