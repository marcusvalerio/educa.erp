# Aula 02 — Cadastros

> Plano de produção. Revalidado no código (`2b9112b`) e no ambiente local em 02/10/2026.
> Padrões comuns: [PADRAO-DE-PRODUCAO.md](../PADRAO-DE-PRODUCAO.md) · mapeamento: [MAPEAMENTO.md](../MAPEAMENTO.md).

## 1. Identidade da aula

| | |
|---|---|
| **Número** | 02 |
| **Título** | Cadastros — a base que todo o ERP usa |
| **Personagens** | **Carlos** (fornecedor, produtos, clientes, inativação e exclusão) · **Rafael** (locais de estoque) · **Juliana** (participação curta: o que o Vendedor pode e não pode) |
| **Papéis reais** | Carlos — **Gerente** · Rafael — **Operador** · Juliana — **Vendedor** (todos papéis de sistema) |
| **Duração estimada** | 15–17 min |
| **Nível** | Introdutório (operação) |
| **Cobertura** | ✅ completa pela interface para fornecedor, local, produto e cliente · ⚠️ categoria, marca e unidade sem tela (D2, B8) · ⛔ perfil fiscal do produto (D3) · ⛔ saldo de implantação (preparação para a aula 03) |
| **Objetivo principal** | Montar, na ordem certa, a base mínima para a primeira compra e a primeira venda: fornecedor, locais, produtos e clientes. Ao final, o aluno sabe criar, consultar, editar, inativar e entender por que um registro em uso não pode ser excluído. |

## 2. Contexto de negócio

> Segunda-feira, 9h. A Órbita Distribuidora acabou de ser criada (aula 01) e a Ana já convidou a equipe. O sistema está vazio: não há um único cliente, produto ou fornecedor.
>
> Amanhã cedo, o Granito, um cliente antigo da Órbita, vai fazer o primeiro pedido: baldes plásticos. Antes disso, alguém precisa cadastrar:
>
> - o fornecedor dos baldes, a **Polar Fornecimentos**;
> - os endereços do armazém, para o estoque ter onde ficar;
> - os **produtos**, com preço, custo e estoque mínimo;
> - os **clientes** que já compram da Órbita.
>
> O Carlos, gerente, cuida do comercial e das compras. O Rafael, operador do armazém, conhece cada rua e cada prateleira. Os dois dividem a manhã.

## 3. O que o aluno vai aprender

- Por que os cadastros vêm **antes** de qualquer operação, e em que **ordem**.
- O padrão comum a todos os cadastros: lista, busca, filtros, colunas, exportação, ações do registro, ações em lote e gaveta de detalhe. Aprendeu um, aprendeu todos.
- Cadastrar um **fornecedor**, um **local de estoque**, um **produto** e um **cliente**, campo a campo.
- Entender os campos que outros módulos usam depois: estoque mínimo (Compras), local padrão (Estoque), condição de pagamento e limite de crédito (Comercial e Financeiro), NCM (Fiscal).
- **Editar** um registro e conferir o histórico.
- **Inativar** em vez de excluir, e por que o sistema bloqueia a exclusão de um registro em uso.
- O que cada papel pode fazer nos cadastros.
- O que ainda **não** tem tela: categoria, marca e unidade relacionais, e o perfil fiscal do produto.

## 4. Conceito antes da tela

| Pergunta | Resposta |
|---|---|
| O que é | O conjunto de registros mestres que as operações referenciam: **quem** compra (cliente), **de quem** se compra (fornecedor), **o quê** se movimenta (produto) e **onde** fica (local de estoque). |
| Por que existe | Um pedido não guarda o nome do cliente digitado à mão: ele aponta para o cadastro. Se o cadastro estiver certo, todo o resto herda o dado certo: preço, prazo, endereço, NCM, local. Se estiver errado, o erro se espalha. |
| Quem executa | Gerente e Administrador: tudo, inclusive excluir. Operador: cria e edita fornecedores, produtos, clientes e locais, mas não exclui. Vendedor: cria e edita clientes; vê produtos. Logística: cria e edita locais de estoque e consulta os cadastros de transporte. |
| Módulo responsável | Cadastros (`/app/cadastros`) |
| Quem recebe o resultado | Comercial (cliente e produto, aula 03), Compras (fornecedor e estoque mínimo, aula 04), Estoque/WMS (locais e local padrão, aula 05), Financeiro (condição de pagamento e limite, aula 06), Fiscal (NCM, aula 07), Logística (locais de expedição e transportadoras, aula 08). |

