# Landing EDUCA — direção (fase 3)

## Conceito

**"Uma venda não termina na venda."** O EDUCA existe para que uma operação registrada em uma área chegue às outras sem retrabalho: o pedido aprovado reserva estoque, gera o título a receber, entra no fluxo da logística e aparece nos painéis de gestão. A página vende essa ideia mostrando o produto real, não com slogans.

## Narrativa

1. **Abertura** — tese e o produto funcionando (composição de telas reais + trilha da operação).
2. **O cenário** — cada área cuida de um registro diferente da mesma operação.
3. **O EDUCA** — uma base, três ambientes, números reais do produto.
4. **Siga um pedido** — rolagem guiada: Venda → Estoque → Financeiro → Fiscal → Logística → Gestão, cada passo com a tela real e o estado honesto (na tela / na API).
5. **Mapa das áreas** — índice com o estado de cada módulo.
6. **Áreas, uma a uma** — cada módulo responde às cinco perguntas: para que serve, o que você faz, como funciona, o que você controla, como se conecta. Visualizador de telas reais com abas.
7. **Base e em evolução** — Cadastros; Produção, Workflow e Importação apresentados como o que são hoje.
8. **Quem acessa o quê** — a cadeia Usuário → Papel → Permissões → Módulos, com o exemplo real do papel Comprador; convite de ponta a ponta.
9. **Administração Central** — empresas, módulos contratados, isolamento.
10. **A operação integrada** — o mapa de conexões entre áreas, com o tipo de cada ligação.
11. **Chamada** — entrar no EDUCA e ler os manuais.

## Direção gráfica

| Token | Valor | Uso |
|---|---|---|
| Tinta | `#100c08` | texto, estrutura, palco escuro |
| Papel | `#f5f6f6` | fundo das seções claras (igual ao app) |
| Folha | `#ffffff` | superfícies e molduras das telas |
| Palco | `#0e0b09` | abertura e momentos cinematográficos (escuro nos dois temas) |
| Merin's Fire | `#ff9408` | a barra do meio da marca: marca o que está em movimento (a operação), nunca texto corrido |
| Fogo profundo | `#a34d00` | links e números de destaque sobre claro (contraste AA) |

- **Tipografia:** Instrument Serif para títulos editoriais (grandes, itálico como ênfase), Instrument Sans para texto e interface, JetBrains Mono para o vocabulário do sistema: códigos (`PV-001013`, `CR-0092`), rotas (`/comercial/pedidos-venda`) e permissões (`sales_orders.approve`).
- **Grade:** 12 colunas, margens com marcas técnicas finas; composição assimétrica, telas sangrando para a borda no desktop.
- **Motivo:** as três barras da marca EDUCA viram as "raias" dos diagramas; a barra laranja é o registro passando de uma área para outra.
- **Estados como forma:** "Na tela" (sólido), "Consulta" (contorno), "Na API" (contorno tracejado, mono), "Em evolução" (âmbar). O visitante distingue o que está pronto sem ler legenda.
- **Telas reais:** capturas de `docs/manual/assets` em molduras com a rota real na barra; recortes e zoom por enquadramento, nunca mockups.

## Motion

- Uma sequência orquestrada na abertura (telas entram em camadas; a trilha da operação avança).
- "Siga um pedido" com palco fixo e troca de tela por etapa conforme a rolagem.
- Entradas discretas por rolagem (CSS `animation-timeline: view()` onde suportado; sem suporte, tudo aparece pronto).
- Pulso laranja percorrendo os conectores dos fluxos.
- `prefers-reduced-motion`: tudo estático.

## Implementação

Site estático em `landing/` (fora do app Next, para não mexer no proxy de autenticação). Conteúdo em `landing/src/content.mjs`, gerado por `npm run landing:build`. Fontes e telas copiadas do repositório pelo próprio build.
