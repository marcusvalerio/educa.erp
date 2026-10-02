# ATLAS.ERP Academy

**Uma biblioteca de aulas práticas: uma aula completa por módulo, para quem nunca usou o ATLAS.ERP aprender a trabalhar no sistema.**

Cada aula é um treinamento de funcionário novo. Ela não diz "este é o módulo Comercial". Ela começa assim: *"Você é a vendedora da Órbita Distribuidora. São 8h30. Vamos registrar uma venda do início ao fim."*

> **Estado (02/10/2026):** nenhuma aula foi gravada.
>
> - **Aulas 01–05: plano completo**, revalidado no código e no ambiente local. Cada `PLANO.md` tem as 13 seções de produção e a estrutura de cenas do vídeo.
> - **Aulas 06–10: plano resumido** (primeira versão), a detalhar na segunda metade da Academy.
>
> Documentos comuns: [mapeamento do sistema real](MAPEAMENTO.md) · [padrão de produção](PADRAO-DE-PRODUCAO.md) (linguagem visual, gramática de cenas, narração e a história contínua). O vídeo institucional fica separado, em [`docs/homologacao/video/`](../homologacao/video/).

## Princípios

1. **Sistema real.** Só aparecem telas, campos, botões e mensagens que existem. Cada afirmação do roteiro tem origem no [mapeamento](MAPEAMENTO.md).
2. **Honestidade visível.** Quando uma etapa não tem tela nesta versão, a aula diz isso em voz e na tela:
   - selo **⛔ "Nesta versão: via integração"**;
   - a etapa é executada pela API, fora de cena, e só o **resultado** aparece na tela real;
   - a aula nunca finge um clique.

   Bugs conhecidos que afetam o usuário são ensinados como **"como perceber e conferir"**.
3. **Cenário de trabalho.** A mesma empresa, os mesmos personagens e uma história contínua: o pedido criado na aula 03 é o que o estoque reserva na aula 05, que o financeiro cobra na 06 e assim por diante.
4. **A interface é a protagonista.** A narração explica, a tela demonstra e o texto na tela só reforça (palavras-chave, nunca parágrafos).
5. **Sem pressa.** Uma etapa que precisa de 40 s para ser entendida dura 40 s.

## Formato

### Plano completo (aulas 01–05)

Cada `PLANO.md` completo tem 13 seções:

| # | Seção | Conteúdo |
|---|---|---|
| 1 | Identidade | número, título, personagens, papel real, duração, nível, cobertura, objetivo |
| 2 | Contexto de negócio | a situação do dia, sem exagero |
| 3 | O que o aluno vai aprender | resultados de aprendizagem |
| 4 | Conceito antes da tela | o que é, por que existe, quem executa, módulo responsável, quem recebe |
| 5 | Roteiro de navegação | personagem, rota real, tela, ação, dados e resultado esperado |
| 6 | Demonstração | enquadramento, câmera, destaques, callouts, pausas |
| 7 | Narração | texto completo por bloco de cena |
| 8 | Estados e fluxo | entrada → processamento → resultado, e a passagem entre módulos |
| 9 | Erros e exceções | situação, mensagem real, causa, impacto, como identificar, solução, se é bug |
| 10 | Exercício prático | o que o aluno reproduz sozinho |
| 11 | Checklist de conclusão | o que o aluno precisa saber fazer |
| 12 | Evidências | capturas que comprovam a execução |
| 13 | Preparação técnica | endpoints, usuário, dados e resultado de cada etapa ⛔ |