**Ordem de dependência** (diagrama da cena C):

```
Depósitos (automáticos)  ─►  LOCAIS DE ESTOQUE ─┐
                                                ├─►  PRODUTO  ─►  pedidos, compras, estoque, NF-e
FORNECEDOR  ────────────────────────────────────┘
CLIENTE  ───────────────────────────────────────────►  orçamentos, pedidos, contas a receber
```

O produto aponta para o fornecedor e para o local padrão. Por isso ele é cadastrado **depois** dos dois.

**Quem pode o quê** (permissões reais, conferidas ao vivo):

| Cadastro | Gerente | Operador | Vendedor | Logística |
|---|---|---|---|---|
| Fornecedores | criar, editar, inativar, excluir | criar, editar, inativar | — | — |
| Locais de estoque | criar, editar, inativar, excluir | criar, editar, inativar | — | criar, editar, inativar |
| Produtos | criar, editar, inativar, excluir | criar, editar, inativar | consultar | — |
| Clientes | criar, editar, inativar, excluir | criar, editar, inativar | criar, editar, inativar | — |

Botões sem permissão **não aparecem** (não ficam desabilitados).

## 5. Roteiro de navegação

```
PERSONAGEM: Carlos — Gerente

1. Entrar e abrir Cadastros
   Rota: /login → /app → menu lateral Cadastros → /app/cadastros
   Resultado: área de trabalho de Cadastros com os sete cadastros (Produtos, Clientes,
   Fornecedores, Transportadoras, Motoristas, Veículos, Locais de estoque).

2. Conhecer o padrão da lista (em Fornecedores, ainda vazia)
   Rota: /app/cadastros/fornecedores
   Tela: "Fornecedores — Cadastro de fornecedores homologados para compras e suprimentos."
   Mostrar: estado vazio "Cadastre o primeiro fornecedor para começar." com o botão
   "Novo fornecedor"; busca; filtros Fornecedor, CNPJ/CPF, Categoria, Status;
   botão "Exportar CSV" (desabilitado sem registros).

3. Cadastrar o fornecedor
   Ação: Novo fornecedor → gaveta "Novo fornecedor — Preencha os dados do novo fornecedor."
   Dados:
     Dados principais
       Tipo*                    Pessoa Jurídica
       Razão social*            Polar Fornecimentos OD Ltda.
       Nome fantasia            Polar
       CNPJ/CPF*                60.518.329/0001-70
     Contato
       E-mail                   comercial@polarfornecimentos.test
       Telefone                 (11) 4000-1000
       Contato                  Setor comercial
     Endereço
       CEP / Estado / Cidade    07000-000 / SP / Guarulhos
     Condições comerciais
       Categoria de fornecimento     Embalagens
       Prazo médio de entrega (dias) 3
       Condição de pagamento         28 dias
     Status                     Ativo
   Ação: Salvar
   Resultado: toast "Fornecedor criado."; a linha aparece com código gerado
   (FOR-0001 no ambiente limpo), CNPJ, Cidade/UF, Categoria e Status "Ativo".

PERSONAGEM: Rafael — Operador

4. Cadastrar os locais de estoque
   Rota: /app/cadastros/locais-estoque
   Tela: "Locais de estoque — Estrutura de armazéns, docas e áreas utilizadas para armazenagem."
   Ação: Novo local (três vezes)
   Dados:
     Código do local*  Descrição                        Depósito*                        Tipo de local*  Capacidade  Rua  Módulo
     REC-01            Doca de recebimento              PRINCIPAL — Depósito Principal   Recebimento     500         —    —
     PCK-A01           Picking — rua A, módulo 01       PRINCIPAL — Depósito Principal   Picking         120         A    01
     EXP-01            Área de expedição                PRINCIPAL — Depósito Principal   Expedição       200         —    —
   Ação: Salvar (cada um)
   Resultado: toast "Local de estoque criado."; três linhas com Código, Descrição,
   Depósito, Tipo, Capacidade e Status.
   Observação: os depósitos PRINCIPAL e ALMOX nasceram com a empresa; o Rafael só cria
   os endereços dentro deles.

PERSONAGEM: Carlos — Gerente

5. Cadastrar o produto
   Rota: /app/cadastros/produtos → Novo produto
   Dados:
     Dados principais
       Código*            BAL-08
       SKU                BAL-08-AZ
       Descrição*         Balde plástico 8 L
       Descrição curta    Balde 8 L
     Classificação
       Categoria*         Produto acabado        (lista fixa do sistema)
       Subcategoria       Geral
       Unidade de medida* UN
       Código de barras   (vazio)
       NCM                39249000
       Fornecedor         Polar Fornecimentos OD Ltda.
     Catálogo (categoria, marca e unidade relacionais)
       Categoria (catálogo)  (lista vazia — ver seção 9)
       Marca                 (lista vazia)
       Unidade (catálogo)    UN — Unidade
     Preços e custos
       Preço de custo 9,80 · Preço de venda 19,40 · Preço mínimo 17,00
     Controle de estoque
       Estoque mínimo 20 · Estoque máximo 120 · Ponto de reposição 30
       Localização padrão PCK-A01
       Lote controlado / Validade controlada  desligados
     Status  Ativo
   Ação: Salvar → toast "Produto criado."
   Repetir em ritmo rápido: BAL-12 · Balde plástico 12 L · custo 11,90 · venda 23,40
   (demais campos iguais).

6. Conferir os vínculos do produto
   Ação: clicar na linha BAL-08 → gaveta de detalhe
   Resultado: blocos "Fornecedor vinculado (1)" → Polar…; "Local de estoque padrão (1)"
   → PCK-A01; "Histórico" → linha de criação com o autor Carlos.
   Ação: abrir o fornecedor Polar → bloco "Produtos vinculados (2)" com BAL-08 e BAL-12.

7. Cadastrar os clientes
   Rota: /app/cadastros/clientes → Novo cliente
   Dados (Granito):
     Tipo* Pessoa Jurídica · Razão social / Nome* Granito Serviços OD Ltda. ·
     Nome fantasia Granito · CPF/CNPJ* 31.902.874/0001-68
     E-mail compras@granitoservicos.test · Telefone (13) 4000-2000
     CEP 11000-000 · Estado SP · Cidade Santos · Endereço Av. do Porto · Número 450
     Limite de crédito (R$) 20.000,00 · Condição de pagamento 28 dias · Status Ativo
   Ação: Salvar → toast "Cliente criado." (CLI-0001 no ambiente limpo)
   Repetir: Ferrovia Comércio OD Ltda. · 27.456.183/0001-00 · Campinas/SP · 30 dias.

8. Editar
   Ação: menu da linha (⋯) do Granito → Editar → Telefone (13) 4000-2001 → Salvar
   Resultado: toast "Cliente atualizado."; Histórico mostra "Alterado".
   Mostrar também: alterar um campo e tentar fechar a gaveta → "Descartar alterações?"
   → "Continuar editando".

9. Inativar (caso realista)
   Preparação na própria cena: Novo cliente "Boreal Varejo OD Ltda." (CNPJ fictício
   válido gerado na preparação).
   Ação: menu da linha → Inativar → toast "Cliente inativado."
   Resultado: Status "Inativo"; filtro Status = Inativo mostra o registro; menu → Ativar
   devolve o status (mostrar e inativar de novo).
   Lote: marcar duas linhas de teste → barra "Ações em lote" → "Inativar selecionados"
   → "Inativar registros selecionados?" — "N registro(s) ativo(s) serão inativados.
   Eles continuam disponíveis para consulta." → Inativar → "N registro(s) inativado(s)."

10. Tentar excluir um registro em uso
    Rota: /app/cadastros/fornecedores
    Ação: menu da linha Polar → Excluir → "Excluir fornecedor?" — "A exclusão não pode
    ser desfeita. Registros vinculados a outros cadastros não podem ser excluídos — use
    a inativação nesses casos." → Excluir
    Resultado: toast de erro "Exclusão não permitida." com o detalhe "Este fornecedor
    está vinculado a produtos cadastrados. Utilize a inativação." → nada é apagado.

PERSONAGEM: Juliana — Vendedor

11. Mostrar a diferença de papel
    Rota: /app/cadastros/clientes → menu da linha
    Resultado: Visualizar, Editar, Inativar — sem "Excluir".
    Rota: /app/cadastros/produtos → sem "Novo produto" e sem ações de edição
    (o Vendedor só consulta produtos).

PERSONAGEM: Rafael — fora da gravação

12. ⛔ Saldo de implantação (preparação para a aula 03) — ver seção 13.
```

