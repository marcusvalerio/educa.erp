# Design System e Tema — Fase 19

**Aviso — escopo real desta etapa (leia antes do resto):** a Fase 19, como especificada, pede um redesenho visual completo de TODO o ERP (sidebar, topbar, todos os dashboards por contexto, padrão de tabela, padrão de formulário, badges, refatoração de todas as telas existentes). Isso é, na prática, um projeto de frontend de várias semanas. O que esta rodada entrega de fato — e só isso é reportado como concluído — é a **infraestrutura real** do Design System (tokens, tema, primitivos já existentes reaproveitados) e **um exemplo completo e funcional, ponta a ponta, de tela com dados reais** (o Dashboard executivo). A refatoração de cada uma das ~44 telas restantes para consumir API real em vez do mock (`src/lib/pages/*.ts` + `src/lib/mock/generators.ts`) **não foi feita** nesta rodada — é uma pendência genuína, listada no relatório final, não escondida.

## 0. O que já existia (inspecionado antes de codificar, nunca duplicado)

Um design system "ASTRA.ERP" já existia desde uma fase muito anterior (tokens em `src/app/globals.css`, `Sidebar`/`Topbar` em `src/components/layout/`, `DataTable`/`Card`/`StatCard`/`FilterBar`/`Pagination`/`PageHeader`/`Breadcrumb`/`StatusBadge`/`TableSkeleton`/`Drawer`/`ConfirmDialog`/`Field` em `src/components/ui/`). Esta fase **evolui** esse sistema (acrescenta tema escuro, corrige a fonte de dados do dashboard) — não o substitui por um segundo sistema, e não usa v0 nem copia nenhum projeto externo. A paleta, a tipografia (Satoshi) e a identidade visual (ASTRA.ERP) permanecem as mesmas; "EDUCA.ERP" é o nome do produto/empresa no código-fonte e documentação (ver `AGENTS.md`/instruções do projeto), a marca visual em tela continua a que já existia.

## 1. Tokens semânticos (`src/app/globals.css`)

Já existiam: `--bg`/`--surface`/`--surface-hover`/`--surface-sunken`/`--border`/`--border-strong`/`--ink`/`--ink-muted`/`--ink-subtle`/`--sidebar*`/`--brand*`/`--success`/`--warning`/`--danger`/`--info`/`--neutral` (+ variantes `-soft`), `--shadow-*`, `--animate-*`. Nenhum componente usa cor hardcoded fora destes tokens (verificado por amostragem nos componentes tocados nesta fase).

Novo nesta fase: uma paleta **escura própria**, não uma inversão automática dos tokens claros — ver seção 2.

## 2. Tema Claro/Escuro/Sistema

- **Tokens escuros** (`src/app/globals.css`): superfícies derivadas de "Authentic Black / Dark Graphic" com leve tom azulado (não cinza neutro puro), texto quase-branco (nunca branco puro), e as cores semânticas (`success`/`warning`/`danger`/`info`) redesenhadas para contraste adequado em fundo escuro — não é `filter: invert()`. A sidebar **não muda** entre os temas: ela já nasceu escura desde a fase anterior (identidade visual constante), então seus tokens não são redefinidos no modo escuro.
- **Dois mecanismos de ativação, nunca um só**: uma media query `@media (prefers-color-scheme: dark)` guardada por `:root:not([data-theme="light"])` cobre a opção "Sistema" sem nenhum JavaScript; `:root[data-theme="dark"]`/`[data-theme="light"]` cobre a escolha explícita do usuário e sempre vence a media query.
- **`src/lib/theme.ts`**: lógica pura (`resolveTheme(preference, systemPrefersDark)`), testada em `tests/theme.test.ts` — nenhuma lógica de tema vive apenas dentro de um componente React não testável.
- **`src/components/theme/ThemeProvider.tsx`**: contexto React (`useTheme()`) que lê a preferência do `localStorage` (`educa-erp-theme-preference` — preferência pessoal de exibição por navegador, não um dado de empresa; por isso não usa `system_settings`/`fn_upsert_setting`, que são escopados por company/establishment, não por usuário), aplica `data-theme` no `<html>` e escuta mudanças de `prefers-color-scheme` ao vivo quando a preferência é "Sistema".
- **Sem flash de tema**: um script síncrono em `src/app/layout.tsx` (antes da hidratação) lê o `localStorage` e já aplica `data-theme="dark"` se for o caso — sem isso, a página pintaria claro por um instante mesmo com o usuário tendo escolhido escuro.
- **Onde configurar**: `Configurações → Aparência` (`src/app/configuracoes/aparencia/page.tsx`) — página real (não mais o `ModulePage` genérico mock que existia antes), com três opções (Claro/Escuro/Sistema), aplicação imediata e indicação de qual tema está efetivamente em uso agora.

