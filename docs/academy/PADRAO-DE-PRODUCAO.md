# ATLAS.ERP Academy — Padrão de produção

Regras comuns a todas as aulas. Cada `PLANO.md` traz só o que é específico da aula e remete a este documento para a linguagem visual, a gramática de cenas, a narração e a história contínua (o "cenário Academy").

---

## 1. Linguagem visual

A aula deve parecer **produzida pelo próprio produto**: a mesma identidade do ATLAS.ERP e do vídeo institucional (`docs/homologacao/video/`), mas a serviço do ensino.

| Elemento | Regra |
|---|---|
| Marca | Lockup ATLAS.ERP com o símbolo **Núcleo** (quatro barras em pinwheel + núcleo laranja). Aparece na abertura, no fechamento e, pequeno, no canto superior esquerdo. |
| Cor | Laranja da marca **`#FF9408`**: só para foco (destaques, etapa atual, cursor de clique, selos). Nunca como fundo de bloco grande. |
| Fundo | **Escuro** (`#0E0B09`) para abertura, conceitos, diagramas e fechamento. **Claro** quando a tela do sistema ocupa o quadro (a interface é clara). |
| Títulos | **Instrument Serif** (título da aula, títulos de capítulo, frases-chave). |
| Interface e explicação | **DM Sans** (rótulos, callouts, legendas, nomes de campo, quadros de conceito). |
| Mono | **JetBrains Mono** só para o que é código no sistema: números de documento (PV-0001, REC-0001), códigos de produto e local (BAL-08, PCK-A01), status técnicos que aparecem na tela (`PURCHASE_RECEIPT`) e rotas (`/app/comercial/pedidos-venda`). |
| Movimento | Suave e funcional (ease in-out, 400–900 ms). O zoom sempre serve para **ler** alguma coisa. Nunca há "efeito pelo efeito". |
| Destaque | Anel laranja de 2 px com escurecimento leve do resto da tela (o mesmo componente do institucional). Um destaque por vez. |
| Cursor | Aparece **só** quando há clique ou digitação real, com anel de clique discreto. Fica oculto entre ações. |
| Tom | Premium, silencioso, preciso. Sem emojis, sem "exclamações", sem setas cartunescas. |

### Componentes gráficos

| Componente | Uso | Aparência |
|---|---|---|
| **Cartão de capítulo** | Abre cada parte da aula | Fundo escuro, número em mono laranja (`03`), título em Instrument Serif, subtítulo em DM Sans. Dura 2,5 s. |
| **Rótulo de vidro** | Nomeia o que está em foco | Canto inferior esquerdo. Rótulo pequeno em mono laranja + texto em DM Sans. |
| **Callout de campo** | Explica um campo | Linha fina laranja do campo até um balão: **nome do campo**, para que serve, se é obrigatório. |
| **Pílula de personagem** | Quem está agindo | Canto superior direito, com avatar, nome e papel real. Troca com uma transição curta quando o usuário muda. |
| **Pipeline / stepper** | Fluxo e estados | Nós em pílula; o nó atual fica laranja; os estados futuros ficam esmaecidos; as etapas ⛔ ficam tracejadas. |
| **Selo de cobertura** | Honestidade | ✅ disponível · 🟡 parcial · 🔎 consulta · ⛔ indisponível na interface · ⚠️ limitação. Canto superior esquerdo da tela, sempre que a cena muda de tipo. |
| **Quadro ⛔ "Preparado fora da interface"** | Etapa feita pela API | Fundo escuro translúcido sobre a tela. Linha 1: "Nesta versão, esta etapa não tem tela." Linha 2: "Foi registrada por integração (API) com o usuário <papel>. Veja o resultado." Depois, corte para a tela real. |
| **Quadro de erro** | Erros e exceções | Três colunas: **Mensagem** (texto real, em mono) · **Por que aconteceu** · **Como resolver**. Borda vermelha discreta. Bug conhecido leva o rótulo ⚠️ e o ID (ex.: B5). |
| **Quadro de conferência** | Fim da operação | Lista de checagem com ✓ animados: status, número, movimento, outro módulo. |

---

## 2. Gramática das cenas (todo vídeo)

Cada aula é **um vídeo separado** e segue esta ordem. A tabela de cenas de cada plano detalha os tempos.

