# Homologação do ATLAS.ERP — branch `claude/educa-homolog`

Ambiente para avaliar o ATLAS.ERP completo (ERP redesenhado, manuais e landing) antes
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
- **Landing:** a variável de build `LANDING_APP_URL` aponta "Entrar no ATLAS.ERP" para o app de homologação. Sem ela, o link vai para a produção. O conteúdo da landing não mudou.

## 2. Arquitetura

```
Landing (projeto estático na Vercel, público)
  └─ "Entrar no ATLAS.ERP" → https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app/login
ERP (Preview desta branch no projeto meji-projects/educa.erp, região gru1)
  ├─ Neon Auth da branch "homolog" (ep-royal-flower-b6tz0xde…/authdb/auth)
  └─ Neon PostgreSQL, projeto educa-erp-prod, branch "homolog", banco "educa", papel educa_app
```

- A branch Neon `homolog` é uma cópia do banco de produção. Os dados dela já eram fictícios: é o seed da Fase 4, com a empresa ASTRA, 20 clientes, 15 fornecedores e 30 produtos. Transações não havia nenhuma.
- A produção continua como está: Supabase `educa.erp` e `educaerp.vercel.app`, com `AUTH_PROVIDER=supabase`. Nada foi alterado lá.

## 3. Trava da Vercel (por que o Preview pode aparecer "Canceled")

A Vercel também aplica a este Preview as **variáveis de Preview gerais** do projeto. Hoje o único projeto Supabase do ATLAS.ERP é o de produção, então elas provavelmente apontam para ele. O `vercel.json` desta branch:

- **Ignored Build Step:** `node scripts/homolog/vercel-guard.mjs ignore` **pula o deploy** da branch `claude/educa-homolog` enquanto o ambiente não estiver seguro;
- **Build:** `node scripts/homolog/vercel-guard.mjs build && next build` recusa o build nas mesmas condições.

Para liberar a branch, todas estas condições precisam valer:

- `APP_ENV=homologacao`, `DATA_BACKEND=postgres` e `AUTH_PROVIDER=neon`;
- `DATABASE_URL` e `NEON_AUTH_BASE_URL` apontam para o endpoint `ep-royal-flower-b6tz0xde` (branch `homolog`);
- conta de serviço presente;
- nenhuma variável `SUPABASE_*` ativa. Cada uma deve ficar ausente ou sobrescrita com `desativado` só para esta branch.

A trava imprime apenas nomes de variáveis. Outras branches não são afetadas. Na `main` a trava de homologação não faz nada: o `ignoreCommand` responde "build normal". Ela foi mantida no merge para continuar protegendo os Previews da branch de homologação. Em Production vale a trava da seção 10.

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
| Logística | separação (pick list) do pedido reservado, iniciada, itens separados e concluída; expedição com transportadora e volume, liberada, embalada e aprovada. **Expedir** e **confirmar entrega** falham pelo BUG 9 da seção 7 |

A reserva de estoque passou a funcionar com a migration `0074`.

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
7. **Migration `0074` na branch Neon `homolog`** (nunca na `main`/produção). Ela recria o CHECK de `audit_logs.action` (DDL), e por isso não foi aplicada sem a sua autorização. Duas formas:
   - você autoriza e eu aplico pelo MCP do Neon;
   - você cola o conteúdo de `supabase/migrations/0074_fix_reserve_sales_order_stock.sql` no SQL Editor, branch `homolog`, banco `educa`.

   Antes, conferi só com leitura que a branch tem a mesma função com o bug (md5 `f95c1e61…`), um único CHECK de ação e só as ações `CREATE` e `ASSIGN` em uso: a recriação valida sem erro.
8. **Avise.** O bootstrap, o seed e o smoke rodam no runner com um push que altera `scripts/homolog/RUN`. O relatório sai como artefato `educa-homolog-relatorio`.

Já feito por esta sessão, só na homologação: a origem confiável `https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app` foi adicionada ao Neon Auth da branch `homolog`.

**Landing.** Crie um projeto separado na Vercel a partir desta branch:

- raiz do repositório;
- build `npm run landing:build`;
- saída `landing/site`;
- variável de build `LANDING_APP_URL=https://educaerp-git-claude-educa-homolog-meji-projects.vercel.app/login`.

A landing não usa banco nem segredo.

## 7. Problemas encontrados e situação