## 3. Dashboard executivo com dados reais (`src/app/gestao/dashboard/page.tsx`)

Antes desta fase, `/gestao/dashboard` era o `ModulePage` genérico renderizando `KPI_ROWS` — um array literal com números fabricados ("OTIF 94,2%", "Ticket médio R$ 4.280,00" etc., em `src/lib/pages/gestao.ts`). Isso violava diretamente a exigência da Fase 19 ("nunca dado mockado/fictício em dashboard").

O que foi feito: a tela agora é um componente dedicado que chama `fn_report_executive` (Fase 12, já existente) via `/api/reports/executive`, comparando o mês em curso com o mesmo intervalo do mês anterior — **a variação percentual de cada card é calculada de verdade** (`src/lib/format.ts#percentChange`), nunca um "+12%" inventado. Estados de carregamento (skeleton), erro (com botão "Tentar novamente") e vazio (sem dados no período) são tratados explicitamente — nenhum deles é "tela branca". O `KPI_ROWS`/entrada `dashboard` mock foi removido de `src/lib/pages/gestao.ts` (não ficou um código morto ao lado do código real).

**Limite honesto:** como em todas as fases anteriores, nenhum Supabase real foi tocado nesta rodada — o código está correto e chama a função certa, mas não há como demonstrar números reais na tela sem um banco aplicado. Os outros 7 relatórios por contexto (Comercial/Estoque/Compras/Produção/Logística/Financeiro/Fiscal, todos já existentes desde a Fase 12 em `/api/reports/*`) **não foram** ligados a uma tela nesta rodada — só o Executivo, como prova de conceito completa ponta-a-ponta. Ligá-los às telas `/comercial`, `/logistica/*` etc. segue o mesmo padrão exato deste dashboard e é o próximo passo natural, não feito por limite de tempo desta rodada.

## 4. Padrão de tabela/formulário/badge

`DataTable` (estados vazio e com dados), `TableSkeleton` (carregando), `StatusBadge` (semântico) e `Field`/`FilterBar` (formulário/filtro) já existiam e continuam sendo o padrão único — reaproveitados no Dashboard (skeleton) e na página de Aparência (nenhum primitivo novo e paralelo foi criado). Um estado de **erro** explícito (ver seção 3) foi o único padrão que faltava e que esta fase adiciona, via um `Card` com variante de erro (`border-danger/30 bg-danger-soft`) — reaproveitável em qualquer tela futura, não um componente único do dashboard.

## 5. Responsividade e acessibilidade

O dashboard e a página de Aparência usam grid responsivo (`sm:grid-cols-2 lg:grid-cols-3/4`, sem nenhuma largura mínima maior que a tela em 400px) e os seletores de tema são `<button>` reais com `aria-pressed`, foco visível (`focus-visible:ring`) e contraste adequado nos dois temas — consistentes com os primitivos já existentes (`Button`, `DataTable`) que já seguiam esse padrão.

## 6. Testes

`tests/theme.test.ts` (resolução pura de tema) e `tests/format.test.ts` (formatação de moeda/percentual/inteiro e cálculo real de variação percentual) — lógica extraída para módulos puros justamente para serem testáveis sem DOM/navegador, seguindo a mesma limitação já documentada em todas as fases anteriores (este projeto não tem ambiente de renderização de componentes/DOM configurado; testes de UI aqui significam "lógica de UI extraída e testada", não "componente renderizado e clicado").

## 7. Pendências genuínas desta fase (não escondidas)

- Refatorar as ~44 telas restantes (`/comercial/*`, `/logistica/*`, `/suprimentos/*`, `/financeiro/*`, `/fiscal/*`, `/cadastros/*`, `/gestao/kpis`, `/gestao/relatorios`, `/gestao/auditoria`) para consumir API real em vez de `src/lib/mock/generators.ts` — infraestrutura (tokens, tema, `DataTable`, estados de erro) já pronta para isso, mas o trabalho de ligar cada tela ao seu endpoint real não foi feito.
- Dashboards por contexto (Comercial/Estoque/Compras/Produção/Logística/Financeiro/Fiscal) — os relatórios já existem (`/api/reports/*`), faltam as telas, seguindo exatamente o padrão do Dashboard executivo desta fase.
- Nenhuma tela nova foi criada para CRM/Ativos/Manutenção/Qualidade/Projetos/Serviços (Fases 15-18) — essas fases entregaram backend + API completos; UI fica para uma rodada futura, como já era a convenção documentada desde a Fase 13 (MASTER_DATA.md §12).