| # | Bloco | Conteúdo | Duração típica |
|---|---|---|---|
| A | **Abertura** | Núcleo se monta → "ATLAS.ERP Academy" → número e título da aula | 8–10 s |
| B | **Contexto** | A situação de trabalho (hora, empresa, personagem, problema do dia), em fundo escuro com uma ilustração mínima, ou sobre a tela inicial do personagem | 30–60 s |
| C | **Explicação** | O conceito antes da tela: o que é, por que existe, quem faz, qual módulo produz e qual recebe | 45–90 s |
| D | **Demonstração** | A operação real no sistema, com câmera, destaques e callouts | maior parte da aula |
| E | **Resultado** | O que mudou: status, número, outra tela, outro módulo | 30–60 s |
| F | **Erro / exceção** | Erros reais (quadro de erro) e como conferir | 1–3 min |
| G | **Exercício** | O que o aluno deve reproduzir sozinho, na tela de "Exercício" | 20–30 s |
| H | **Fechamento** | Resumo em 3 linhas → "Próxima aula" → lockup | 15–20 s |

**Regras de ritmo**

- Nunca acelerar uma operação. A digitação acontece em velocidade humana (~6 caracteres/s), com pausa de 0,8 s antes de cada clique importante.
- Depois de uma mensagem do sistema (toast, erro, confirmação), **segurar a tela por pelo menos 2,5 s** com a mensagem em destaque, para dar tempo de ler.
- Toda mudança de status ganha um zoom no selo e uma pausa de 1,5 s.
- A imagem espera a voz: a edição é sincronizada pela narração.

---

## 3. Narração

| Regra | Exemplo |
|---|---|
| Fala de **instrutor**, na segunda pessoa, natural | "Repare que o pedido ainda está em rascunho. Enquanto estiver assim, ninguém fora do comercial vai enxergá-lo como compromisso." |
| Explica o **porquê** antes do **onde** | "Antes de vender, o sistema precisa saber **quem** compra. Por isso começamos pelo cliente." |
| Nomeia os elementos com o **texto real da tela** | "Clique em **Enviar para aprovação**." (e não "clique no botão azul") |
| Quando algo não tem tela, diz isso **sem rodeio** | "Nesta versão, o orçamento ainda não é criado pela tela. Ele foi registrado por integração, e agora vamos acompanhar o resultado." |
| Bugs são ditos com calma e com a forma de conferir | "Atenção: aqui o sistema mostra 'Estoque reservado.' mesmo quando a reserva foi parcial. Por isso, confira sempre o indicador Reservado." |
| Frases curtas (até ~20 palavras) | — |
| Números lidos por extenso como se fala | "PV zero zero zero um", "dez unidades", "quarenta por cento" |

**Voz:** a decisão está pendente (README, decisão 3). O texto é escrito para voz neural pt-BR ou locutor humano: sem siglas soltas e sem símbolos.

---

## 4. Cenário Academy (a história contínua)

As aulas contam **uma semana de implantação** da Órbita Distribuidora. Os dados abaixo são fictícios e os CNPJs têm dígitos verificadores válidos, porque o sistema valida.

### Ambiente

O ambiente é limpo e separado (README, decisão 2 — recomendada): mesma versão do app, banco próprio e plataforma com o Owner **Marcus**. A Órbita nasce na aula 01.

> **Se o ambiente limpo não for aprovado**, as aulas podem ser gravadas na Órbita atual, com os nomes atuais. A seção 13 de cada plano lista o que muda.

### Pessoas (papéis reais)

Os e-mails usam o domínio fictício `orbitadistribuidora.test`.

| Personagem | Papel no sistema | Tipo | E-mail |
|---|---|---|---|
| Marcus | Owner (plataforma) | plataforma | `marcus@atlaserp.test` |
| Ana | Administrador | sistema | `ana@orbitadistribuidora.test` |
| Carlos | Gerente | sistema | `carlos@…` |
| Juliana | Vendedor | sistema | `juliana@…` |
| Rafael | Operador | sistema | `rafael@…` |
| Bruno | Logística | **personalizado** (criado pela Ana, aula 10) | `bruno@…` |
| Fernanda | Financeiro | **personalizado** | `fernanda@…` |
| Lucas | Fiscal | **personalizado** | `lucas@…` |

Senhas: nunca aparecem em tela nem no Git. Vêm só de variáveis de ambiente do script de gravação.

### Empresa e cadastros

