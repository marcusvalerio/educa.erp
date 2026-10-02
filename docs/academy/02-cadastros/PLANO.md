# Aula 02 — Cadastros

| | |
|---|---|
| **Público** | Administrador, Gerente, Operador e usuários autorizados (o Vendedor cria e edita clientes) |
| **Personagens** | **Carlos** — Gerente (clientes, produtos, fornecedores) · **Rafael** — Operador (locais de estoque) · **Juliana** — Vendedor (cliente, no caso realista) |
| **Viabilidade** | ✅ CRUD completo em 7 cadastros · ⚠️ categoria (B8) · ⛔ marca, unidade, perfil fiscal, tabela de preços |
| **Duração estimada** | 14–17 min |
| **Aula piloto sugerida** | sim (100% interface real) |

**O aluno sai sabendo:** fazer o ciclo **criar → consultar → editar → inativar → usar em uma operação** e entender por que o ERP **inativa** em vez de excluir um registro em uso. Também aprende o que é preciso cadastrar antes da primeira venda e da primeira compra.

## Cenário

**Segunda-feira, 9h.** A Órbita foi configurada pela Ana (aula 10), mas a base está vazia. Antes da primeira venda, Carlos precisa:

- cadastrar o cliente **Granito Serviços OD Ltda.**;
- cadastrar o fornecedor **Polar Fornecimentos OD**;
- cadastrar os produtos **Balde plástico 8 L** e **12 L**.

Rafael cria os locais **Doca de recebimento** e **Picking — rua A, módulo 01**.

## Roteiro por parte

| # | Parte | Conteúdo | Telas / ações |
|---|---|---|---|
| 01 | Introdução | "Cadastros são a fundação: tudo o que o ERP faz depois — vender, comprar, estocar, faturar — aponta para um cliente, um fornecedor, um produto, um local." | — |
| 02 | Cenário | Carlos, Gerente, 9h, base vazia. | Menu → Cadastros |
| 03 | Navegação | O padrão é o mesmo em todos os cadastros: **busca**, filtros (Tipo, Status), colunas configuráveis, exportar CSV, ações do registro, ações em lote, gaveta de detalhe com **registros relacionados**. "Aprendeu um, aprendeu todos." | `/cadastros/*` |
| 04 | Operação principal | **Cliente** em detalhe: **Novo cliente** → Tipo (Pessoa Física/Jurídica), razão social, CPF/CNPJ, contato, endereço, condições comerciais (limite de crédito, condição de pagamento) → salvar → aparece na lista → abrir → **Editar** (alterar telefone) → salvar. **Produto**: código, descrição, **Classificação** (categoria da lista fixa, subcategoria, unidade **UN**, código de barras, **NCM**, fornecedor), preços e custos, estoque mínimo e máximo, local padrão. **Fornecedor**: em ritmo mais rápido, mesmo padrão. **Local de estoque** (Rafael): código, descrição, tipo (Armazenagem, Picking, Expedição, Recebimento), capacidade. | ✅ |
| 05 | O que acontece no ERP | Animação: cliente → pedidos (aula 03); produto → estoque e NF-e (aulas 05 e 07); fornecedor → compras (04); local → reserva e separação (05 e 08). Mostrar na gaveta do cliente o bloco **"Pedidos de venda"** (registros relacionados). | motion + gaveta |
| 06 | Caso realista | O cliente **Sofia Cordeiro** encerrou as atividades: **Inativar** (não some; o filtro Status mostra os inativos; volta com **Ativar**). Inativação **em lote** de dois cadastros de teste. **Excluir** um cliente **com pedido** é bloqueado (erro abaixo). **Juliana (Vendedor)** cria um cliente: ela pode criar e editar, mas **não vê "Excluir"**. | ✅ |
| 07 | Erros e exceções | Ver tabela. | ✅ |
| 08 | Conferência | Lista filtrada por Status; código gerado (CLI-0001…); gaveta com dados e relacionados; **Auditoria** (aula 09) com a criação do cliente. | ✅ 🔎 |
| 09 | Relação | Cadastros → Comercial → Estoque → Compras → Fiscal. **O que ainda não tem tela**: categoria (⚠️ B8), marca, unidade, **perfil fiscal do produto** (⛔ D3, do qual a NF-e depende) e tabela de preços. Selo ⛔ e explicação. | motion |

## Erros e exceções (reais)

| Erro | Por que | Como resolver |
|---|---|---|
| *"Revise os campos destacados"* / *"Há 1 campo com problema."* / *"Informe o CPF/CNPJ."* | Campos obrigatórios vazios | Preencher os campos destacados |
| *"CNPJ inválido: confira os dígitos verificadores."* | Dígitos verificadores errados | Conferir o documento com o cliente |
| *"Já existe um cliente com este documento."* / *"…produto com este código."* / *"…local com este código."* | Duplicidade | Buscar o registro existente |
| *"O estoque máximo deve ser maior ou igual ao mínimo."* | Regra do produto | Corrigir os limites |
| **Excluir** registro em uso: *"Exclusão não permitida… Utilize a inativação."* | Há pedidos ou movimentos ligados | **Inativar** |
| *"Descartar alterações?"* | Fechar o formulário sem salvar | **Continuar editando** ou descartar |
| Vendedor não vê **Excluir** | Papel sem `customers.delete` | Pedir ao Gerente ou Administrador |
| ⚠️ **B8**: criar categoria falha | Bug conhecido | Usar a categoria da lista fixa; registrar para correção |

## Telas usadas

| Tela | Rota | Usuário | Legenda |
|---|---|---|---|
| Clientes | `/app/cadastros/clientes` | Carlos, Juliana | ✅ |
| Produtos | `/app/cadastros/produtos` | Carlos | ✅ |
| Fornecedores | `/app/cadastros/fornecedores` | Carlos | ✅ |
| Locais de estoque | `/app/cadastros/locais-estoque` | Rafael | ✅ |
| Transportadoras · Motoristas · Veículos | `/app/cadastros/…` | Carlos | ✅ (mostrados de passagem; aprofundados na aula 08) |

## Preparação de cena

- Na aula de cadastros, não há pedido para mostrar nos relacionados. A gaveta "Pedidos de venda" e o bloqueio de exclusão precisam de um pedido do cliente, criado ⛔ pela API **antes da parte 05**, com aviso.
- A unidade **UN** já vem com a empresa.

## Observações

- Validar ao vivo que o produto salva com todos os campos (o manual de 27/09 dizia "Produtos não carrega"; corrigido depois).
- Mensagens técnicas (B14, B15) podem surgir em casos de borda. Não provocar na gravação; citar só se fizerem parte do fluxo.
