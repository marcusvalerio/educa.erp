# Aula 09 — Auditoria

> Plano de produção. Validado no código (`48775f5`) e ao vivo no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 09 |
| **Título** | Auditoria — quem fez o quê, quando e em qual registro |
| **Personagem** | **Ana** |
| **Papel real** | **Administrador** (da empresa) |
| **Coadjuvantes** | **Carlos** (Gerente, também lê a auditoria) · **Juliana** (Vendedor, para mostrar o limite) · **Marcus** (Owner, citado: auditoria da plataforma) |
| **Duração estimada** | 8–10 min |
| **Nível** | Intermediário |
| **Cobertura** | ✅ completa pela interface (a auditoria é consulta por natureza) · ⚠️ B7 (criação e envio do pedido e movimentos de estoque não aparecem) · ⚠️ B17 (a lista não filtra por registro) · ⚠️ D10 (entidade "stock_reservations" sem tradução) |
| **Objetivo principal** | Reconstruir a história de um pedido pela trilha de auditoria, ler cada linha (data, usuário, entidade, ação), usar os filtros certos e saber, com honestidade, o que a trilha ainda não registra. |

## 2. Contexto de negócio

> Sexta-feira, 16h. O Granito liga: "Os baldes chegaram, obrigado. Mas o nosso comprador quer saber quem aprovou o preço e quando a mercadoria saiu."
>
> A Ana, administradora da Órbita, abre a auditoria. Ela não participou de nada do pedido. Tudo o que ela sabe vai sair da trilha.

## 3. O que o aluno vai aprender

- O que a auditoria registra: **autor, data e hora, entidade e ação**.
- As duas telas da empresa (Administração → Auditoria e Controladoria → Auditoria) e o **Histórico** dentro de cada registro.
- Usar a busca por usuário e o filtro **Ação**.
- Reconstruir a linha do tempo do PV-0001 juntando o Histórico do pedido e as linhas de outras entidades (conta a receber, documento fiscal, separação, expedição).
- O que a trilha **não** mostra (B7) e como responder mesmo assim.
- A diferença entre a auditoria da empresa e a da plataforma (aula 01).
- Quem pode ler a auditoria.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | A memória do sistema: cada ação relevante grava uma linha com quem fez, quando, em qual tipo de registro e o que foi feito. |
| Por que existe | Para responder a perguntas sem depender de lembrança: quem aprovou, quem mudou, quando saiu. É também o que sustenta a segregação de funções: cada aprovação tem dono. |
| Quem executa | Ninguém "faz" auditoria: o banco grava sozinho. Quem **lê**: Administrador, Gerente, Operador e Somente leitura (⚠️ B10). Vendedor e os papéis personalizados não leem. |
| Módulo responsável | Administração da Empresa → Auditoria (`/app/admin/audit`) e Controladoria → Auditoria (`/app/gestao/auditoria`); Histórico em cada registro. |
| Quem recebe o resultado | Gestão, conformidade, atendimento ao cliente. A auditoria da **plataforma** (`/app/admincentral/audit`) é separada e não inclui dados operacionais das empresas. |

**O que a trilha registra hoje** (conferido no banco):

| Área | Ações registradas | Não registra (⚠️ B7) |
|---|---|---|
| Cadastros | Criação, Alteração, Ativação, Inativação, Exclusão | — |
| Pedido de venda | Aprovação, Reserva, Liberação, Cancelamento | criação, envio para aprovação |
| Compras | Solicitação (Aprovação), Pedido de compra (Aprovação), Recebimento de compra (Confirmação) | criação dos documentos |
| Financeiro | Conta a receber (Aprovação = geração), Conta a pagar, Recebimento, Pagamento | — |
| Fiscal | Documento fiscal (Criação, Alteração), Perfil fiscal do produto | — |
| Logística | Separação (Separação), Expedição (Embalagem, Aprovação, Expedição, Entrega) | movimentos de estoque |
| Acesso | Usuário, Convite, Papel, Papel do usuário | — |

## 5. Roteiro de navegação

