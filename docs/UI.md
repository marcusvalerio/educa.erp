# Interface do ATLAS.ERP — Design System, shells e padrões de tela

Este documento descreve a camada de interface depois da fase de design. A
arquitetura de dados não mudou: **nenhuma migração, policy de RLS,
permissão ou função do banco foi alterada**. O banco continua sendo a
autoridade — a interface só esconde o que o perfil não pode usar e mostra
o que a API devolve. Não existe dado fabricado em nenhuma tela.

## 1. Identidade e tokens (`src/app/globals.css`)

`globals.css` é a **única fonte de verdade** visual: nenhum hexadecimal fora
dele (exceções: `themeColor` do viewport e `icon.svg`, que não aceitam
variáveis). Componentes consomem só tokens semânticos via classes do Tailwind.

### Paleta oficial (preservada) e papéis

| Papel | Cor | Uso |
| --- | --- | --- |
| Estrutura | Smoky Black `#100C08` | texto, botão primário, base do escuro, moldura da Central |
| Estrutura | Chef's Hat `#F3F4F5` | base dos fundos claros |
| Estrutura | Drifting Cloud `#DBE0E1` | bordas |
| Semântica | Merin's Fire `#FF9408` | acento: barra do item ativo, foco, atenção |
| Semântica | Sauce Piquante `#CA3F16` | problema (danger) |
| Semântica | Bacchic Burgundy `#95122C` | crítico e identidade da Administração Central |