## 6. Demonstração (o que aparece na gravação)

| Cena | Enquadramento e câmera | Destaques e callouts | Pausas e resultado |
|---|---|---|---|
| Área de Cadastros | Tela cheia; pan pelos sete cartões | Rótulo "Cadastros · a base do ERP" | 2 s |
| Lista vazia | Zoom 1,3× no estado vazio | Callout "Lista, busca, filtros, colunas e CSV: o mesmo em todos os cadastros" | 2,5 s |
| Fornecedor | Gaveta à direita; zoom 1,5× por seção | Callouts: **CNPJ/CPF** (validado pelos dígitos), **Categoria de fornecimento**, **Prazo médio de entrega** ("Compras usa para prever a chegada") | 0,8 s antes de Salvar; toast 2,5 s |
| Troca para Rafael | Pílula de personagem muda | — | — |
| Locais | Zoom no campo **Depósito** e em **Tipo de local** (lista aberta com os 9 tipos) | Quadro "Doca → Picking → Expedição" (motion sobre a planta do armazém) | 2 s na lista de tipos |
| Descrição do local | Zoom no campo **Descrição** | Callout "Preencha sempre: é o nome que aparece na reserva e no saldo" | 2 s |
| Produto | Gaveta longa; câmera desce seção a seção | Callouts: **Código** (único), **Categoria** (lista fixa), **Unidade de medida**, **NCM** ("o Fiscal usa"), **Fornecedor**, **Estoque mínimo** ("Compras usa"), **Localização padrão** | Pausa de 1,5 s em cada callout |
| Catálogo relacional | Zoom no bloco "Catálogo…" com as listas vazias | Selo ⚠️ D2 "Sem tela de cadastro nesta versão" | 2,5 s |
| Vínculos | Gaveta de detalhe do BAL-08; anel em "Fornecedor vinculado" e "Local de estoque padrão" | — | 2 s |
| Cliente | Zoom nas **Condições comerciais** | Callouts: **Limite de crédito**, **Condição de pagamento** ("vira prazo do título no Financeiro") | toast 2,5 s |
| Edição e histórico | Zoom no bloco **Histórico** | Anel em "Alterado" e no autor | 2 s |
| Descartar alterações | Diálogo centralizado | — | 2 s |
| Inativar | Zoom no selo de status Ativo → Inativo; filtro Status | Callout "Inativo não some: sai das listas de seleção" | 2 s |
| Lote | Barra "Ações em lote" | — | Diálogo 2,5 s |
| Excluir bloqueado | Diálogo vermelho → toast de erro | Quadro de erro (Mensagem · Por que · Como resolver) | **3 s** no toast |
| Juliana | Corte seco; menu da linha aberto | Anel na ausência de "Excluir" | 2 s |
| Encerramento | Lista de produtos com BAL-08 e BAL-12 | Quadro de conferência | — |

