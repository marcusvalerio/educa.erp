# Homologação do EDUCA — branch `claude/educa-homolog`

Ambiente para avaliar o EDUCA completo (ERP redesenhado, manuais e landing) antes
de qualquer decisão sobre a `main`. **Nada aqui toca a produção.** Nenhuma senha,
token ou string de conexão está neste repositório.

## 1. O que a branch contém

| Origem | Como entrou | Conteúdo |
|---|---|---|
| `main` (6cd762c) | base | ERP atual |
| `claude/educa-landing` (5f9fb7f) | fast-forward | inclui `claude/educa-redesign` e `claude/educa-manual`: redesign do app, manuais (PDF) e landing V4 |
| `poc/supabase-to-neon` (f089005) | merge sem conflito | modo `DATA_BACKEND=postgres` + `AUTH_PROVIDER=neon` (Neon), `vercel.json` com região `gru1` |

**Ficaram de fora:**

- `claude/erp-logistico-fase-1-j0l6lz`: superada pela `main` (e29e21a). Tem migrations 0006–0011 com numeração incompatível.
- `v0`: scaffold do v0.dev com pnpm, sem relação com o app atual.

Conflito real entre `claude/educa-landing` e a POC: nenhum. Os dois tocam `package.json` e `package-lock.json`, e o merge automático uniu as dependências (`pg` e `@types/pg`).

Mudanças próprias desta branch:

- **Identificação do ambiente:** com `APP_ENV=homologacao`, o app mostra o selo "Homologação · dados fictícios" em todas as telas e acrescenta "· HOMOLOGAÇÃO" ao título da aba (`src/lib/environment.ts` e `src/components/shell/EnvironmentBadge.tsx`). Sem a variável, nada muda.
- **Trava da Vercel:** `scripts/homolog/vercel-guard.mjs` (seção 3).
- **Automação:**
  - `scripts/homolog/bootstrap.mjs`: contas e papéis;
  - `scripts/homolog/seed.mjs`: dados fictícios;
  - `scripts/homolog/smoke.mjs`: smoke com navegador;
  - `.github/workflows/educa-homolog.yml`: roda tudo isso no runner do GitHub.
- **Landing:** a variável de build `LANDING_APP_URL` aponta "Entrar no EDUCA" para o app de homologação. Sem ela, o link vai para a produção. O conteúdo da landing não mudou.

## 2. Arquitetura

```
Landing (projeto estático na Vercel, público)
  └─ "Entrar no EDUCA" → https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app/login
ERP (Preview desta branch no projeto meji-projects/educa.erp, região gru1)
  ├─ Neon Auth da branch "homolog" (ep-royal-flower-b6tz0xde…/authdb/auth)
  └─ Neon PostgreSQL, projeto educa-erp-prod, branch "homolog", banco "educa", papel educa_app
```

- A branch Neon `homolog` é uma cópia do banco de produção. Os dados dela já eram fictícios: é o seed da Fase 4, com a empresa ASTRA, 20 clientes, 15 fornecedores e 30 produtos. Transações não havia nenhuma.
- A produção continua como está: Supabase `educa.erp` e `educaerp.vercel.app`, com `AUTH_PROVIDER=supabase`. Nada foi alterado lá.

## 3. Trava da Vercel (por que o Preview pode aparecer "Canceled")

A Vercel também aplica a este Preview as **variáveis de Preview gerais** do projeto. Hoje o único projeto Supabase do EDUCA é o de produção, então elas provavelmente apontam para ele. O `vercel.json` desta branch:

- **Ignored Build Step:** `node scripts/homolog/vercel-guard.mjs ignore` **pula o deploy** da branch `claude/educa-homolog` enquanto o ambiente não estiver seguro;
- **Build:** `node scripts/homolog/vercel-guard.mjs build && next build` recusa o build nas mesmas condições.

Para liberar a branch, todas estas condições precisam valer:

- `APP_ENV=homologacao`, `DATA_BACKEND=postgres` e `AUTH_PROVIDER=neon`;
- `DATABASE_URL` e `NEON_AUTH_BASE_URL` apontam para o endpoint `ep-royal-flower-b6tz0xde` (branch `homolog`);
- conta de serviço presente;
- nenhuma variável `SUPABASE_*` ativa. Cada uma deve ficar ausente ou sobrescrita com `desativado` só para esta branch.

A trava imprime apenas nomes de variáveis. Outras branches não são afetadas. **Antes de qualquer merge na `main`, retire o `ignoreCommand` e o `buildCommand` do `vercel.json`.**

## 4. Usuários e papéis

As contas são criadas por `scripts/homolog/bootstrap.mjs` pelo fluxo oficial do app (convites e tela de papéis). O script é idempotente. Os e-mails usam `@example.com`, um domínio reservado sem caixa real. As senhas são as que **o dono do projeto** define nos segredos do GitHub; ninguém mais as conhece e elas não aparecem em log.

