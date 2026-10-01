# Linguagem de superfícies — auditoria e proposta

Refinamento visual do ATLAS.ERP: superfícies encaixadas, bordas sutis e
micro‑profundidade. **Não muda a identidade** (Núcleo, laranja Merin's
Fire, Instrument Serif nos momentos editoriais, Instrument Sans na
interface, temas claro/escuro) nem regra de negócio, API, banco, RBAC ou
fluxos — é UI e design system.

## 1. Auditoria (estado em 3e78a08)

### O que já está bom
- **Tokens centralizados** em `src/app/globals.css`: camadas
  `chrome → background → surface → surface-raised`, três bordas
  (`border`, `border-subtle`, `border-strong`), cinco raios por função
  (`xs 3 · sm 5 · md 7 · lg 10 · xl 12`), três elevações
  (`xs`, `popover`, `dialog`). Nenhum hexadecimal fora do arquivo.
- **Sombra já disciplinada**: só tokens; única exceção é
  `EnvironmentBadge` (`shadow-sm` padrão do Tailwind, fora da escala).
- **Componente base único de superfície**: `Panel` (22 telas importam),
  `StatStrip` (faixa de métricas com divisórias — já é um encaixe),
  `ResourceListPage` (50 telas: abas de visão + barra + tabela + paginação
  **numa só superfície**), `DataTable`, `Dialog`, `Drawer`, `Menu`,
  `Popover`, `Tabs`, `Badge`, `Button`, `Input`/`Select`.

### O que impede a sensação de produto premium
| Problema | Onde | Efeito |
| --- | --- | --- |
| Superfície sem profundidade: borda sobre uma folha quase do mesmo tom, sombra zero | `Panel`, `StatStrip`, superfícies ad hoc | telas "chapadas", blocos parecem colados no fundo |
| Uma caixa por bloco, sem forma de compor | Início (5 blocos + 2 gráficos soltos), detalhe do pedido (6 caixas), áreas | composição fragmentada; "card ao lado de card" |
| 18 superfícies desenhadas à mão (`rounded-lg border bg-surface`) fora do `Panel` | `ModuleWorkspace`, `ResourceListPage` (detalhe), `admin/*`, `gestao/relatorios`, `ShellFrame` | a mesma linguagem escrita de formas diferentes |
| Ações utilitárias da barra (densidade, colunas, exportar) como ícones soltos | `ResourceListPage` | grupo sem unidade visual |
| Duas sombras de overlay diferentes (`popover` 10/28, `dialog` 28/60) | `Menu`, `Popover`, `Toast`, `Tooltip`, `Dialog`, `Drawer`, `CommandMenu` | a do diálogo é longa e "de template" |
| Cabeçalho da tabela no mesmo peso das linhas | `DataTable` | hierarquia fraca entre rótulo e dado |
| Item ativo da navegação definido só por fundo + sombra | `Sidebar` | pouco definido no tema claro |

### Duplicações encontradas
- Superfície: `Panel` × `StatStrip` × 18 caixas ad hoc → **uma** classe
  `.surface`.
- Sombra de overlay: `shadow-popover` × `shadow-dialog` → **uma**
  `shadow-overlay`.
- Seção de detalhe (rótulo + grade de campos): `ResourceListPage` (drawer)
  e `DetailLayout` repetem a mesma marcação.

## 2. Nova linguagem

### Hierarquia
```
CHROME      moldura (navegação)                         sem borda
 └ BACKGROUND  a folha do workspace                      borda + shadow-xs (já)
    └ SURFACE     painel, tabela, faixa de métricas      borda + shadow-sm
       └ SECTION   parte de uma superfície composta      só divisória (border-subtle)
    └ OVERLAY     menu, popover, toast, diálogo, drawer  borda + shadow-overlay
```
Cada degrau muda pouco: tom (folha `#F5F6F6` → superfície `#FFF`),
borda de 1px e uma sombra curta. No escuro a profundidade vem de um
realce interno de 1px no topo (luz), não de sombra preta.

### Sombras (tokens — nenhum valor fora de `globals.css`)
| Token | Uso | Claro |
| --- | --- | --- |
| `shadow-xs` | controles (botão secundário, campo, item ativo) | mantido |
| `shadow-sm` | superfícies em repouso | `0 1px 2px` a 4–5% |
| `shadow-md` | superfície clicável em hover, elemento fixo sobre conteúdo | `0 4px 12px -6px` a 10% |
| `shadow-overlay` | menu, popover, toast, tooltip, diálogo, drawer | anel 1px + `0 12px 32px -12px` a 20% |
Sombra **nunca** substitui borda: a borda define a geometria, a sombra só
separa camadas.

### Bordas
`border` contorna superfícies e controles em repouso; `border-subtle`
divide seções **dentro** de uma superfície; `border-strong` só em hover de
controle. Uma espessura (1px), sem bordas coloridas exceto estado.

### Raios (família única, sem mudança de valores)
`sm 5` badge/chip/item de menu · `md 7` botão/campo/select/abas
segmentadas · `lg 10` superfície · `xl 12` overlay e a folha. Seções
internas não têm raio próprio (herdam o da superfície).

### Encaixe (o ponto central)
- `.surface` é a única caixa. **Uma superfície dentro de outra perde a
  própria caixa** (borda, raio, sombra, fundo) por CSS — `Panel` dentro de
  `Surface` vira seção automaticamente, em qualquer tela.
- `Surface` + `SurfaceSplit` compõem várias seções numa peça só, com
  divisórias de 1px (grade com `gap-px`):
```
┌─────────────────────────────────────────────┐
│ Resumo                        Painel exec → │
├──────────────┬────────┬────────┬────────────┤
│ Receita      │ Margem │ Caixa  │ Pedidos    │
├──────────────┴────────┴──┬─────┴────────────┤
│ Precisa de atenção       │ O que mudou      │
│                          ├──────────────────┤
│                          │ Seu foco         │
└──────────────────────────┴──────────────────┘
```

### Barra de ferramentas
Hierarquia `PRIMÁRIA` (no cabeçalho da página) → `SECUNDÁRIA` →
`FILTROS` (busca + filtros, à esquerda) → `UTILITÁRIOS` (densidade,
colunas, exportar) agrupados num `ButtonGroup` de borda única.

### Movimento
Mantém a escala atual (150 ms padrão; 160–280 ms para entradas). Hover de
superfície clicável troca fundo/sombra em 150 ms; tudo cai a ~0 com
`prefers-reduced-motion`.

## 3. Componentes base alterados
1. `globals.css` — tokens `shadow-sm/md/overlay` (claro, escuro ×2),
   `.surface`, encaixe aninhado e `.surface-split`.
2. `ui/Panel.tsx` — `Panel` usa `.surface`; novos `Surface` e
   `SurfaceSplit`.
3. `ui/Stat.tsx` — `StatStrip` usa `.surface` (encaixa sozinho).
4. Overlays (`Dialog`, `Drawer`, `Menu`, `Popover`, `Tooltip`, `Toast`,
   `CommandMenu`, gráficos) — `shadow-overlay`.
5. `ui/Button.tsx` — `ButtonGroup`.
6. `data-table/DataTable.tsx` e `resource/ResourceListPage.tsx` —
   cabeçalho da tabela e grupo de utilitários.
7. `shell/Sidebar.tsx` — item ativo com contorno de 1px.

Primeira tela: **Início** (`OperationalCenter`). Depois de validada, a
mesma linguagem se propaga pelas superfícies ad hoc e pelos detalhes
(pedido, cliente, estoque, financeiro, fiscal, logística, administração).