Transições: deslize lateral entre cadastros; troca de personagem com a pílula. A planta do armazém (motion) reaparece na aula 05.

## 7. Narração

**[A — Abertura]**
ATLAS.ERP Academy. Aula dois: Cadastros.

**[B — Contexto]**
Segunda-feira, nove horas. A Órbita Distribuidora existe desde as oito, mas ainda está vazia. Amanhã cedo chega o primeiro pedido: baldes plásticos para o cliente Granito. Até lá, o Carlos e o Rafael precisam montar a base.

**[C — Explicação]**
Cadastros são a fundação do ERP. Um pedido não guarda o nome do cliente digitado à mão: ele aponta para o cadastro do cliente. O mesmo vale para o produto, o fornecedor e o local de estoque. Se o cadastro está certo, preço, prazo, endereço e imposto chegam certos em todas as etapas. E existe uma ordem: o produto aponta para o fornecedor e para o local onde fica guardado. Por isso, cadastramos primeiro o fornecedor e os locais, e só depois o produto. O cliente pode vir a qualquer momento antes da venda.

**[D1 — O padrão]**
Todos os cadastros funcionam do mesmo jeito. Uma lista com busca, filtros e colunas. Um botão para criar. Um menu em cada linha para visualizar, editar, inativar ou excluir. E uma gaveta com o detalhe do registro. Aprendeu um, aprendeu todos.

