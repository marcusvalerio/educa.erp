# Supabase — Fase 2

Este documento explica como configurar o banco de dados definitivo do
ERP (Supabase/PostgreSQL), a arquitetura de acesso a dados e como
verificar que tudo está realmente persistindo no banco.

## 1. Pré-requisitos

- Um projeto Supabase já criado (URL + chaves).
- Node.js e npm (já usados pelo restante do projeto).
- Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli) para
  rodar as migrations via `supabase db push` (o projeto já tem
  `npx supabase` disponível, não é preciso instalar globalmente).

## 2. Variáveis de ambiente

Copie o template e preencha com as credenciais do seu projeto
(**Project Settings → API** no painel do Supabase):

```bash
cp .env.local.example .env.local
```

| Variável | Onde usar | Onde encontrar |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only** | Project Settings → API → service_role (secreta!) |
| `SUPABASE_DB_URL` | só a CLI (migrations) | Project Settings → Database → Connection string |
| `SUPABASE_PROJECT_REF` | só a CLI (`supabase link`) | está na URL do projeto |

`.env.local` nunca é commitado (`.env*` está no `.gitignore`, com
exceção explícita do `.env.local.example`, que é o template).
`SUPABASE_SERVICE_ROLE_KEY` só é lida em código marcado `server-only`
(`src/lib/supabase/admin.ts`) — nunca chega ao bundle do navegador.

## 3. Rodar as migrations

As migrations ficam em `supabase/migrations/*.sql`, numeradas e
aplicadas em ordem. Duas formas de rodar:

**Opção A — Supabase CLI (recomendado):**

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push
```

**Opção B — SQL Editor do painel Supabase:** abra cada arquivo de
`supabase/migrations/` em ordem (`0001_...`, `0002_...`, `0003_...`,
`0004_...`) e cole/rode no SQL Editor.

O banco pode ser reconstruído do zero a qualquer momento rodando as
4 migrations em ordem — nada é criado manualmente pelo dashboard.

## 4. Popular dados iniciais (seed)

`supabase/seed.sql` é **gerado**, não escrito à mão — reaproveita os
mesmos nomes/pools "didáticos e realistas" já usados na interface
(Fase 1/4). Para regravar:

```bash
node scripts/generate-seed.mjs
```

Para aplicar no banco:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

(ou cole o conteúdo do arquivo no SQL Editor do Supabase). O seed cria:
1 empresa, 30 locais de estoque, 10 transportadoras, 15 fornecedores,
15 motoristas (alguns com CNH vencida/a vencer, de propósito, para
testar o alerta), 15 veículos, 30 produtos, 20 clientes e 10 usuários —
volume suficiente para testar busca, filtros, paginação, relacionamentos
e o bloqueio de exclusão.

## 5. Rodar o projeto

```bash
npm install
npm run dev
```

Abra [http://localhost:3000/cadastros](http://localhost:3000/cadastros/produtos).
Sem `.env.local` preenchido, as rotas de API respondem com um erro
claro (`Variável de ambiente ... não definida`) em vez de falhar
silenciosamente.

## 6. Arquitetura

```
UI (CadastroPage, EntityDrawer, ...)
  ↓ (fetch)
Repository (src/lib/cadastros/repository.ts)
  ↓ HTTP
API Routes (src/app/api/<recurso>/route.ts e [id]/route.ts)
  ↓
src/lib/api/handlers.ts (validação Zod, envelope {success, data|error})
  ↓
src/lib/database/table.ts (createTableRepository — genérico)
  ↓
src/lib/database/mappers.ts (camelCase ↔ snake_case)
  ↓
Supabase Admin Client (service_role) — src/lib/supabase/admin.ts
  ↓
