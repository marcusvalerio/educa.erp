# Interface do EDUCA.ERP — Design System, shells e padrões de tela

Este documento descreve a camada de interface depois da fase de design. A
arquitetura de dados não mudou: **nenhuma migração, policy de RLS,
permissão ou função do banco foi alterada**. O banco continua sendo a
autoridade — a interface só esconde o que o perfil não pode usar e mostra
o que a API devolve. Não existe dado fabricado em nenhuma tela.

## 1. Identidade e tokens (`src/app/globals.css`)

Paleta com papéis fixos:

| Papel | Cor | Uso |
| --- | --- | --- |
| Estrutura | Smoky Black `#100C08` | texto, botão primário, sidebar escura, base do modo escuro |
| Estrutura | Chef's Hat `#F3F4F5` | fundo do modo claro |
| Estrutura | Drifting Cloud `#DBE0E1` | bordas e divisões |
| Semântica | Merin's Fire `#FF9408` | acento/destaque, atenção (warning) |
| Semântica | Sauce Piquante `#CA3F16` | problema (danger) |
| Semântica | Bacchic Burgundy `#95122C` | crítico e o acento da Administração Central |

- Componentes usam **apenas tokens** (`bg-surface`, `text-muted-foreground`,
  `border-border`, `bg-danger-soft`...). O único hex fora do CSS é o
  `themeColor` do `viewport` e o `icon.svg`, que não aceitam variáveis.