| Item | Dados |
|---|---|
| Empresa | **Órbita Distribuidora** · razão social Órbita Distribuidora de Utilidades Ltda. · CNPJ **48.271.093/0001-15** · São Paulo/SP · plano `DISTRIBUICAO` · unidade **MATRIZ / Matriz** |
| Depósitos (automáticos) | **Depósito Principal** (`PRINCIPAL`) e **Almoxarifado Operacional** (`ALMOX`): criados pelo sistema com a empresa |
| Unidades de medida (automáticas) | UN, KG, G, L, ML, M, CM, CX, FD, PAL |
| Locais (aula 02) | `REC-01` Doca de recebimento (Recebimento) · `PCK-A01` Picking — rua A, módulo 01 (Picking) · `EXP-01` Área de expedição (Expedição). Todos no Depósito Principal. |
| Fornecedor (aula 02) | **Polar Fornecimentos OD Ltda.** · CNPJ **60.518.329/0001-70** · Embalagens · prazo médio 3 dias · 28 dias |
| Produtos (aula 02) | `BAL-08` **Balde plástico 8 L** · `BAL-12` **Balde plástico 12 L**. Produto acabado / Geral / UN / NCM 39249000 / fornecedor Polar / local padrão PCK-A01. 8 L: custo R$ 9,80, venda R$ 19,40, mínimo de venda R$ 17,00, estoque mínimo 20, máximo 120, ponto de reposição 30. 12 L: custo R$ 11,90, venda R$ 23,40. |
| Clientes (aula 02) | **Granito Serviços OD Ltda.** · CNPJ **31.902.874/0001-68** · Santos/SP · 28 dias · limite R$ 20.000,00. **Ferrovia Comércio OD Ltda.** · CNPJ **27.456.183/0001-00** · Campinas/SP · 30 dias. |

### Linha do tempo

| Quando | Aula | Fato |
|---|---|---|
| Seg 08:10 | 01 | Marcus cria a Órbita (Em avaliação), convida a Ana e descontrata os módulos fora do plano |
| Seg 08:40 | 10 | Ana configura a empresa e convida a equipe (segunda metade da Academy) |
| Seg 09:00 | 02 | Carlos e Rafael montam a base: fornecedor, locais, produtos e clientes |
| Seg 11:30 | 02 → ⛔ | **Saldo de implantação:** 12 × BAL-08 em PCK-A01, lançado por integração (contagem física da implantação) |
| Ter 08:30 | 03 | Granito pede 10 × BAL-08 → ORC-0001 (⛔) → PV-0001 (⛔ criação) → Juliana envia ✅ → Carlos aprova ✅ → Rafael reserva 10 no Picking ✅ |
| Ter 14:00 | 04 | Rafael vê o Picking com disponível 2, abaixo do mínimo de 20 → SC-0001 → PC-0001 (50 un, Polar), tudo ⛔ e acompanhado nas telas |
| Qui 07:30 | 04 / 05 | Chegam 50 un → REC-0001 confirmado na Doca (⛔) → conta a pagar gerada (⛔) |
| Qui 10:00 | 05 | Ferrovia pede 5 × BAL-08 → PV-0002 aprovado (⛔ preparação) → Bruno reserva no Picking → **reserva parcial (2 de 5)** → transferência Doca → Picking (⛔) → nova reserva ✅ → 100% |

**Horário de gravação:** gravar **antes das 21h (Brasília)**. ⚠️ B4: os documentos são datados em UTC; à noite eles cairiam no dia seguinte.

---

## 5. Gravação e pós-produção

- **Captura:** Playwright, 1920×1080 e `deviceScaleFactor` 2.
  - Cada ação é real: digitação, clique, espera da resposta.
  - O script grava vídeo e exporta, para cada ação, um registro com tempo e coordenadas: o que, onde (*bounding box*) e quando.
  - O compositor usa esse registro para posicionar câmera, destaques e cursor com precisão.
- **Selo de homologação:** a faixa "HOMOLOGAÇÃO · DADOS FICTÍCIOS" do app é ocultada só durante a captura. O vídeo leva o aviso fixo "Ambiente de demonstração · dados fictícios".
- **Compositor:** o mesmo motor do institucional (`docs/homologacao/video/fontes/`), ampliado para aceitar camadas de vídeo e quadros de aula.
- **Áudio:**
  - Narração no primeiro plano.
  - Trilha da família do institucional a −18 dB sob a voz, com *ducking*.
  - Efeitos discretos: clique, troca de tela, confirmação e erro (um tom grave suave, nunca um alarme).
- **Saída:** 1080p30 H.264 + AAC 48 kHz estéreo, um MP4 por aula, mais legendas `.srt`.
- **Evidências:** cada plano define as capturas que comprovam a execução (seção 12). Elas vão para `docs/academy/NN-modulo/evidencias/` no dia da gravação.