PostgreSQL (Supabase)
```

Pontos importantes:

- **Repository do cliente é assíncrono, mas a assinatura pública é a
  mesma da Fase 4** (`hydrate/list/get/create/update/toggleStatus/
  remove/subscribe/getSnapshot`) — `list()`/`get()` continuam
  síncronos, lendo de um cache local populado por `hydrate()`;
  `create/update/toggleStatus/remove` agora retornam `Promise`.
  `CadastroPage` já foi ajustado para `await` essas chamadas e exibir
  estados de carregando/salvando/erro.
- **Um repositório genérico** (`createTableRepository`, em
  `src/lib/database/table.ts`) implementa list/get/create/update/
  remove uma única vez; cada um dos 8 cadastros só declara sua tabela,
  colunas de busca, mapeadores e dependentes (para o bloqueio de
  exclusão) em `src/lib/database/repositories.ts`.
- **Auditoria** é gravada pelo próprio `table.ts` a cada create/update/
  toggleStatus/remove, na tabela `audit_logs` — não depende mais do
  cliente (Fase 4 gravava no localStorage). Action é inferida
  automaticamente (`CREATE`/`UPDATE`/`DELETE`/`ACTIVATE`/`INACTIVATE`
  — as duas últimas quando só o `status` muda).
- **Bloqueio de exclusão** tem duas camadas: (1) uma checagem explícita
  antes do DELETE (`dependents` em cada config de
  `repositories.ts`), que devolve uma mensagem específica
  ("Este fornecedor está vinculado a produtos cadastrados..."); (2) a
  própria foreign key no banco (`on delete restrict`), como rede de
  segurança — se por algum motivo a checagem (1) for contornada, o
  Postgres recusa a operação (erro 23503), traduzido para a mesma
  mensagem amigável em `src/lib/database/errors.ts`.
- **Usuário "autor"** das operações: como a Fase 3 (autenticação) ainda
  não existe, todo `audit_logs.actor_label` usa o identificador de
  sistema/desenvolvimento `dev-system`
  (`src/lib/database/constants.ts DEV_ACTOR_LABEL`) — não é uma
  autenticação disfarçada, é só um rótulo documentado.
- **Empresa única**: o ERP roda em modo mono-empresa nesta fase — todas
  as linhas pertencem à empresa semente `DEFAULT_COMPANY_ID`
  (`00000000-0000-0000-0000-000000000001`). A Fase 3 passará a
  resolver a empresa a partir do usuário autenticado.

## 7. Row Level Security (RLS)

RLS está **habilitada em todas as tabelas de negócio**
(`supabase/migrations/0004_rls_policies.sql`), mas **nenhuma policy é
criada para os papéis `anon`/`authenticated`** nesta fase — ou seja,
sem uma policy correspondente, o Postgres nega por padrão. Toda a
leitura/escrita passa pelas rotas `/api/*`, que usam o cliente
administrativo (`service_role`, que ignora RLS por definição).

**O que muda na Fase 3:** com o Supabase Auth, cada usuário terá um
JWT com claims (ex.: `company_id`), e serão criadas policies como
`using (company_id = (auth.jwt() ->> 'company_id')::uuid)` — nesse
ponto o acesso poderá passar a respeitar RLS diretamente do browser
quando fizer sentido.

## 8. Transição do localStorage (Fase 4 → Fase 2)

A Fase 4 guardava tudo em `localStorage` (chaves `erp:cadastros:*`) —
dados que existem **apenas no navegador de quem usou o sistema antes**
desta fase. Como a estrutura de campos mudou um pouco (IDs viraram
UUIDs reais; `código` de clientes/fornecedores/transportadoras/
motoristas/veículos/usuários passou a ser gerado pelo banco em vez de
ser o próprio id), **não existe uma migração automática 1:1** que faça
sentido rodar sem risco de duplicar ou corromper dados — a
recomendação é:

1. Se havia dados de teste importantes no localStorage de alguém, você
   pode abrir o DevTools → Application → Local Storage, copiar o JSON
   de cada chave (`erp:cadastros:produtos`, `erp:cadastros:clientes`,
   etc.) e recriar manualmente os registros relevantes pela própria UI
   (agora gravando direto no Supabase) — é o caminho seguro, já que a
   tela faz toda a validação/mapeamento de novo.
2. Para o ambiente de desenvolvimento/demonstração, `supabase/seed.sql`
   já cobre o mesmo papel que os dados mockados da Fase 4 cobriam.
3. O `localStorage` **deixou de ser usado pela aplicação** a partir
   desta fase — `src/lib/cadastros/repository.ts` não lê nem escreve
   mais nele. Dados antigos ficam órfãos no navegador (inofensivos,
   mas podem ser limpos manualmente pelo usuário se quiser).

## 9. Como verificar que os dados estão realmente no banco

Não confie apenas na tela — o critério de conclusão da Fase 2 é
`Frontend → API → Supabase → PostgreSQL`:

1. Abra `/cadastros/fornecedores`, crie um fornecedor novo, salve.
2. Recarregue a página (F5) — o fornecedor deve continuar lá (prova
   que não é só estado em memória do React).
3. No painel do Supabase, abra **Table Editor → suppliers** (ou rode
   `select * from public.suppliers order by created_at desc limit 5;`
   no SQL Editor) e confirme que a linha existe, com os mesmos dados.
4. Repita para produtos, clientes e transportadoras.
5. Confira `audit_logs` (`select * from public.audit_logs order by
   created_at desc limit 20;`) — deve haver uma linha `CREATE` para
   cada registro criado no passo 1.

## 10. Testes

Ver `docs/TESTING.md` para o roteiro de testes manuais/automatizados
executados nesta fase (CRUD, relacionamentos, bloqueio de exclusão,
alerta de CNH, paginação/filtros, tratamento de erros).

## 11. O que fica para a Fase 3

- Autenticação real (Supabase Auth) e sessão no browser.
- Substituir o `service_role` fixo nas rotas de API por um cliente no
  contexto do usuário autenticado (`src/lib/supabase/server.ts` já
  está pronto para isso).
- Policies de RLS por `company_id`/usuário (hoje só habilitada, sem
  policies de `anon`/`authenticated`).
- Perfis e permissões por módulo/ação (a tabela `users` já tem
  `role`/`department`; falta a aplicação impor essas permissões).
- Vincular `public.users.auth_user_id` a `auth.users` de fato.
- Auditoria com `user_id` real em vez de `actor_label = 'dev-system'`.
- Suporte a múltiplas empresas (`company_id` dinâmico por sessão, em
  vez do `DEFAULT_COMPANY_ID` fixo).