| # | Classe | Problema | Situação |
|---|---|---|---|
| 1 | BUG (banco, afeta a produção) | **Reservar estoque do pedido** falhava com 500 genérico | **CORRIGIDO** na rodada de correções (migration `0074`, seção 9) |
| 2 | BUG (autenticação, UI) | **Sair com o mouse** em Conta → Sair não encerrava a sessão | **CORRIGIDO** (seção 9) |
| 3 | BUG (autenticação, só `AUTH_PROVIDER=neon`) | 1º convite de plataforma para conta já existente e confirmada devolvia 503 | **CORRIGIDO** (seção 9); o bootstrap não repete mais o convite |
| 4 | DÉBITO (script) | O bootstrap da POC contava com `admin/set-user-password` para contas sem senha, e o Better Auth só **atualiza** a credencial que existe | resolvido na 1ª rodada: `scripts/homolog/bootstrap.mjs` usa impersonação |
| 5 | CONFIGURAÇÃO | Neon Auth de homologação com *Allow sign-ups* e *Allow localhost* ligados | pendente (passo 6) |
| 6 | DADO DE TESTE / RBAC | O papel **Operador** não tem nenhuma aprovação e não move oportunidade no funil | para decisão; a homologação usa o papel operacional novo |
| 7 | PROBLEMA DE UX | O Vendedor, com só `stock.view`, vê itens de operação de Estoque | para decisão |
| 8 | AMBIENTE | A réplica local tem menos permissões de sistema que a cópia de produção | sem ação |
| 9 | **BUG novo (banco, afeta a produção) — BLOQUEIO** | **Expedir** (`POST /api/shipments/:id/ship`) falha com 500. A API grava `serial_numbers` como JSON `null` (escalar, não SQL NULL), via `serial_numbers: item.serialNumbers ?? null` e `v_item->'serial_numbers'` em `fn_create_shipment`, e `fn_ship_shipment` chama `jsonb_array_length` nele: `cannot get array length of a scalar` | **não corrigido nesta rodada** (fora da lista). Só apareceu agora porque a reserva nunca funcionou, e sem reserva não há separação nem expedição. Mesmo md5 das duas funções na cópia de produção. Proposta: migration nova tratando `jsonb_typeof(serial_numbers) = 'array'` em `fn_ship_shipment`, e a API sem gravar `null` |
| 10 | BUG novo (banco) | `'INSERT'` fora do vocabulário de `audit_logs.action` em 0055 (conversões do CRM) e 0057 (custo de ordem de manutenção). É a causa do débito "lead → oportunidade" | não corrigido (fora da lista); proposta: trocar por `'CREATE'` numa migration nova |

Débitos já registrados pela POC, confirmados no mesmo esquema:

- lead → oportunidade (`convert-to-opportunity`) falha por auditoria fora do CHECK (item 10);
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

Resultado local desta branch, na rodada de correções: `evidencias/smoke-local.md` (**90/90**) e `evidencias/seed-local.txt` (**63/65**; as 2 falhas são o BUG 9). Na 1ª rodada tinham sido 78/81 e 51/52.

## 9. Rodada de correções (bugs 1, 2 e 3)

Só na `claude/educa-homolog`. Nada na `main`, na produção ou no Supabase de produção; nenhum cutover.

### 9.1 Reserva de estoque (BUG 1) — migration `0074_fix_reserve_sales_order_stock.sql`

- **Causa 1:**
  - `fn_create_reservation` (0011) devolve a linha `public.stock_reservations`, um tipo composto.
  - A `fn_reserve_sales_order_stock` (0021) gravava esse retorno com `select public.fn_create_reservation(...) into v_reservation`.
  - Com `v_reservation` do tipo linha, o PL/pgSQL põe a única coluna do `select` (o valor composto inteiro) no 1º campo (`id uuid`), e a transação aborta: `invalid input syntax for type uuid`.
- **Causa 2, escondida atrás da 1ª:** a auditoria da reserva usa a ação `'RESERVE'`, que nunca entrou no CHECK de `audit_logs.action`.
- **Correção:**
  - `'RESERVE'` entra no vocabulário, com o mesmo padrão aditivo da 0017/0064;
  - a função passa a fazer `v_reservation := public.fn_create_reservation(...)`. O resto é idêntico à 0021, e os grants ficam preservados.
- **Não mexido:** migrations antigas; nenhuma linha de dado.
- **Varredura:**
  - nenhuma outra função usa `select f() into` com retorno composto;
  - `'INSERT'` também está fora do vocabulário (0055 e 0057); registrado como BUG 10.
- **Teste de banco:** `tests/sales-order-reservation-db.test.ts`, com `POC_DATABASE_OWNER_URL` de um banco descartável, tudo numa transação desfeita. Cobre, 7/7:
  - pedido aprovado → reserva ativa, estoque reservado e pedido `reserved`;
  - reserva parcial e 2ª chamada sem reservar de novo;
  - pedido já reservado recusado;
  - separação a partir da reserva;
  - liberação;
  - contas a receber;
  - RBAC (sem `sales_orders.reserve` → recusado, nada reservado).

  Sem a correção, 0/7, com o erro da homologação.