**[D2 — Fornecedor]**
Comece pelo fornecedor. Em Fornecedores, clique em Novo fornecedor. Razão social e CNPJ são obrigatórios, e o sistema confere os dígitos do CNPJ. Em condições comerciais, informe a categoria de fornecimento e o prazo médio de entrega: o setor de compras usa esse prazo para saber quando a mercadoria deve chegar. Salve.

**[D3 — Locais]**
Agora é a vez do Rafael, que conhece o armazém. A Órbita já nasceu com dois depósitos: o Depósito Principal e o Almoxarifado. Dentro do principal, o Rafael cria três endereços: a doca, onde a mercadoria chega; o picking, de onde ela sai para os pedidos; e a área de expedição. O tipo de local diz para que serve cada endereço. E preencha sempre a descrição: é por ela que o local aparece na hora de reservar estoque.

**[D4 — Produto]**
Com fornecedor e locais prontos, o Carlos cadastra o produto. O código é único. A categoria vem de uma lista do sistema. A unidade de medida é unidade. O NCM é a classificação fiscal, que a nota fiscal vai usar. Escolha o fornecedor. Depois, preço de custo, preço de venda e o preço mínimo, abaixo do qual não se deve vender. No controle de estoque, o estoque mínimo é vinte. É esse número que o comprador vai comparar com o saldo. E a localização padrão é o picking da rua A.

**[D5 — Vínculos]**
Abra o produto. Repare nos vínculos: o fornecedor e o local padrão aparecem aqui. E, no fornecedor, os dois baldes aparecem como produtos vinculados.

**[D6 — Cliente]**
Por último, os clientes. Limite de crédito e condição de pagamento parecem detalhes, mas não são: a condição de pagamento vira o vencimento do título no financeiro.

**[E — Resultado]**
Em pouco mais de uma hora, a Órbita tem um fornecedor, três locais, dois produtos e dois clientes. Tudo com código, status ativo e histórico de quem criou. A base está pronta para a primeira venda.

**[F — Erros e exceções]**
Agora, o que pode dar errado. Um CNPJ com dígito errado não passa. Um documento ou um código repetido também não. Se o estoque máximo for menor que o mínimo, o sistema avisa. E veja o que acontece quando o Carlos tenta excluir a Polar: exclusão não permitida, porque há produtos vinculados a ela. O caminho certo é inativar. O registro inativo não some: continua na consulta e no histórico, mas sai das listas de seleção. Por fim, cada papel vê só o que pode fazer. A Juliana, vendedora, cadastra e edita clientes, mas não vê a opção de excluir.

Duas observações honestas sobre esta versão. Categoria, marca e unidade relacionais ainda não têm tela de cadastro: por isso a categoria do produto vem de uma lista fixa. E o perfil fiscal do produto, que a nota fiscal usa, também ainda não tem tela. Vamos tratar disso na aula de Fiscal.

**[G — Exercício]**
Sua vez. Cadastre um terceiro produto, um balde de vinte litros, com o mesmo fornecedor e o mesmo local padrão. Depois, crie um cliente de teste, inative esse cliente e encontre-o pelo filtro de status.

**[H — Fechamento]**
Resumindo: primeiro fornecedor e locais, depois produtos, e os clientes antes da venda. Inativar, e não excluir, o que já foi usado. Na próxima aula, o Granito faz o pedido e a Juliana entra em ação.