Cada vídeo segue a gramática **A Abertura · B Contexto · C Explicação · D Demonstração · E Resultado · F Erro/exceção · G Exercício · H Fechamento**, descrita no [padrão de produção](PADRAO-DE-PRODUCAO.md#2-gramática-das-cenas-todo-vídeo).

### Plano resumido (aulas 06–10)

| # | Parte | O que mostra | Tempo típico |
|---|---|---|---|
| 01 | Introdução | módulo, objetivo, quem usa, responsabilidades | 20–40 s |
| 02 | O cenário | empresa, personagem, cargo (papel real) e situação do dia, com horário | 20–40 s |
| 03 | Navegação | onde fica, menu, filtros, busca, ações e o raciocínio de cada tela | 1–2 min |
| 04 | Operação principal | entrada → preenchimento → validação → salvamento → resultado → próxima etapa | 3–8 min |
| 05 | O que acontece no ERP | reflexos em outros módulos, com animação de conexão | 1–2 min |
| 06 | Caso realista | um segundo cenário menor ("o cliente pediu alteração") | 1–3 min |
| 07 | Erros e exceções | **ERRO → POR QUE ACONTECEU → COMO RESOLVER**, com mensagens reais | 1–3 min |
| 08 | Conferência | status, número do documento, auditoria, movimentação, outro módulo | 1 min |
| 09 | Relação com outros módulos | "essa operação agora segue para…" | 30 s |

## Personagens

Os nomes são os propostos; os papéis são os **que existem** no sistema.

| Personagem | Papel no ATLAS.ERP | Tipo | O que pode fazer (resumo real) |
|---|---|---|---|
| **Marcus** | **Owner** da plataforma | Plataforma | Cria empresas, ciclo de vida, contrata módulos, gerencia Owners e Admins. **Não vê** dados operacionais das empresas. |
| **Ana** | **Administrador** | Papel de sistema | Tudo na empresa: convida usuários, cria papéis, habilita módulos, configura painéis, lê auditoria. |
| **Carlos** | **Gerente** | Papel de sistema | Aprova pedidos, compras e expedições, cancela pedidos, ajusta estoque. **Não** convida usuários nem cria papéis. |
| **Juliana** | **Vendedor** | Papel de sistema | Clientes, orçamentos e pedidos (criar pela API, enviar pela tela). **Não** aprova e não vê Financeiro nem Fiscal. |
| **Rafael** | **Operador** | Papel de sistema | Reserva estoque, recebimentos, separação e expedição, contagem e transferência. **Não** aprova. ⚠️ B9: também cria conta a pagar e NCM. |
| **Fernanda** | **Financeiro** | **Papel personalizado** (criado pela Ana na aula 10) | Gera conta a receber, contas a pagar, recebimentos e pagamentos. |
| **Lucas** | **Fiscal** | **Papel personalizado** | Documentos fiscais, NCM, CFOP e regras tributárias. |
| **Bruno** | **Logística** | **Papel personalizado** | Reserva, separação, expedição, aprovação de expedição, locais e contagem. Confirma recebimento, mas **não lança**: o lançamento é do Rafael. |
| *(opcional)* **Tiago** | **Somente leitura** | Papel de sistema | Consulta. Útil na aula 09 e para mostrar o débito B10. |

> "Administradora", "Gerente Comercial" e outros títulos são **cargos** (texto livre em Administração → Cargos). As permissões vêm só do **papel**. As aulas deixam essa diferença explícita.

## As 10 aulas

**Viabilidade hoje** é o quanto da operação pode ser feito **na interface**, segundo o mapeamento.

| Aula | Público / personagem | Cenário | Viabilidade hoje | Duração est. | Status |
|---|---|---|---|---|---|
| [01 — Administração Central](01-administracao-central/PLANO.md) | Owner · **Marcus** | "Hoje entra um cliente novo: a Órbita Distribuidora." | ✅ completa | 12–13 min | **plano completo** |
| [02 — Cadastros](02-cadastros/PLANO.md) | Gerente, Operador, Vendedor · **Carlos**, **Rafael**, **Juliana** | "Antes da primeira venda, a base precisa existir." | ✅ completa para fornecedor, local, produto e cliente · ⚠️ categoria/marca/unidade sem tela (D2, B8) · ⛔ perfil fiscal (D3) e saldo de implantação | 15–17 min | **plano completo** |
| [03 — Comercial](03-comercial/PLANO.md) | Vendedor, Gerente, Operador · **Juliana**, **Carlos**, **Rafael** | "8h30: o Granito pediu 10 baldes." | 🟡 mista (criar orçamento/pedido ⛔ B1; enviar, aprovar e reservar ✅) | 14–16 min | **plano completo** |
| [04 — Compras](04-compras/PLANO.md) | Operador, Gerente, Logística · **Rafael**, **Carlos**, **Bruno** | "O estoque de baldes está baixo." | 🔎 acompanhamento (todo o ciclo ⛔) | 10–12 min | **plano completo** (versão de acompanhamento, decisão 1-A) |
| [05 — Estoque / WMS](05-estoque-wms/PLANO.md) | Logística, Operador · **Bruno**, **Rafael** | "Chegaram 50 unidades. Depois, um pedido de 5." | 🟡 conceito + consulta; reserva e liberação ✅; transferência e demais operações ⛔ | 15–17 min | **plano completo** |
| [06 — Financeiro](06-financeiro/PLANO.md) | Financeiro · **Fernanda** | "A venda foi aprovada. Agora é com você." | 🟡 mista (gerar conta a receber ✅; baixa e pagamento ⛔) | 10–12 min | plano resumido |
| [07 — Fiscal](07-fiscal/PLANO.md) | Fiscal · **Lucas** | "A venda está pronta para o fiscal." | 🔎 consulta + checklist (gerar NF-e ⛔ B2; autorização SEFAZ: sem certificado) | 10–12 min | plano resumido · **decisão pendente** |
| [08 — Logística](08-logistica/PLANO.md) | Logística, Gerente · **Bruno**, **Carlos** | "Um pedido aprovado precisa sair hoje." | 🔎 consulta (separar, expedir e entregar ⛔) | 9–11 min | plano resumido · **decisão pendente** |
| [09 — Auditoria](09-auditoria/PLANO.md) | Administrador · **Ana** | "Quem reservou este pedido?" | ✅ completa (com limitações B7 e B17) | 7–9 min | plano resumido |
| [10 — Configurações](10-configuracoes/PLANO.md) | Administrador · **Ana** | "A empresa foi criada ontem. Prepare tudo para a operação começar." | ✅ quase completa (Dados da empresa ⚠️ D1; fiscal ⛔) | 13–15 min | plano resumido |

**Total estimado:** cerca de 2 h a 2 h 10 min de aulas (01–05: cerca de 70 min).

### Ordem recomendada para quem aprende

A numeração segue o pedido original, mas a sequência de estudo segue a vida real da empresa:

**01 Central → 10 Configurações → 02 Cadastros → 03 Comercial → 04 Compras → 05 Estoque → 06 Financeiro → 07 Fiscal → 08 Logística → 09 Auditoria**

A história das aulas 02–05 é contínua: o saldo de implantação (02) é reservado pelo pedido do Granito (03); o disponível baixo dispara a compra (04); os 50 baldes recebidos vão da doca para o picking e atendem o pedido da Ferrovia (05).

### Trilhas por função

| Função | Aulas |
|---|---|
| Owner / plataforma | 01 |
| Administrador da empresa | 10 → 02 → 09 (+ visão geral das demais) |
| Vendedor | 02 (clientes) → 03 |
| Gerente | 03 → 04 → 05 → 08 |
| Operador / Logística | 02 (locais) → 04 → 05 → 08 |
| Financeiro | 03 (partes 05 e 09) → 06 |
| Fiscal | 02 (produto) → 07 |

## Como as aulas serão produzidas

O nível visual é o do vídeo institucional (marca, Núcleo, `#FF9408`, tipografia, câmera, destaques, transições, trilha discreta). A diferença é que **a interface é usada de verdade**:

- **Gravação real da interface.**
  - Playwright conduz a sessão do personagem em 1920×1080, com digitação em velocidade humana, pausas para leitura e cursor visível.
  - Cada clique, campo preenchido e mensagem de erro acontece no sistema.
  - A gravação vira uma camada de vídeo no compositor do product tour, que acrescenta zoom, câmera, círculos, setas, callouts e textos curtos.
- **Etapas ⛔ (só API).**
  - Executadas por um script de preparação de cena, com o usuário do papel correto, **fora** da gravação.
  - A aula corta para a tela real que mostra o resultado, sempre com o selo ⛔ e a frase de narração correspondente.
- **Narração.**
  - Roteiro escrito por aula (`narracao.md`, com marcação de tempo).
  - A voz é uma decisão sua (ver abaixo).
  - A edição é sincronizada pela narração: a imagem espera a voz, nunca o contrário.
- **Som.** A mesma família de trilha e efeitos do institucional, em volume menor (−6 dB sob a voz, com *ducking* automático).
- **Legendas.** Arquivo `.srt` por aula, gerado do roteiro (acessibilidade e busca).
- **Revisão em 3 passos por aula:** roteiro aprovado → corte com quadros-chave revisados → MP4 final.

### Entregáveis de cada aula (`docs/academy/NN-modulo/`)

| Arquivo | Conteúdo |
|---|---|
| `PLANO.md` | **(hoje)** plano de produção: 13 seções nas aulas 01–05; versão resumida nas 06–10 |
| `roteiro.md` | roteiro técnico com as 9 partes e tempos |
| `narracao.md` | texto da narração, com marcação de tempo |
| `storyboard.jpg` | quadros-chave por parte |
| `telas.md` | telas usadas: rota, usuário, ✅ / 🔎 / ⛔ |
| `cenario.md` | dados da história (cliente, produto, pedido, números) |
| `legendas.srt` | legendas |
| `ATLAS-ERP-Academy-NN-modulo.mp4` | aula final (1080p30, H.264 + AAC) |
| `fontes/` | script de gravação, cena e compositor (reprodutível) |

## Decisões para validar

1. **Aulas que hoje são de consulta** (04 Compras, 07 Fiscal, 08 Logística; parte da 05 e da 06). Opções:
   - **(A — recomendada)** Gravar já, como **"aulas de acompanhamento"**: ensinar a ler o fluxo, os status e a conferência, com as etapas ⛔ mostradas como resultado e avisadas. Quando as telas de ação existirem, essas aulas são regravadas como "operação" (o plano já prevê as duas versões).
   - **(B)** Adiar essas aulas até existirem as telas: criar pedido e orçamento (B1), NF-e (B2), compras, recebimento, separação, expedição e baixa financeira.
   - **(C)** Implementar primeiro as telas que faltam e só então gravar todas. É uma decisão de produto, de escopo grande.
2. **Ambiente de gravação.**
   - **(A — recomendada)** Um ambiente **Academy limpo** (mesma versão do app, banco separado). A Órbita Distribuidora **nasce na aula 01** pelas mãos do Marcus, e os personagens com os nomes propostos são convidados pelo fluxo oficial na aula 10. A auditoria fica coerente e as listas não têm resíduos de teste ("NCM do teste de permissão", "Título do teste de permissão"). A numeração começa em PV-0001 (B3 não aparece).
   - **(B)** Usar a Órbita atual. É mais rápido, mas mantém os nomes atuais (Marina, Caio, Helena, Rafael, Bianca, Otávio, Lívia, Tiago) e os resíduos de teste. Renomear agora deixaria a auditoria com os nomes antigos, porque ela grava o nome no momento da ação.
3. **Voz da narração.** O ambiente bloqueia as fontes gratuitas de voz neural (Hugging Face, ElevenLabs, OpenAI, Azure). As opções são:
   - **(A — recomendada)** **Amazon Polly Neural** (pt-BR: Thiago ou Camila) ou **Google Cloud TTS Neural2/Studio** (pt-BR). Ambos são alcançáveis daqui e têm qualidade de instrutor. Exigem credenciais suas, configuradas como segredo do ambiente (nunca no Git).
   - **(B)** **Locutor humano** gravando a partir do `narracao.md`. É a melhor qualidade; a edição se ajusta ao áudio.
   - **(C)** Liberar o Hugging Face na política de rede para usar o **Piper** (voz pt-BR offline). É gratuito, mas soa claramente sintético.
4. **Aula piloto.** Sugestão: **02 — Cadastros**. Ela é quase toda feita na interface real (só o saldo de implantação é preparado fora), tem erros reais claros e exercita todo o formato: digitação, validação, conferência, relação com outros módulos. Ela valida voz, ritmo e visual antes da série.
5. **Correções baratas antes de gravar.** ✅ **Feito** (sua autorização de 02/10): na `main`, commit `48775f5`, só interface:
   - **B5:** a reserva parcial agora avisa "Reserva parcial." com o reservado e o pendente; sem saldo, "Nenhuma unidade reservada.";
   - **D5:** Movimentações com "Reserva", "Liberação de reserva" e origens traduzidas;
   - **D8:** local sem descrição aparece pelo código na reserva e no saldo;
   - diálogos de ação do pedido com "Voltar" (em vez de "Cancelar" ao lado de "Cancelar pedido").

   Ficaram de fora por exigirem migration no banco de produção: **D1** (Dados da empresa), **B15** (casas decimais em mensagens do banco), **B18** (unidade do item). B14 não aparece no fluxo das aulas.