- Botão primário é Smoky Black (no escuro, Chef's Hat) — **nunca laranja**.
- Claro/Escuro/Sistema: `:root` + `@media (prefers-color-scheme: dark)`
  (guardado por `:not([data-theme="light"])`) + `[data-theme]` explícito.
  O escuro tem identidade própria (preto quente, não inversão). Os
  seletores `[data-theme]` também valem em elementos internos (prévia de
  tema em Configurações › Aparência).
- Contraste AA verificado para texto (`muted` 7,07:1; `subtle` ≥ 4,5:1).
- Densidade: grade de 4px; raios 4/6/8; sombra só em popover, menu,
  drawer e diálogo.

### Tipografia

Inter e JetBrains Mono **locais** (`src/app/fonts`, `next/font/local`,
licenças OFL junto), sem CDN. Escala 11/12/13/14/16/20/24/30; tabela 13px,
texto 14px; pesos 400/500/600. Números em valores, KPIs, tabelas e códigos
usam `tabular-nums`; códigos usam a classe `.code` (mono).

## 2. Ambientes e shells

Grupos de rota: `(auth)` (login, sem shell), `(erp)`, `admin` e
`admincentral`, cada um com `ShellFrame` próprio
(`src/components/shell/ShellFrame.tsx`).

| Ambiente | Rota | Quem | Visual |
| --- | --- | --- | --- |
| ERP | `/` e módulos | usuários da empresa | sidebar clara, topbar com unidade/busca/tema/usuário |
| Administração da Empresa | `/admin` | Company Admin, só a própria empresa | faixa de contexto "alterações aqui afetam somente esta empresa", link "Voltar ao ERP" |
| Administração Central | `/admincentral` | Platform Owner/Admin | base Smoky Black, filete Bacchic Burgundy, selo "Plataforma EDUCA" |

- **Contexto da sessão**: `GET /api/session/context` (`fn_user_context` +
  `fn_dashboard_context` + `current_platform_role`), no
  `SessionProvider`. Topbar mostra o usuário real (nome, iniciais, cargo,
  setor, papéis) — nenhum usuário de exemplo.
- **Empresa** aparece só como contexto (sem seletor). **Unidade**: rótulo
  quando há uma; seletor apenas entre as unidades liberadas ao usuário —
  a escolha nunca amplia acesso.
- **Navegação por permissão** (`src/lib/nav.ts`,
  `src/lib/navigation/access.ts`): cada item declara a permissão exata da
  API; seções sem item permitido somem; a rota é protegida pela mesma
  regra ("Sem acesso a este recurso"). Item ativo é calculado **por
  segmento** (`/admin` não fica ativo em `/admincentral`).
- Busca/atalhos: `Ctrl/⌘ + K` (só destinos permitidos).
- Mobile: sidebar vira drawer; filtros viram painel; tabelas viram cartões.

## 3. Componentes (`src/components/ui`)

Button, Input/Textarea, FormField/FormSection, Select, Checkbox, Switch,
Segmented, Combobox (cmdk), DatePicker/DateRangePicker (react-day-picker),
Badge/StatusBadge, Tooltip, Popover, Dialog/ConfirmDialog, Drawer,
DropdownMenu/ContextMenu, Tabs/Accordion, Command, Toast, Alert,
EmptyState (vazio, sem resultado, sem permissão, erro com nova tentativa),
Skeleton, Progress, Kbd, PageHeader/SectionTitle, Panel, Stat/StatStrip,
Timeline. Radix via o pacote `radix-ui`.

**StatusBadge** usa o registro tipado `src/lib/status.ts` (código do banco
→ rótulo + tom + ícone por entidade); nunca procura palavras no texto.

## 4. Listas, formulários e detalhes

- `ResourceListPage` + `DataTable`: busca, filtros e visões de trabalho
  na URL (drill-down chega filtrado), ordenação, seleção e ações em lote,
  colunas configuráveis, densidade 32/40px, cabeçalho fixo, exportação
  CSV, estados de carregando/vazio/sem resultado/erro. Quando a API pagina
  (`meta` na resposta, rotas de cadastro e auditoria) a paginação é no
  servidor; caso contrário, local.
- Cadastros (`CadastroPage` + `EntityDrawer`): validação por campo, resumo
  de erros, alterações não salvas com confirmação de descarte, ações
  conforme permissão.
- Detalhe (`DetailLayout`): cabeçalho com código/status/ações, resumo,
  informações, itens, relações, financeiro, histórico de auditoria. Pedido
  de venda (`/comercial/pedidos-venda/[id]`) com ações que dependem do
  status e da permissão; a transição continua sendo validada pelo banco.

## 5. Painéis

Leitura em sete passos: CONTEXTO → RESUMO → MUDANÇAS → PROBLEMAS →
OPERAÇÕES → INVESTIGAÇÃO → AÇÃO.

- `/` — centro operacional do usuário; `/gestao/dashboard/*` — 13 painéis
  (executivo, comercial, compras, estoque, logística, produção,
  financeiro, fiscal, controladoria, qualidade, manutenção, operações, TI).
- Período na URL (`?periodo=`) e comparação sempre com o intervalo
  anterior de mesma duração (`src/lib/dashboard/periods.ts`).
- Problemas (`src/lib/dashboard/problems.ts`): 18 detectores sobre as
  coleções reais, só os que o perfil pode ler, ordenados por gravidade e
  pelo foco do contexto (setor/cargo/papel).
- Fluxos do ERP em Sankey (`flows.ts`): pedido → entrega, compra →
  recebimento, produção → resultado; conservam volume e cada etapa abre a
  lista filtrada.
- Gráficos (Recharts): neutros primeiro e um tom semântico; barras ≤ 24px,
  linhas 2px, área 10%, alternância gráfico/tabela, tooltip, rótulo
  acessível. Sem dados, o painel diz isso.
- Módulos (`/comercial`, `/financeiro`...) são áreas de trabalho: resumo
  do período, pendências do módulo, registros recentes e rotinas.

## 6. Administração

**Empresa (`/admin`)** — visão geral com pendências de configuração;
usuários (contexto organizacional, papéis e unidades; cadastro básico em
`/admin/users/cadastro`); papéis com matriz módulo → recurso → ação
(`fn_set_role_permissions`); setores em árvore; cargos; unidades; módulos
contratados (liga/desliga, essenciais travados); foco dos painéis;
auditoria. Tudo pela sessão — sem parâmetro de empresa.

**Plataforma (`/admincentral`)** — visão geral, empresas (ciclo de vida e
contratação de módulos), catálogo de módulos, membros Owner/Admin,
permissões por papel, políticas e auditoria da plataforma. **Não há
impersonation, "entrar como empresa" nem leitura de dados operacionais
de empresas.**

## 7. Qualidade

- Testes (`npm test`): navegação/acesso (inclui "toda rota do menu tem
  página"), listas, registro de status, painéis (períodos, problemas,
  fluxos, métricas, drill-down para telas existentes) e lookup de nomes.
- QA visual com Playwright sobre o build de produção, com respostas de
  API interceptadas (fixtures só no ambiente de QA, nunca no app):
  claro/escuro, desktop/mobile, `/admin`, `/admincentral`, perfil limitado
  e sem acesso.
- Acessibilidade: foco visível, navegação por teclado (Radix), link "pular
  para o conteúdo", rótulos em controles, `aria-sort`, `prefers-reduced-motion`.

## 8. Limites registrados (não alterados nesta fase)

1. **`companies.read` não existe no catálogo de permissões.**
   `/api/companies/me` exige essa permissão e por isso responde 403 para
   todos; "Dados da empresa" fica oculto na navegação. Correção sugerida:
   incluir `companies.read`/`companies.update` no catálogo e no papel
   administrador (migração nova).
2. **A plataforma não lê o nome das empresas** (policy
   `companies_select_member`). `/admincentral` identifica empresas pelo id
   e pelo perfil SaaS. Correção sugerida: uma view/função de plataforma
   que exponha só nome e documento, sem dados operacionais.
3. **Não há sessão real para validar ponta a ponta** até o primeiro Owner
   ser criado (`scripts/bootstrap-platform-owner.mjs`) e a migration 0071
   ser aplicada — ver [ONBOARDING.md](./ONBOARDING.md). O QA visual usou
   respostas interceptadas.
4. **Coleções de domínio vêm inteiras** (pedidos, títulos, OPs...). Listas
   paginam localmente e os detectores/painéis leem a coleção completa.
   Com volume, recomenda-se paginação no servidor nessas rotas e um
   endpoint de contadores para os painéis.
5. **O registro da empresa no seed chama-se "ASTRA.ERP"** (`supabase/seed.sql`,
   `scripts/generate-seed.mjs`). É dado da empresa, exibido como contexto;
   renomear é uma alteração de dados, não de interface.
6. **Catálogo de módulos da plataforma é só leitura**: existe a permissão
   `platform.modules.manage`, mas não há função/rota de escrita.
7. **Recursos da matriz de permissões usam o código do catálogo** (ex.:
   "Purchase orders"); um rótulo por recurso no catálogo melhoraria a leitura.
8. ~~Vincular login a um usuário~~ — resolvido pelo convite (0071): o
   vínculo `auth_user_id` só acontece no aceite, pelo banco. Ver
   [ONBOARDING.md](./ONBOARDING.md).