### 9.2 Logout com o mouse (BUG 2)

- **Causa:**
  - o `<form>` de saída ficava **dentro** do conteúdo do menu Radix;
  - no clique do mouse, o Radix fecha o menu durante o evento, e o conteúdo, com o formulário, é desmontado antes da ação padrão do clique;
  - o navegador descarta o envio. Pelo teclado passava por outro caminho.
- **Correção:**
  - `useLogout()` (`src/components/auth/LogoutButton.tsx`) renderiza o `<form>` **fora** do conteúdo do menu;
  - o item "Sair" chama `logout` no `onSelect`, o mesmo evento para mouse, toque e teclado;
  - o envio é síncrono, por `requestSubmit()`, via `src/lib/session/submit-form.ts`, sem temporizador;
  - `LogoutForm` e `LogoutButton`, usados fora de menus, não mudaram.
- **Testes:**
  - `tests/submit-form.test.ts`;
  - smoke com os 3 usuários: mouse **e** teclado, cada um verificando volta ao `/login`, API 401 e rota protegida → `/login`.

### 9.3 1º convite Neon devolvia 503 (BUG 3)

- **Causa:**
  - `inviteWithNeon` descartava o `authUserId` quando a conta já existia e estava confirmada (`existing_account`);
  - no 1º convite ainda não havia login-sombra achado antes, e a rota respondia 503;
  - a 2ª tentativa passava porque a 1ª já tinha criado o login-sombra.
- **Correção:**
  - `Delivery` carrega `authUserId` também quando não há e-mail;
  - `deliveryFromProvision` (`src/lib/auth/neon/flows.ts`) mapeia sem perder o login;
  - a rota decide por `resolveInvitedLogin` (`src/lib/onboarding/invitations.ts`).
- **O retry do bootstrap foi removido.** O bootstrap num ambiente do zero passa no 1º convite.
- **Testes:** `tests/neon-invite.test.ts`, com dublê com estado, cobre:
  - identidade inexistente;
  - existente sem senha;
  - existente e confirmada (o caso do bug);
  - convite repetido: mesmo login, sem identidade nem login duplicados, sem religar;
  - as regras de `resolveInvitedLogin`.

### 9.4 Resultados (comparação)

| Verificação | 1ª rodada | Rodada de correções |
|---|---|---|
| Testes (com Postgres) | 728/728 | **746/746** (+18 novos) |
| Testes (sem banco) | 725/725 | **736/736** |
| Typecheck / lint / build | OK / 0 erros / OK | OK / 0 erros (2 avisos da POC) / OK |
| Migrations no banco do zero | 91/91 | **92/92** (com a 0074) |
| Bootstrap | precisava repetir o convite | **1º convite passa**; idempotente |
| Seed | 51/52 (reserva) | **63/65**: reserva e separação OK. Falham só *expedir* e *confirmar entrega* (BUG 9, novo) |
| Smoke 3 perfis | 78/81 (logout com mouse) | **90/90** |
| E2E histórico da POC (`poc/neon-full/e2e/run-all.sh`: autenticação, RLS, 2 empresas, 8 módulos) | 210/210 | **210/210** (sem regressão) |

## 10. Produção (merge na `main`)

- **Backend:** a produção continua no **Supabase** (`AUTH_PROVIDER=supabase`, `DATA_BACKEND` ausente). O código aceita o modo Neon, mas o Neon `main` ainda **não tem os dados**: na verificação feita antes do merge, 1 empresa, 0 usuários, 0 clientes e 0 produtos.
- **Trava de produção** (`scripts/homolog/vercel-guard.mjs`, etapa de build):
  - em `VERCEL_ENV=production`, se `DATA_BACKEND=postgres` ou `AUTH_PROVIDER=neon` aparecerem, o build falha;
  - a Vercel mantém no ar o deploy atual, porque build com erro não é promovido;
  - só passa com `EDUCA_CUTOVER_NEON_CONFIRMADO=sim` em Production, para um cutover planejado, depois da carga de dados no Neon.
- **Região:** `vercel.json` com `regions: ["gru1"]`. As funções saem de Washington (iad1) para São Paulo, a mesma região do Supabase de produção (sa-east-1).
- **Migration `0074`** (reserva de estoque): está no repositório e validada localmente, mas **não foi aplicada** em nenhum banco de produção (Supabase ou Neon `main`). O repositório não tem etapa automática de migration:
  - o build é só `next build`;
  - nenhum workflow aplica migrations;
  - o Supabase de produção não tem integração de branches e registrou as migrations com versões próprias (aplicação manual).

  Até alguém aplicar a `0074` em produção, "Reservar pedido" continua falhando lá.
- **BUG 9 (Expedir)** e **BUG 10** (`'INSERT'` na auditoria) continuam abertos: seção 7.