## 8. Estados e fluxo

```
STATUS DE UM CADASTRO
Ativo ──(Inativar)──► Inativo ──(Ativar)──► Ativo
  │
  └──(Excluir)──► excluído        só se nada aponta para ele; senão: "Exclusão não permitida."

USO DOS CADASTROS PELOS MÓDULOS
Fornecedor ──► Compras (pedido de compra, recebimento) ──► Financeiro (contas a pagar)
Local      ──► Estoque (saldo por local, reserva, transferência) ──► Logística (separação, expedição)
Produto    ──► Comercial (itens) · Compras (itens, estoque mínimo) · Estoque (saldo) · Fiscal (NCM)
Cliente    ──► Comercial (orçamento, pedido) ──► Financeiro (contas a receber) ──► Fiscal (NF-e)
```

**Entrada:** a empresa criada (aula 01), com os depósitos `PRINCIPAL` e `ALMOX` e as 10 unidades de medida automáticas.
**Processamento:** cadastro, edição, inativação.
**Resultado:** 1 fornecedor, 3 locais, 2 produtos, 2 clientes ativos; o histórico de cada registro.
**Segue para:** Comercial (aula 03) → Compras (aula 04) → Estoque/WMS (aula 05).

## 9. Erros e exceções

| Situação | Mensagem apresentada | Causa | Impacto | Como identificar | Solução | Bug? |
|---|---|---|---|---|---|---|
| Salvar com campos obrigatórios vazios | Alerta "Revise os campos destacados" — "Há N campos com problema." + mensagem no campo (ex.: "Informe o CPF/CNPJ.", "Informe a razão social.", "Selecione a categoria.", "Selecione o depósito.") | Campos obrigatórios | Não salva | Alerta no topo da gaveta e campos em vermelho | Preencher | não |
| CNPJ com dígito errado | "CNPJ inválido: confira os dígitos verificadores." | Documento inválido | Não salva | Mensagem no campo | Conferir com o cliente/fornecedor | não |
| Documento repetido | "Já existe um cliente com este documento." / "Já existe um fornecedor com este documento." (na tela) · "Já existe um registro com este documento (CPF/CNPJ)." (no servidor) | Duplicidade | Não salva | Mensagem no campo ou toast | Buscar o registro existente | não |
| Código repetido | "Já existe um produto com este código." / "Já existe um local com este código." | Duplicidade | Não salva | Mensagem no campo | Usar outro código ou editar o existente | não |
| Estoque máximo menor que o mínimo | "O estoque máximo deve ser maior ou igual ao mínimo." | Regra do produto | Não salva | Mensagem no campo | Corrigir os limites | não |
| Fechar a gaveta com alterações | "Descartar alterações?" (Descartar / Continuar editando) | Proteção contra perda | — | Diálogo | Decidir conscientemente | não |
| Excluir fornecedor com produtos | Toast "Exclusão não permitida." — "Este fornecedor está vinculado a produtos cadastrados. Utilize a inativação." | Registro em uso | Nada é apagado | Toast vermelho | **Inativar** | não |
| Excluir local que é padrão de produto | "Exclusão não permitida." — "Este local está definido como localização padrão de produtos cadastrados. Utilize a inativação." | Registro em uso | Nada é apagado | Toast vermelho | Inativar ou trocar o local padrão | não |
| Operador ou Vendedor procura "Excluir" | — (opção ausente) | O papel não tem a permissão de excluir | — | Menu da linha sem "Excluir" | Pedir ao Gerente ou Administrador | não |
| Vendedor procura "Novo produto" | — (botão ausente) | O Vendedor só consulta produtos | — | Lista sem botão | Pedir ao Gerente ou Operador | não |
| Gaveta do cliente: "Pedidos de venda (0)" mesmo com pedidos | "Nenhum registro vinculado." | A lista de pedidos do cliente ainda não é carregada (sempre vazia); o mesmo vale para "Pedidos de compra" no fornecedor | Pode sugerir que o cliente não tem pedidos | Comparar com Pedidos de venda filtrados pelo cliente | Consultar em Comercial → Pedidos de venda | ⚠️ D4 (novo) |
| Categoria (catálogo), Marca: listas vazias | — | Não há tela para criar categoria, marca ou unidade; criar categoria pela API falha | Produto fica sem categoria relacional | Listas vazias no bloco "Catálogo…" | Usar a **Categoria** da lista fixa (obrigatória) | ⚠️ D2 · B8 |
| Local sem descrição | — (o local não aparece na janela "Reservar estoque"; no Saldo aparece como identificador curto) | A tela mostra o local pela descrição | Reserva impossível naquele local pela tela | Lista de locais da reserva sem o código | **Preencher sempre a Descrição** | ⚠️ D8 (novo, derivado do código; confirmar na preparação) |
| Perfil fiscal do produto | — | ⛔ não há tela; a NF-e depende dele | A NF-e não sai só com o NCM do cadastro | Aula 07 | Fora do escopo desta aula | ⛔ D3 |
| Valor fora da lista enviado pela API | Erro 500 genérico | Validação incompleta no servidor | — | — | Não ocorre pela tela | ⚠️ B13 (não provocar) |
| Mensagens técnicas em inglês | "Invalid input…" | Casos de borda da API | — | — | Não ocorre no fluxo da aula | ⚠️ B14 (não provocar) |

