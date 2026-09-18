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

## 2.1 Deploy em produção (Vercel) — NEXT_PUBLIC_* exige rebuild

**Causa raiz confirmada de "Variável de ambiente NEXT_PUBLIC_SUPABASE_ANON_KEY não definida" em produção:** não é um bug de código — é comportamento documentado do próprio Next.js (`node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, seção "Bundling Environment Variables for the Browser"):

> Next.js can "inline" a value, **at build time**, into the js bundle... replacing all references to `process.env.[variable]`... After being built, your app will no longer respond to changes to these environment variables... all `NEXT_PUBLIC_` variables will be frozen with the value evaluated at build time.

Isso vale mesmo para código que só roda no servidor (`src/lib/supabase/env.ts`, `server.ts`, e o `proxy.ts`/Edge middleware) — o prefixo `NEXT_PUBLIC_` faz o Next.js substituir a referência por um literal em **toda** a árvore compilada, não só no bundle do navegador.

**Consequência prática:** editar/adicionar `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` nas Environment Variables do painel da Vercel **não tem efeito nenhum sobre um deployment já existente**. Só passa a valer a partir do próximo `next build` — ou seja, é preciso criar um **novo deployment** (Redeploy, ou um novo push) depois de confirmar a variável salva em Production. Se o deployment atual foi construído antes da variável estar correta no ambiente, ele vai continuar falhando indefinidamente com esse erro até ser reconstruído — trocar o valor de novo não resolve, só reconstruir resolve.

Checklist para produção:
1. Confirme as 3 variáveis em **Vercel → Project → Settings → Environment Variables**, escopo **Production** (não só Preview/Development).
2. Dispare um **novo deployment** (Redeploy do último commit, ou um novo push) — nunca reaproveite um build antigo.
3. Só then teste os endpoints — testar antes do rebuild vai mostrar o mesmo erro mesmo com a variável "salva".

`SUPABASE_SERVICE_ROLE_KEY` (sem o prefixo `NEXT_PUBLIC_`) não sofre esse problema — variáveis server-only são lidas em runtime a cada invocação da função serverless, não precisam de rebuild para atualizar.

## 3. Rodar as migrations

As migrations ficam em `supabase/migrations/*.sql`, numeradas e
aplicadas em ordem. Duas formas de rodar:

**Opção A — Supabase CLI (recomendado):**

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npx supabase db push
```

**Opção B — SQL Editor do painel Supabase:** abra cada arquivo de
`supabase/migrations/` em ordem (`0001_...` até `0007_...`) e cole/rode
no SQL Editor.

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

## 7. Row Level Security (RLS) e RBAC — Fase 2b

RLS deixou de ser "habilitada mas vazia": a partir das migrations
`0005_rbac.sql`, `0006_rls_functions_and_policies.sql` e
`0007_product_catalog.sql`, existem policies reais para `authenticated`
em todas as tabelas de negócio, gated por permissão RBAC
(`has_permission(company_id, 'modulo.acao')`) — nunca
`using (true)`. `anon` continua sem nenhuma policy (nega tudo). As
rotas `/api/*` continuam usando `service_role` para a escrita
propriamente dita, mas agora exigem autenticação real + a permissão
correspondente **antes** de chamar o repositório (`src/lib/api/
handlers.ts`) — `service_role` deixou de ser a única barreira, porque
a RLS no banco protege mesmo um acesso direto ao Supabase (fora da API
do Next.js) com uma sessão de usuário comum.

Ver **docs/RBAC.md** para o modelo completo (usuários, papéis,
permissões, bootstrap do primeiro admin) e `supabase/tests/rls_rbac.sql`
para o roteiro de verificação automatizado (requer projeto Supabase
real — não roda neste ambiente de desenvolvimento).

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

## 11. Fase 2b (concluída) e o que ainda fica para ciclos futuros

Concluído nesta etapa (ver docs/RBAC.md para detalhes):

- Autenticação real (Supabase Auth) com login (`/login`) e sessão no
  browser (`src/proxy.ts` — Next.js 16 renomeou `middleware.ts`).
- Policies de RLS reais por `company_id` + permissão RBAC (não mais
  só habilitada e vazia).
- RBAC completo: `roles`/`permissions`/`role_permissions`/
  `user_companies`/`user_roles`, autorização imposta no backend
  (`requireAccess` em `src/lib/api/handlers.ts`), não só escondendo
  botões na UI.
- `public.users.auth_user_id` vinculado de fato (via
  `bootstrap_admin_user()` e `getAuthContext()`).
- Auditoria com `user_id` real quando o usuário está autenticado.
- `company_id` resolvido da sessão do usuário, não mais uma constante
  fixa (`DEFAULT_COMPANY_ID` continua existindo só para seed/scripts).
- Catálogo de produtos evoluído: categorias hierárquicas, marcas,
  unidades + conversões, múltiplos fornecedores por produto — ver
  seção de catálogo abaixo.

Fica para ciclos futuros:

- UI de administração de papéis/permissões (hoje só via API — ver
  docs/RBAC.md §5).
- Seletor de empresa/filial na UI (estrutura já suporta múltiplas
  empresas por usuário; UI ainda assume a empresa "atual" da sessão).
- Tabela de filiais (`branches`) e `branch_id` nas policies.
- Estoque real (saldo por depósito/localização), comercial, compras,
  financeiro e fiscal completos.
- UI de variantes de produto e de múltiplos códigos de barra
  (`product_variants`/`product_barcodes` já existem no banco).