| Usuário | Papel | E-mail | Senha |
|---|---|---|---|
| Owner Homologação | Platform **OWNER** + papel **Administrador** da ASTRA: usuários, papéis, permissões, configurações, módulos, Administração Central | `owner.homolog@example.com` | segredo `HOMOLOG_OWNER_PASSWORD` |
| Admin Homologação | **Administrador operacional (Homologação)**: todas as permissões do Administrador **menos** a governança (papéis, usuários, módulos, unidades, estrutura, configurações) | `admin.homolog@example.com` | segredo `HOMOLOG_ADMIN_PASSWORD` |
| Usuário de Homologação | **Vendedor (Homologação)**, 39 permissões: Comercial e CRM (cria e edita, **sem aprovar, cancelar ou reservar**), consulta de clientes, produtos, preços e estoque | `usuario.homolog@example.com` | segredo `HOMOLOG_USER_PASSWORD` |

**Owner anterior da homologação:** o e-mail pessoal copiado da produção.

- O bootstrap abre uma sessão dele **por impersonação** da conta de serviço, sem ler, usar ou alterar a senha.
- Por essa sessão, convida o Owner novo.
- Em seguida, o Owner novo o **desativa** na plataforma da homologação.
- O e-mail dele fica confirmado só durante o convite; depois o valor original volta.
- Nada muda na produção.

**Por que papéis novos.** Os três papéis de sistema da ASTRA não servem para "Admin" e "Usuário limitado":

- **Operador** não tem nenhuma aprovação (pedidos, compras, estoque, financeiro, fiscal) e não move oportunidades no funil;
- **Somente leitura** vê tudo.

## 5. Dados fictícios

`scripts/homolog/seed.mjs` cria os dados pelas APIs oficiais, como Owner, sobre os cadastros fictícios da ASTRA. É idempotente: se a conta `CX-HML` já existe, não repete nada.

| Área | O que cria |
|---|---|
| Estoque | entrada de 8 produtos |
| Comercial | orçamento → envio → aprovação → pedido → aprovação; mais 1 pedido aguardando aprovação e 1 rascunho |
| Financeiro | categorias; contas Caixa e Banco; contas a receber do pedido com a 1ª parcela recebida; 2 contas a pagar (uma com parcela vencida e uma parcela paga) |
| Compras | solicitação aprovada |
| CRM | funil com 3 estágios, 3 leads, 2 oportunidades (uma movida de estágio) |
| Fiscal | estabelecimento, natureza de operação, NF-e em rascunho (ambiente de homologação) com item e cálculo |
| Qualidade | inspeção e não conformidade |
| Projetos | projeto, tarefa e ordem de serviço |
| Ativos | ativo e ordem de manutenção preventiva |

A reserva de estoque do pedido falha: é um BUG do banco, descrito na seção 7.

## 6. O que o dono do projeto precisa fazer (uma vez)

Nada disto passa pelo chat nem pelo Git.

1. **Neon Console → educa-erp-prod → branch `homolog` → Roles → `educa_app` → Reset password.**
   - Depois, **Connect**: branch `homolog`, banco `educa`, papel `educa_app`, *Connection pooling* ligado.
   - Copie a string **só** para a variável `DATABASE_URL` do passo 3.
2. **Conta de serviço do Neon Auth de homologação** (se ainda não tiver a senha):
   - na sua máquina, rode `node scripts/neon-service-account.mjs --email svc-educa@educaerp.com --out ./.neon-service-homolog.env`;
   - no SQL Editor, branch `homolog`, banco **`authdb`**, cole o SQL impresso (ele contém só o hash).
3. **Vercel → projeto educa.erp → Settings → Environment Variables.** Todas com ambiente **Preview** e *Git branch* = `claude/educa-homolog`, tipo *Sensitive* quando for segredo:

   | Variável | Valor |
   |---|---|
   | `APP_ENV` | `homologacao` |
   | `AUTH_PROVIDER` | `neon` |
   | `DATA_BACKEND` | `postgres` |
   | `DATABASE_URL` | string pooled do passo 1 |
   | `DATABASE_POOL_MAX` | `5` |
   | `NEON_AUTH_BASE_URL` | `https://ep-royal-flower-b6tz0xde.neonauth.c-2.sa-east-1.aws.neon.tech/authdb/auth` |
   | `NEON_AUTH_SERVICE_EMAIL` | `svc-educa@educaerp.com` |
   | `NEON_AUTH_SERVICE_PASSWORD` | do arquivo do passo 2 |
   | `APP_URL` | `https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app` |
   | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `desativado`, e **só para esta branch**, para neutralizar as de Preview gerais |

4. **Vercel → Settings → Deployment Protection.**
   - Mantenha a *Vercel Authentication* nos Previews. **Não mexa na proteção da Produção.**
   - Crie **Protection Bypass for Automation**. O segredo vai só para o GitHub (passo 5).
   - Depois: **Deployments → último deploy da branch → Redeploy**.
5. **GitHub → Settings → Environments → `homolog` → secrets:**
   - `NEON_AUTH_SERVICE_EMAIL` e `NEON_AUTH_SERVICE_PASSWORD` (passo 2);
   - `VERCEL_BYPASS_TOKEN` (passo 4);
   - `HOMOLOG_OWNER_PASSWORD`, `HOMOLOG_ADMIN_PASSWORD` e `HOMOLOG_USER_PASSWORD`: você mesmo gera as três (ex.: gerenciador de senhas, 16+ caracteres com maiúscula, minúscula, número e símbolo). São as senhas com que você vai entrar.
   - `LEGACY_OWNER_EMAIL`: o e-mail do Owner que hoje existe na homologação. Fica em segredo porque o repositório é público; só é usado na 1ª execução.