## 10. Exercício prático

1. Cadastre o produto **BAL-20 · Balde plástico 20 L** (Produto acabado, UN, NCM 39249000, fornecedor Polar, local padrão PCK-A01, custo 16,50, venda 31,90, estoque mínimo 10 e máximo 60).
2. Tente salvar com estoque máximo 5 e leia a mensagem. Corrija.
3. Cadastre um cliente de teste com um CNPJ fictício válido e, de propósito, digite um dígito errado antes. Leia a mensagem.
4. Inative o cliente de teste e encontre-o pelo filtro **Status**.
5. Abra a Polar e confira os **Produtos vinculados** (agora três).
6. **Pergunta:** por que o sistema não deixa excluir a Polar? O que você faria se a Órbita deixasse de comprar dela?

## 11. Checklist de conclusão

- [ ] Sei a ordem: fornecedor e locais antes do produto; clientes antes da venda.
- [ ] Reconheço o padrão comum (lista, filtros, CSV, menu da linha, gaveta, lote).
- [ ] Cadastrei fornecedor, local, produto e cliente.
- [ ] Sei para que servem estoque mínimo, local padrão, NCM, limite de crédito e condição de pagamento.
- [ ] Editei um registro e encontrei a alteração no Histórico.
- [ ] Inativei e reativei um registro; inativei em lote.
- [ ] Entendi por que a exclusão de um registro em uso é bloqueada.
- [ ] Sei o que cada papel pode fazer nos cadastros.
- [ ] Sei o que ainda não tem tela (categoria/marca/unidade relacionais, perfil fiscal).

## 12. Evidências

Salvar em `docs/academy/02-cadastros/evidencias/`:

| # | Captura | Comprova |
|---|---|---|
| 01 | `01-fornecedores-vazio.png` | Estado vazio e o padrão da lista |
| 02 | `02-fornecedor-polar.png` | Fornecedor criado (código, CNPJ, Ativo) |
| 03 | `03-locais.png` | REC-01, PCK-A01, EXP-01 no Depósito Principal |
| 04 | `04-produto-formulario.png` | BAL-08 com classificação, preços e controle de estoque |
| 05 | `05-produto-catalogo-vazio.png` | Bloco "Catálogo…" com listas vazias (D2) |
| 06 | `06-produto-vinculos.png` | Fornecedor vinculado e local padrão |
| 07 | `07-fornecedor-produtos-vinculados.png` | Produtos vinculados (2) |
| 08 | `08-clientes.png` | Granito e Ferrovia ativos |
| 09 | `09-historico-alterado.png` | Histórico com "Criado" e "Alterado" |
| 10 | `10-inativo-filtro.png` | Cliente inativo encontrado pelo filtro |
| 11 | `11-exclusao-bloqueada.png` | "Exclusão não permitida." |
| 12 | `12-erro-cnpj.png` | "CNPJ inválido…" |
| 13 | `13-juliana-sem-excluir.png` | Menu da linha do Vendedor |
| 14 | `14-saldo-implantacao.png` | Saldo do BAL-08 em PCK-A01 = 12 (preparação ⛔) |