```
PERSONAGEM: Ana — Administrador · sexta, 16h

1. Abrir a auditoria
   Rota: /app/admin → Auditoria → /app/admin/audit
   Tela: "Auditoria da empresa — Alterações de acesso, estrutura e cadastros registradas
   pelo banco para esta empresa."
   Colunas: Data, Usuário, Entidade, Ação (colunas ocultas: Tabela, Registro).
   Busca: "Buscar por usuário..." · Filtro: Ação.

2. Ler uma linha
   Ação: clicar numa linha → gaveta: título = entidade; subtítulo = usuário e tabela;
   selo = ação.
   Explicar: data e hora (fuso do navegador), usuário (nome gravado no momento da ação),
   entidade, ação.

3. "Quem aprovou o preço?"
   Ação: filtro Ação = "Aprovação"
   Resultado: "Pedido de venda · Aprovação · Carlos" (terça) — e também a aprovação do
   orçamento, da solicitação e do pedido de compra (todas do Carlos).

4. A história completa do pedido: o Histórico
   Rota: Comercial → Pedidos de venda → PV-0001 → bloco "Histórico — Alterações registradas
   na auditoria."
   Resultado: Aprovação (Carlos, terça) · Reserva (Rafael, terça).
   Explicar: o Histórico mostra só as linhas deste registro.

5. "Quando a mercadoria saiu?"
   Rota: /app/admin/audit → busca "Bruno"
   Resultado (Entidade · Ação, sexta): Separação · Separação | Expedição · Embalagem |
   Expedição · Expedição | Expedição · Entrega — e, pelo filtro Ação = "Aprovação", a
   Expedição · Aprovação do Carlos.

6. As outras áreas do mesmo pedido
   Busca "Fernanda" → Conta a receber · Aprovação (a geração do título, quinta).
   Busca "Lucas" → Documento fiscal · Criação / Alteração (sexta).
   Linha do tempo montada (motion sobre as linhas reais):
     Ter 08:xx  Aprovação  (Carlos)   · Ter 09:xx Reserva (Rafael)
     Qui 14:xx  Conta a receber (Fernanda)
     Sex 08:xx  Documento fiscal (Lucas) · Sex 10:xx Separação / Expedição / Entrega (Bruno, Carlos)

7. O que não aparece (caso realista)
   Pergunta do cliente: "Quem lançou o pedido?"
   Resultado: não há linha de criação nem de envio para aprovação do pedido (⚠️ B7).
   Como responder hoje: o pedido foi gerado do orçamento ORC-0001 (observação do pedido) e
   o Histórico mostra a primeira ação registrada (a aprovação). Ser franco: é uma lacuna
   conhecida.

8. Controladoria → Auditoria
   Rota: /app/gestao/auditoria
   Tela: "Auditoria — Quem fez o quê, quando — operações e alterações registradas pelo
   banco." Mesma trilha, no menu de gestão (é por ali que o Carlos acessa).

PERSONAGEM: Juliana — Vendedor

9. O limite
   Ação: Juliana abre o PV-0001 → Histórico
   Resultado: "O histórico de alterações exige a permissão de auditoria."
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Lista | Tela cheia → zoom nas quatro colunas | Callouts: Data, Usuário, Entidade, Ação | 3 s |
| Gaveta de uma linha | Painel lateral | — | 2 s |
| Filtro Aprovação | Zoom no filtro e nas linhas do Carlos | Anel em "Pedido de venda · Aprovação" | 2,5 s |
| Histórico do pedido | Zoom no bloco | Callout "Só este registro" | 2,5 s |
| Busca "Bruno" | Linhas de Separação e Expedição | Selo da ação em cada linha | 2 s |
| Linha do tempo | Fundo escuro; eixo terça → sexta com as linhas reais | Pílulas dos autores | 6 s |
| Lacuna B7 | Quadro honesto | "Criação e envio do pedido não aparecem" | 3 s |
| Linha "stock_reservations" | Zoom | Selo ⚠️ D10 | 2 s |
| Juliana | Corte seco | Mensagem de permissão | 2,5 s |

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula nove: Auditoria.

**[B — Contexto]**
Sexta-feira, quatro da tarde. O Granito recebeu os baldes e quer saber quem aprovou o preço e quando a mercadoria saiu. A Ana, administradora, não participou de nada disso. Tudo o que ela vai saber vem da auditoria.

**[C — Explicação]**
A auditoria é a memória do sistema. Cada ação relevante grava uma linha: quem fez, quando, em que tipo de registro e o que foi feito. Ninguém digita a auditoria: o banco grava sozinho. E ela não pode ser editada. É o que dá dono a cada aprovação.

**[D1 — A lista]**
Em Administração, Auditoria. Quatro colunas: data, usuário, entidade e ação. A busca é por usuário, e o filtro é por ação. Clique numa linha para ver o detalhe.

**[D2 — Quem aprovou]**
Filtre a ação Aprovação. Lá está: pedido de venda, aprovação, Carlos, na terça. A Ana já tem a primeira resposta.

**[D3 — O Histórico]**
Para ver tudo de um único pedido, o caminho é o próprio pedido. No bloco Histórico, aparecem só as linhas do PV zero zero zero um: a aprovação do Carlos e a reserva do Rafael.

**[D4 — Quando saiu]**
A saída é registrada na expedição, que é outro registro. Busque pelo Bruno: separação, embalagem, expedição e entrega, todas na sexta. E, entre elas, a aprovação da expedição pelo Carlos. Somando a conta a receber da Fernanda e a nota do Lucas, a Ana monta a semana inteira do pedido.

**[E — Resultado]**
A resposta ao cliente: o preço foi aprovado pelo Carlos na terça, a mercadoria foi separada e expedida na sexta de manhã e entregue antes do almoço. Tudo com nome e horário.

**[F — Erros e exceções]**
Agora, os limites desta versão. A trilha não registra quem criou o pedido nem quem o enviou para aprovação, e os movimentos de estoque também não aparecem como linhas de usuário. Para essas perguntas, use o histórico do registro e os documentos ligados a ele. A lista não filtra por um registro específico: por isso o caminho é o Histórico dentro do pedido. Alguns nomes de entidade ainda aparecem em código, como stock reservations. E nem todos os papéis leem a auditoria: a Juliana, vendedora, não vê o histórico.

**[G — Exercício]**
Sua vez. Escolha um pedido e responda, só pela auditoria: quem aprovou, quem reservou e quando ele saiu. Depois, diga uma pergunta que a trilha ainda não consegue responder.

**[H — Fechamento]**
Resumindo: a auditoria grava quem, quando, o quê e onde; o Histórico conta a vida de um registro; e a lista junta tudo. Na próxima aula, voltamos ao início da semana: a Ana configura a empresa e a equipe.

## 8. Estados e fluxo

```
AÇÃO DE UM USUÁRIO ──► FUNÇÃO DO BANCO ──► LINHA DE AUDITORIA (autor, data, entidade, registro, ação)
                                               ├──► Administração → Auditoria (empresa)
                                               ├──► Controladoria → Auditoria (mesma trilha)
                                               └──► Histórico do registro (filtrado pelo registro)