6. **Neon Console → branch `homolog` → Auth → Settings:** desligue *Allow sign-ups* e *Allow localhost*. Hoje os dois estão ligados, e o MCP não altera esses dois campos.
7. **Avise.** O bootstrap, o seed e o smoke rodam no runner com um push que altera `scripts/homolog/RUN`. O relatório sai como artefato `educa-homolog-relatorio`.

Já feito por esta sessão, só na homologação: a origem confiável `https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app` foi adicionada ao Neon Auth da branch `homolog`.

**Landing.** Crie um projeto separado na Vercel a partir desta branch:

- raiz do repositório;
- build `npm run landing:build`;
- saída `landing/site`;
- variável de build `LANDING_APP_URL=https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app/login`.

A landing não usa banco nem segredo.

## 7. Problemas encontrados (não corrigidos, para decisão)

| # | Classe | Problema | Evidência | Proposta |
|---|---|---|---|---|
| 1 | BUG (banco, afeta a produção) | **Reservar estoque do pedido** falha com 500 genérico. Em `fn_reserve_sales_order_stock` (0021), `select public.fn_create_reservation(...) into v_reservation` atribui a linha inteira ao 1º campo (uuid) do rowtype | mesmo md5 da função na cópia de produção e local; erro `invalid input syntax for type uuid` | migration nova: `select * into v_reservation from public.fn_create_reservation(...)` |
| 2 | BUG (autenticação, UI) | **Sair com o mouse** em Conta → Sair não envia o logout: a sessão continua. Pelo teclado (Enter) funciona | smoke: 3/3 usuários; nenhuma requisição `/api/auth/logout` no clique | o formulário está dentro do conteúdo do menu Radix, desmontado antes do submit. Enviar no `onSelect` (`preventDefault` + `form.requestSubmit()`) ou mover o `<form>` para fora do portal |
| 3 | BUG (autenticação, só `AUTH_PROVIDER=neon`) | 1º convite de plataforma para uma conta que **já existe** no Neon devolve 503. `inviteWithNeon` descarta o `authUserId` quando a conta já está confirmada; a 2ª tentativa passa | bootstrap local, reproduzido | devolver `authUserId` também no ramo `existing_account` |
| 4 | DÉBITO (script) | O `bootstrap-homolog.mjs` da POC contava com `admin/set-user-password` para contas criadas sem senha. O Better Auth só **atualiza** a credencial que já existe; não a cria | código do Better Auth 1.4 (`updatePassword`) | substituído por `scripts/homolog/bootstrap.mjs`, que usa impersonação |
| 5 | CONFIGURAÇÃO | Neon Auth de homologação com *Allow sign-ups* e *Allow localhost* ligados. O app não expõe cadastro (o smoke confirma), mas a API do Neon aceitaria | sonda de 27/09 e config atual | passo 6 |
| 6 | DADO DE TESTE / RBAC | O papel **Operador** não tem nenhuma aprovação e não move oportunidade no funil; na prática, só opera rascunhos | comparação Administrador × Operador: 97 permissões a menos | decidir se o Operador deve aprovar; a homologação usa o papel operacional novo |
| 7 | PROBLEMA DE UX | O Vendedor, com só `stock.view`, vê no menu Transferências, Inventário, Almoxarifado e Devoluções. As telas abrem para consulta, sem ação | menu do smoke | exigir a permissão de ação para os itens de operação |
| 8 | AMBIENTE | A réplica local usada nos testes desta sessão tem menos permissões de sistema que a cópia de produção (ex.: Operador sem `leads.view`) | contagem de `role_permissions` | nenhuma: o Preview usa a cópia de produção |

Débitos já registrados pela POC, confirmados no mesmo esquema:

- lead → oportunidade (`convert-to-opportunity`) falha por auditoria fora do CHECK;
- iniciar instância de workflow falha;
- a API de produtos não expõe `production_type` nem `unit_id`.

## 8. Rodar localmente (sem rede externa)

Com PostgreSQL local (porta 55440), o dublê do Neon Auth (`poc/neon-auth/neon-double.mjs`) e o app em `next start -p 3200`, apontados por `.env.local`. Esquema e roteiro estão em `poc/neon-full/README.md`, trocando `seed-company.sql` por `supabase/seed.sql` no plano:

```
APP=http://localhost:3200 NEON_AUTH_BASE_URL=http://localhost:3401/neondb/auth \
LEGACY_OWNER_EMAIL=<owner local> node scripts/homolog/bootstrap.mjs
node scripts/homolog/seed.mjs
SMOKE_OUT=smoke.md node scripts/homolog/smoke.mjs
```

Resultado local desta branch: `evidencias/smoke-local.md` (**78/81**) e `evidencias/seed-local.txt` (**51/52**).