## 13. Preparação técnica

| Item | Endpoint / como | Usuário | Motivo | Dados | Resultado esperado |
|---|---|---|---|---|---|
| Contas da equipe | Convites aceitos (aula 10, fora de cena) | Ana | Personagens com o papel real | Carlos Gerente, Rafael Operador, Juliana Vendedor | Cada um entra com o próprio menu |
| CNPJ do cliente "Boreal" e do exercício | Gerador local de CNPJ válido (fictício) | — | O sistema valida os dígitos | — | Passa na validação |
| **⛔ Saldo de implantação** | `POST /api/stock-movements/receive` | Rafael (`stock.create`) | A aula 03 precisa de estoque para reservar. Na implantação real, é a contagem física inicial; nesta versão, a entrada avulsa **não tem tela** | `{ productId: <BAL-08>, locationId: <PCK-A01>, quantity: 12, unitCost: 9.80 }` | Movimentações: **Entrada · Picking — rua A, módulo 01 · 12 · origem `manual`**. Saldo: em estoque 12, reservado 0, disponível 12 |
| Confirmar D8 | Criar um local sem descrição num ambiente descartável e abrir "Reservar estoque" | Rafael | Confirmar o débito antes de ensiná-lo | — | Registrar o resultado em MAPEAMENTO |

- **Na gravação**, o saldo de implantação aparece como quadro ⛔ "Preparado fora da interface" no fim da aula (ou na abertura da aula 03): *"Nesta versão, a entrada avulsa de estoque não tem tela. O saldo inicial foi registrado por integração, com o usuário Rafael (Operador)."*
- **Irreversível?** A entrada de estoque é um movimento imutável (só se corrige com ajuste). Executar **só** no ambiente Academy.
- **Sem ambiente limpo:** os códigos gerados (FOR-, CLI-) seguem a numeração global (⚠️ B3) e não serão 0001; os nomes BAL-08/BAL-12 e REC-01/PCK-A01/EXP-01 podem já existir em outra empresa sem conflito (o código é único por empresa).

## Estrutura de cenas do vídeo

| Bloco | Cena | Tempo | Conteúdo |
|---|---|---|---|
| A | Abertura | 0:00–0:09 | Núcleo → "ATLAS.ERP Academy" → "02 · Cadastros" |
| B | Contexto | 0:09–0:40 | Fundo escuro: "Segunda, 9h" · base vazia · pílulas Carlos e Rafael |
| C | Explicação | 0:40–1:50 | Diagrama de dependência (locais + fornecedor → produto; cliente → pedido); quadro "quem pode o quê" |
| D1 | O padrão | 1:50–2:30 | Lista vazia de fornecedores, menu da linha, gaveta |
| D2 | Fornecedor | 2:30–4:00 | Polar campo a campo |
| D3 | Locais | 4:00–5:30 | Rafael: REC-01, PCK-A01, EXP-01; planta do armazém em motion |
| D4 | Produto | 5:30–8:00 | BAL-08 seção a seção; BAL-12 rápido; selo ⚠️ D2 |
| D5 | Vínculos | 8:00–8:40 | Gaveta do produto e do fornecedor |
| D6 | Cliente | 8:40–10:00 | Granito; Ferrovia rápido; editar e Histórico |
| E | Resultado | 10:00–10:40 | Quadro de conferência: 1 fornecedor, 3 locais, 2 produtos, 2 clientes |
| F | Erros | 10:40–14:10 | CNPJ inválido, duplicado, máx < mín, descartar; inativar e lote; exclusão bloqueada; Juliana sem Excluir; débitos D2/D3/D4 |
| — | Quadro ⛔ | 14:10–14:35 | Saldo de implantação: 12 baldes no Picking |
| G | Exercício | 14:35–15:00 | Tela de exercício |
| H | Fechamento | 15:00–15:20 | 3 linhas de resumo → "Próxima aula: Comercial" → lockup |