Botão primário é Smoky Black (no escuro, Chef's Hat) — **nunca laranja**.
Laranja é o único ponto de cor da navegação (barra do item ativo).

### Camadas

| Token | Claro | Escuro | Onde |
| --- | --- | --- | --- |
| `chrome` | `#ECEEEF` | `#090705` | moldura: navegação lateral e fundo em volta da folha |
| `background` | `#F5F6F6` | `#0E0B09` | a **folha** do workspace, onde a página acontece |
| `surface` | `#FFFFFF` | `#15120F` | painéis, tabelas, formulários |
| `surface-raised` | `#FFFFFF` | `#1C1814` | overlays (diálogo, drawer, menu, popover, toast) |
| `border` / `border-subtle` / `border-strong` | | | contorno de superfície / divisória interna / controles |

### Tipografia

Arquivos locais em `src/app/fonts` (`next/font/local`, licenças OFL), sem CDN.

- **Instrument Sans** — interface e dados. Escolhida por especime comparativo
  (Instrument Sans, Schibsted, Onest, Geist, Familjen, Public Sans, Inter)
  num contexto de ERP real: compacta, com caráter, e com **dígitos tabulares
  (`tnum`) justos** — Schibsted espaça demais os números; Hanken e IBM Plex
  (build disponível) não têm `tnum`.
- **Instrument Serif** — só momentos editoriais: saudação do Início e login
  (`font-display`). Nunca em tabela, formulário ou número de KPI.
- **JetBrains Mono** — códigos (`.code`).

Escala (px): `2xs 11 · xs 12 · sm 13 · base 14 · md 16 · lg 18 · xl 22 ·
2xl 28 · 3xl 36 · 4xl 44`. Tracking: `tracking-display` (−0.025em),
`tracking-title` (−0.015em), `tracking-label` (+0.04em, rótulos em caixa alta).
Números sempre `tabular-nums`.

**Regra de caixa alta:** só marcadores de seção (sobrelinha do PageHeader,
grupos da navegação, títulos de bloco no detalhe). Cabeçalhos de tabela e
rótulos de campo são sentence case (`text-xs`, `text-muted-foreground`).

### Geometria, elevação e movimento

- Raios por função: `xs 3` indicadores · `sm 5` badges/itens de menu ·
  `md 7` controles · `lg 10` superfícies · `xl 12` overlays e a folha.
- Micro-profundidade (ver `docs/design/SUPERFICIES.md`): `shadow-xs` em
  controles; `shadow-sm` em superfícies (`.surface`); `shadow-md` em hover
  de superfície clicável; `shadow-overlay` em menu, popover, toast,
  tooltip, diálogo e drawer. A borda define a geometria; a sombra só separa
  camadas. Superfície dentro de superfície vira seção (`Surface`,
  `SurfaceSplit`) — sem card dentro de card.
- Movimento: 150ms `ease-standard` por padrão; entradas `pop-in`,
  `rise-in`, `slide-in-*`; tudo cai para ~0 com `prefers-reduced-motion`.

### Contraste (medido, não estimado)

`node scripts/check-contrast.mjs` mede 118 pares WCAG dos tokens (claro e
escuro): texto ≥ 4.5:1 sobre chrome/background/surface/surface-muted/
surface-hover e sobre o próprio `*-soft`; anel de foco ≥ 3:1. Rodar a cada
mudança de paleta (sai com erro abaixo do mínimo). Na criação desta versão
achou `subtle-foreground` a 4.31:1 sobre o chrome — corrigido para `#62666A`.

## 2. Ambientes e shells

Grupos de rota: `(auth)` (login, sem shell), `(erp)`, `admin` e
`admincentral`, cada um com `ShellFrame` próprio
(`src/components/shell/ShellFrame.tsx`).

**Composição:** a navegação vive no *chrome*; a página numa **folha**
(`#folha`) arredondada com rolagem própria no desktop e cabeçalho fixo e
translúcido no topo dela. No mobile a folha ocupa a tela e a navegação vira
gaveta.

| Ambiente | Rota | Quem | Visual |
| --- | --- | --- | --- |
| ERP | `/` e módulos | usuários da empresa | chrome claro/escuro, folha no tema |
| Administração da Empresa | `/admin` | Company Admin, só a própria empresa | faixa laranja "alterações aqui afetam somente esta empresa" no topo da folha |
| Administração Central | `/admincentral` | Platform Owner/Admin | moldura Smoky Black nos dois temas, filete bordô e selo "Plataforma ATLAS.ERP" |

- **Onde estou:** trilha no cabeçalho (Início › Módulo › Recurso ›
  Registro) + **sobrelinha automática** do módulo no PageHeader
  (`ShellSectionProvider`/`AutoEyebrow` em `Breadcrumbs.tsx`) — nenhuma
  página precisa repetir isso.
- **Sidebar:** identidade (empresa em primeiro plano, marca como
  assinatura), **busca global no topo** (Ctrl/⌘ K, só destinos
  permitidos), grupos Visão geral/Operação/Gestão/Cadastros/Sistema, item
  ativo em pastilha com relevo e barra Merin's Fire; recolhível (56px).
- **Cabeçalho:** trilha, unidade (só quando há unidade), pendências de
  aprovação, tema e conta. Sem unidade vinculada, o Início informa — o
  cabeçalho não repete.
- **Contexto da sessão**: `GET /api/session/context`, no `SessionProvider`.
  Empresa só como contexto; unidade só entre as liberadas; navegação por
  permissão (`src/lib/nav.ts`, `src/lib/navigation/access.ts`).

## 3. Componentes (`src/components/ui`)

Button, Input/Textarea, FormField/FormSection, Select, Checkbox, Switch,
Segmented, Combobox (cmdk), DatePicker/DateRangePicker, Badge/StatusBadge,
Tooltip, Popover, Dialog/ConfirmDialog, Drawer, DropdownMenu/ContextMenu,
Tabs/Accordion, Command, Toast, Alert, EmptyState, Skeleton, Progress, Kbd,
PageHeader/SectionTitle, Panel, Stat/StatStrip, Timeline. Radix via `radix-ui`.

| Componente | Regras |
| --- | --- |
| Button | `primary` (uma por área), `secondary`, `ghost`, `danger` (destrutiva confirmada), `link`; tamanhos `xs 28 · sm 32 · md 36`; relevo xs e 1px de toque |
| Campos | `fieldSurface` (aparência) + `fieldWidth(className)`: largura do chamador sem conflito (o projeto não usa tailwind-merge); halo de foco de 4px |
| Badge | `soft` (chip) chama atenção; `quiet` (ponto + texto) para rotina |
| StatusBadge | registro tipado `src/lib/status.ts`; rotina discreta, chip só para alerta/problema/crítico; `emphasis="chip"` no cabeçalho de detalhe |
| PageHeader | sobrelinha automática → título 22px → descrição (medida de leitura) → ações à direita |
| Stat/StatStrip | valor 22px; `lead` = métrica dominante (36px, ocupa duas colunas); divisória por célula, sem bloco cinza na sobra |
| EmptyState | vazio, sem resultado, sem acesso, erro com nova tentativa; `framed` (tracejado) para estado de página fora de painel |
| Drawer | flutua a 8px das bordas no desktop, tela cheia no mobile; rodapé em faixa |
| Dialog | raio 12, superfície elevada, rodapé em faixa |

## 4. Listas, formulários e detalhes

- `ResourceListPage`/`CadastroPage` + `DataTable`: visões salvas, busca,
  filtros (com o nome do filtro), ordenação, seleção e ações em lote,
  colunas configuráveis, densidade 36/44px, cabeçalho fixo em sentence
  case, ícone de ordenação só no hover ou na coluna ativa, ações da linha
  a 40% até hover/foco, exportação CSV, estados completos. No mobile a
  tabela vira lista de cartões.
- Formulários (`EntityDrawer` + `EntityForm`): seções declarativas, grade
  de 4 colunas (1 no mobile), erro junto ao campo e resumo no topo,
  indicador de alterações não salvas e confirmação de descarte.
- Detalhe (`DetailLayout`): workspace do registro — cabeçalho (voltar,
  código, título, status em chip, ações), faixa de resumo, informações,
  andamento, itens, relações (expedições, financeiro) e histórico.

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
- QA visual **real**, sem interceptação, contra a réplica local do
  Supabase (ver [ONBOARDING.md](./ONBOARDING.md) §5): 108 telas/estados,
  desktop 1440 e mobile 390, claro e escuro. Checa overflow horizontal,
  erros de console e de página e falhas de rede, e abre o menu da conta.
  Resultado: 0 problema. Correções que saíram dessa rodada:
  - `DropdownMenuItem` com `asChild` entrega um filho único ao Slot do
    Radix. Antes, o menu da conta gerava "Primitive.div failed to slot".
  - Contêineres de rolagem de tabela usam `relative`. O texto `sr-only`
    absoluto do cabeçalho escapava da rolagem e alargava a página no
    mobile (`/admin/branches`).
- Acessibilidade: foco visível, navegação por teclado (Radix), link "pular
  para o conteúdo", rótulos em controles, `aria-sort`, `prefers-reduced-motion`.

## 7.1 Redesign 2.0 — processo e QA

Processo: o mesmo do CÓRTEX.OS (repositório `fade.os`) — fundação única em
`globals.css`, contraste medido por script antes de adotar a paleta,
hierarquia editorial (uma métrica dominante, não uma grade de pesos
iguais), propagação por camadas (fundação → componentes → shell → telas) e
QA visual com capturas em claro/escuro, desktop/tablet/mobile a cada
rodada. Direção estética pela skill `frontend-design`
(`claude-plugins-official`): fugir da estética genérica — tipografia com
caráter, ponto de vista claro, contenção executada com precisão.

QA visual real (pilha local: app + PostgreSQL com o esquema de produção +
dublê do Neon Auth, contas criadas pelo fluxo oficial de convite, dados de
QA só no banco local): rodadas de captura por tela e varredura de todas as
rotas em desktop 1440 e mobile 390 procurando erro de console, erro de
página e rolagem horizontal. Correções que saíram das rodadas estão nos
commits `design(...)` da branch `claude/educa-redesign`.

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
3. **Sessão real em produção** depende do primeiro Owner
   (`scripts/bootstrap-platform-owner.mjs`), do SMTP e de `APP_URL`. As
   migrations 0071 e 0072 já estão aplicadas; ver
   [ONBOARDING.md](./ONBOARDING.md) §8. A validação ponta a ponta com
   sessão real foi feita na réplica local (E2E 102/102 e QA visual real).
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
8. ~~Vincular login a um usuário~~ — resolvido pelo convite (0071) e
   protegido pela 0072: o vínculo `auth_user_id` só acontece no aceite,
   pelo banco. Ver [ONBOARDING.md](./ONBOARDING.md).
9. **`operador` e `leitura` entram em `/admin`** porque têm `users.read`
   (e `operador`, `users.update`). Isso é o RBAC semeado, não a interface.
   Para um usuário "só ERP", use um papel personalizado. Ver ONBOARDING.md
   §6.