AÇÃO DE GOVERNANÇA (Owner/Admin da plataforma) ──► Auditoria da plataforma (aula 01)
```

**Entrada:** a semana das aulas 02–08.
**Processamento:** consulta, filtros, Histórico.
**Resultado:** a linha do tempo do PV-0001, com as lacunas conhecidas.
**Segue para:** Configurações (aula 10).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Criação e envio do pedido não aparecem | — | A trilha não registra essas ações | Lacuna de rastreio | Histórico começa na aprovação | Usar documentos ligados (orçamento) e o Histórico | ⚠️ **B7** |
| Movimentos de estoque não aparecem como ação de usuário | — | Gravados só no ledger | — | Auditoria × Movimentações | Conferir em Movimentações (aula 05) | ⚠️ **B7** |
| Filtrar a lista por um registro | — (não existe; a API ignora o registro) | Lista só filtra por entidade, ação e usuário | Busca manual | — | Usar o Histórico dentro do registro | ⚠️ **B17** |
| Entidade em código | "stock_reservations" | Tabela sem rótulo | Leitura | Coluna Entidade | Ler como "Reserva de estoque" | ⚠️ D10 |
| Vendedor abre o Histórico | "O histórico de alterações exige a permissão de auditoria." | Sem `audit_logs.read` | — | Bloco Histórico | Pedir a quem tem acesso | não (regra) |
| Somente leitura lê a auditoria e a Administração | — | Modelo do papel | Exposição maior que o necessário | Matriz | Rever o papel (aula 10) | ⚠️ **B10** |
| Horários | Fuso do navegador; documentos em UTC | ⚠️ B4 | Diferença à noite | Comparar data do documento e da linha | Atenção a operações noturnas | ⚠️ **B4** |
| Nome do autor antigo | O nome gravado no momento da ação | Por desenho | Renomear usuário não muda o passado | — | — | não |

## 10. Exercício prático

1. Use o filtro **Ação = Aprovação** e liste quem aprovou o quê na semana.
2. Abra o PV-0001 e leia o **Histórico**.
3. Busque pelo **Bruno** e reconstrua a saída da mercadoria.
4. Mostre as colunas ocultas **Tabela** e **Registro** e diga para que servem.
5. **Pergunta:** que pergunta sobre o PV-0001 a trilha não consegue responder? Como você responderia ao cliente?

## 11. Checklist de conclusão

- [ ] Sei ler uma linha de auditoria (data, usuário, entidade, ação).
- [ ] Uso a busca por usuário e o filtro Ação.
- [ ] Uso o Histórico para ver a vida de um registro.
- [ ] Reconstruí a linha do tempo de um pedido entre várias entidades.
- [ ] Conheço as lacunas (B7, B17) e sei contorná-las.
- [ ] Sei quem pode ler a auditoria e a diferença para a auditoria da plataforma.

## 12. Evidências

Salvar em `docs/academy/09-auditoria/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-lista.png` | Colunas, busca e filtro |
| 02 | `02-filtro-aprovacao.png` | Aprovações do Carlos |
| 03 | `03-historico-pv0001.png` | Aprovação e Reserva no pedido |
| 04 | `04-busca-bruno.png` | Separação e Expedição |
| 05 | `05-fernanda-lucas.png` | Conta a receber e Documento fiscal |
| 06 | `06-stock-reservations.png` | Entidade sem rótulo (D10) |
| 07 | `07-juliana-historico.png` | Mensagem de permissão |

## 13. Preparação técnica

- **Nenhuma etapa ⛔ nova:** a aula usa a trilha deixada pelas aulas 01–08, na ordem da história.
- **Conferir antes de gravar:** que as linhas citadas existem com os autores certos (cada etapa de preparação foi feita com a conta do papel correto).
- **Horário:** se as aulas forem preparadas no mesmo dia, as datas serão iguais; a narração fala em dias da semana só na linha do tempo em motion, que usa os horários da história (rótulo "reconstituição").
- **Sem ambiente limpo:** a trilha terá linhas de testes anteriores; filtrar pelos autores da história.

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "09 · Auditoria" |
| B | Contexto | 0:09–0:35 | "Sexta, 16h" · ligação do Granito · pílula Ana |
| C | Explicação | 0:35–1:30 | O que é uma linha de auditoria; o que é registrado |
| D1 | A lista | 1:30–2:30 | Colunas, busca, filtro, gaveta |
| D2 | Quem aprovou | 2:30–3:20 | Filtro Aprovação |
| D3 | Histórico | 3:20–4:10 | Bloco do pedido |
| D4 | Quando saiu | 4:10–5:30 | Bruno, Fernanda, Lucas; linha do tempo |
| E | Resultado | 5:30–6:20 | A resposta ao cliente |
| F | Erros | 6:20–8:10 | B7, B17, D10, permissão, B10, B4 |
| G | Exercício | 8:10–8:35 | Tela de exercício |
| H | Fechamento | 8:35–8:55 | 3 linhas → "Próxima aula: Configurações" → lockup |
