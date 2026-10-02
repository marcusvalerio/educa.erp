# ATLAS.ERP Academy — Mapeamento do sistema real

Este é o levantamento que fundamenta o plano das aulas. Ele foi feito no código (`src/app`, `src/lib/nav.ts`, `src/lib/status.ts`, componentes e rotas de API) e confirmado **ao vivo** no ambiente local de homologação (build de produção, PostgreSQL, dublê do Neon Auth), com a sessão de cada papel da empresa demo.

As fontes de bugs são o [relatório do teste com 7 empresas](../homologacao/evidencias/e2e-7-empresas.md) e os [manuais](../manual/).

**Data:** 02/10/2026 (correções de interface aplicadas na `main` em `48775f5`) · **código:** `a33842b`, revalidado em `2b9112b` para as aulas 01–05 (branch `claude/e2e-empresa-nova-correcoes`).

**Legenda** (a mesma dos manuais):

| Símbolo | Significado |
|---|---|
| ✅ | Ação disponível na interface |
| 🔎 | Tela só de consulta (lista, filtros, busca, detalhe, exportação) |
| ⛔ | Existe só pela API / integração (não há tela de ação) |
| ⚠️ | Débito ou bug conhecido |

---

## 1. Conclusão principal

A plataforma tem uma **API operacional completa** e uma **interface de ação concentrada em poucos lugares**:

- A **Administração Central**, a **Administração da Empresa** e os **Cadastros** têm CRUD e ações reais pela interface.
- O **pedido de venda** tem ações reais no detalhe: enviar, aprovar, reservar, liberar reserva, gerar conta a receber e cancelar.
- O CRM permite **mover oportunidades** no pipeline, desde que o pipeline já exista (não há tela para configurá-lo).
- **Compras, Estoque/WMS, Logística, Financeiro (baixas) e Fiscal** são, na interface, **telas de consulta**. Criar pedido de compra, receber mercadoria, separar, expedir, dar baixa em título e gerar NF-e só é possível pela API.

**Impacto direto na Academy:** uma aula "do início ao fim, onde clicar e o que preencher" só é integralmente possível hoje em **4 das 10 aulas** (01, 02, 09, 10). Duas aulas são **mistas** (03 e 06). As outras quatro (04, 05, 07, 08) ensinariam principalmente a **acompanhar e conferir** operações registradas fora da interface. A decisão sobre isso está no [README](README.md#decisões-para-validar).

---

## 2. Telas e ações por módulo

110 rotas no total; as que são só redirecionamento foram omitidas.

### Administração Central (`/app/admincentral`) — Owner e Admin da plataforma

| Tela | Rota | Ações |
|---|---|---|
| Visão geral | `/admincentral` | 🔎 contadores, ciclo de vida, adoção de módulos, aviso de isolamento |
| Empresas | `/admincentral/companies` | ✅ **Nova empresa** (assistente com unidade inicial) · ✅ convidar administrador da empresa · ✅ detalhe · ✅ **aplicar ciclo de vida** (Avaliação/Ativa/Suspensa/Cancelada + motivo) · ✅ contratar/descontratar módulos |
| Módulos | `/admincentral/modules` | 🔎 catálogo e adoção (a manutenção do catálogo "Só Owner" não tem tela) |
| Membros da plataforma | `/admincentral/platform-members` | ✅ convidar membro (Owner/Admin) · ✅ editar nome, papel e status |
| Permissões | `/admincentral/permissions` | 🔎 Owner × Admin |
| Auditoria | `/admincentral/audit` | 🔎 trilha da plataforma |
| Políticas | `/admincentral/settings` | 🔎 regras de governança e documentação (manuais) |

### Administração da Empresa (`/app/admin`) — Administrador

| Tela | Ações |
|---|---|
| Visão geral | 🔎 pendências de configuração (usuários sem unidade, sem setor ou cargo) |
| Usuários | ✅ **Convidar usuário** (nome, e-mail, papel) · ✅ cadastro de usuários (pessoa sem convite) · ✅ atribuir e remover papéis · ✅ vincular unidades · ✅ setor e cargo · ✅ reenviar ou cancelar convite · ✅ desativar e reativar acesso |
| Papéis e permissões | ✅ **Novo papel** · ✅ editar papel · ✅ matriz de permissões (marcar, salvar, descartar) |
| Setores · Cargos · Unidades | ✅ criar, editar, ativar/inativar |
| Módulos | ✅ habilitar/desabilitar os módulos **contratados** |
| Configurações | ✅ regras de **foco dos painéis** por público |
| Auditoria | 🔎 trilha da empresa |

### ERP (`/app`)

| Módulo | Tela | Ações |
|---|---|---|
| Início | `/app` | 🔎 resumo, "Precisa de atenção", "O que mudou", fluxo do ERP · ⚠️ B6 |
| Painéis | `/gestao/dashboard/*` (13) | 🔎 |
| **Comercial** | Orçamentos | 🔎 (criar, enviar, aprovar ⛔) |
| | Pedidos de venda (lista) | 🔎 (criar ⛔ — **B1**) |
| | **Pedido de venda (detalhe)** | ✅ **Enviar para aprovação** · ✅ **Aprovar** · ✅ **Reservar estoque** (escolhe o local) · ✅ **Liberar reserva** · ✅ **Gerar conta a receber** · ✅ **Cancelar pedido** · 🔎 andamento, itens, expedições, financeiro, histórico |
| | Faturamento | 🔎 (documentos fiscais) |
| CRM | Leads · Oportunidades · Atividades | 🔎 |
| | Pipeline | ✅ mover oportunidade de etapa (⚠️ só com pipeline e estágios existentes: a empresa nova nasce sem eles e não há tela para criá-los) |
| **Suprimentos** | Solicitações · Cotações · Pedidos de compra · Agendamentos | 🔎 (todo o ciclo ⛔) |
| **Logística e Estoque** | Recebimento · Estoque (saldos) · Movimentações · Transferências · Inventário · Endereçamento · Almoxarifado · Picking · Packing · Expedição · Transportes · Devoluções | 🔎 (todas as operações ⛔) |
| **Financeiro** | Contas a pagar · Contas a receber · Fluxo de caixa · Centros de custo · painel | 🔎 (baixa, pagamento e lançamento ⛔) |
| **Fiscal** | Painel (checklist "Preparação para a primeira NF-e") · Notas fiscais · NF-e · NCM · CFOP · Regras tributárias | 🔎 (gerar, calcular, "pronta" e cadastros fiscais ⛔; autorização SEFAZ: sem certificado) |
| Controladoria | Relatórios · Auditoria | 🔎 |
| **Cadastros** | Produtos · Clientes · Fornecedores · Transportadoras · Motoristas · Veículos · Locais de estoque | ✅ **criar · consultar · editar · ativar/inativar · excluir** (bloqueado se em uso) · ✅ inativar em lote · ✅ exportar CSV · 🔎 registros relacionados na gaveta |
| Configurações | Parâmetros | 🔎 |
| | Dados da empresa | ⚠️ **nenhum papel abre** (exige `companies.read`, que nenhum papel tem) |
| | Aparência | ✅ tema |
| | Documentação | ✅ manuais em PDF |
| Fora do escopo da Academy | Produção · Qualidade · Projetos · Ativos | 🔎 (criação ⛔) |

**Categorias, marcas e unidades:** não têm tela própria nem item de menu.

- No formulário do produto, "Categoria/Subcategoria" usa uma **lista fixa**.
- O bloco "Catálogo (categoria, marca e unidade relacionais)" usa as tabelas relacionais. Confirmado ao vivo numa empresa nova:
  - **categorias: 0 registros**, e a criação falha (⚠️ **B8**, hoje com a mensagem técnica "Invalid input: expected string, received undefined");
  - **marcas: 0**;
  - **unidades de medida: 10, criadas com a empresa** (UN, KG, G, L, ML, M, CM, CX, FD, PAL).
- Não há tela para criar marca ou unidade (⛔).

**O que nasce com a empresa** (criação pela Central): papéis padrão, unidade inicial, **todos os módulos da plataforma contratados e habilitados** (a Central descontrata o que não faz parte do plano), os depósitos **Depósito Principal** (`PRINCIPAL`) e **Almoxarifado Operacional** (`ALMOX`) e as 10 unidades de medida. **Não** nascem: locais de estoque, categorias, marcas, condições de pagamento, tabelas de preço nem pipelines/estágios do CRM.

**Códigos gerados:** clientes `CLI-0001`, fornecedores `FOR-0001`, orçamentos `ORC-`, pedidos `PV-`, solicitações `SC-`, pedidos de compra `PC-`, recebimentos `REC-`, transferências `TRF-`, contas a receber `CR-`, contas a pagar `CP-`. A numeração é **global entre empresas** (⚠️ B3). Produto e local de estoque têm código digitado, único por empresa.

**Dados fiscais do produto:** o campo NCM existe no cadastro do produto. Porém a NF-e usa o **perfil fiscal do produto**, que **não tem tela** (⛔). O próprio painel Fiscal avisa: *"o perfil ainda sem tela de cadastro nesta versão"*.

---

## 3. Operações que existem só pela API (⛔)

| Área | Operações sem tela |
|---|---|
| Comercial | criar, enviar, aprovar, recusar e expirar orçamento · criar pedido (de orçamento ou avulso) · gerar NF-e do pedido · criar separação e expedição a partir do pedido |
| Compras | solicitação (criar, enviar, aprovar, recusar) · cotação (enviar, responder, selecionar fornecedor) · pedido de compra (criar, enviar para aprovação, aprovar, enviar ao fornecedor, encerrar) · recebimento (lançar, conferir item, confirmar, recusar) · gerar conta a pagar e NF de entrada do recebimento |
| Estoque | entrada e saída avulsas · ajuste · transferência (enviar e receber) · contagem/inventário · requisição de almoxarifado · consumo e liberação de reserva avulsa |
| Logística | lista de separação (iniciar, separar item, concluir) · expedição (liberar, embalar, volumes, aprovar, expedir, transporte, entregar, falha de entrega, concluir) |
| Financeiro | lançar CR e CP avulsos · **baixa** (receber parcela) · **pagamento** · cancelar título · contas financeiras · conciliação |
| Fiscal | estabelecimento emitente · natureza de operação · NCM · CFOP · regras tributárias · perfil fiscal do produto · gerar, calcular e marcar "pronta" a NF-e · numerar · autorizar (sem provedor nem certificado neste ambiente) · cancelar |
| Cadastros | categoria (⚠️ B8) · marca · unidade de medida · tabela de preços · condições de pagamento |
| Plataforma | manutenção do catálogo de módulos |
| Outros | importação · workflows (só o sino de pendências tem tela) |

---

## 4. Papéis e permissões reais (empresa demo, ao vivo)

**Papéis de sistema:** Administrador, Gerente, Operador, Vendedor e Somente leitura. **Papéis personalizados** (criados pelo administrador): Financeiro, Fiscal e Logística. Plataforma: **Owner** e **Admin**.

| Permissão-chave | Admin (360) | Gerente (340) | Vendedor (40) | Operador (258) | Financeiro* (43) | Fiscal* (44) | Logística* (43) | Só leitura (105) |
|---|---|---|---|---|---|---|---|---|
| Criar/editar cliente | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Excluir cliente | ✅ | ✅ | — | — | — | — | — | — |
| Criar produto/fornecedor | ✅ | ✅ | — | ✅ | — | — | — | — |
| Criar local de estoque | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Criar orçamento/pedido (API) | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Enviar pedido p/ aprovação | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| **Aprovar pedido / orçamento** | ✅ | ✅ | — | — | — | — | — | — |
| **Reservar estoque** | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Liberar reserva (`sales_orders.update`) | ✅ | ✅ | ✅ | ✅ | — | — | — | — |
| Cancelar pedido | ✅ | ✅ | — | — | — | — | — | — |
| Compras: criar solicitação/pedido | ✅ | ✅ | — | ✅ | — | — | — | — |
| Compras: aprovar | ✅ | ✅ | — | — | — | — | — | — |
| Recebimento: lançar / confirmar | ✅/✅ | ✅/✅ | — | ✅/✅ | — | — | —/✅ | — |
| Estoque: ver saldo | ✅ | ✅ | ✅ | ✅ | — | — | ✅ | ✅ |
| Estoque: entrada avulsa e transferência (API) | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Estoque: ajustar · aprovar | ✅ · ✅ | ✅ · ✅ | — | — · — | — | — | — · — | — |
| Gerar conta a pagar do recebimento (`accounts_payable.approve`) | ✅ | ✅ | — | — | ✅ | — | — | — |
| Excluir fornecedor, produto, local | ✅ | ✅ | — | — | — | — | — | — |
| Separação / expedição | ✅ | ✅ | — | ✅ | — | — | ✅ | — |
| Aprovar expedição | ✅ | ✅ | — | — | — | — | ✅ | — |
| **Gerar conta a receber** (`accounts_receivable.approve`) | ✅ | ✅ | — | — | ✅ | — | — | — |
| Ver CR/CP | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ |
| Criar CP | ✅ | ✅ | — | ✅ ⚠️B9 | ✅ | — | — | — |
| Pagamentos/recebimentos (API) | ✅ | ✅ | — | criar | ✅ | — | — | ver |
| NF-e: ver / criar e atualizar | ✅/✅ | ✅/✅ | — | ✅/✅ | — | ✅/✅ | — | ✅/— |
| NCM/CFOP: criar | ✅ | ✅ | — | ✅ ⚠️B9 | — | ✅ | — | — |
| Auditoria | ✅ | ✅ | — | ✅ | — | — | — | ✅ ⚠️B10 |
| Usuários: ver / convidar | ✅/✅ | ✅/— | — | ✅/— | — | — | — | ✅ ⚠️B10/— |
| Papéis: ver / gerenciar | ✅/✅ | —/— | — | ✅/— | — | — | — | ✅ ⚠️B10/— |
| Foco dos painéis | ✅ | — | — | — | — | — | — | — |
| Dados da empresa (`companies.read`) | — ⚠️ | — | — | — | — | — | — | — |

\* papel personalizado.

**Menus visíveis por papel** (confirmado ao vivo):

- **Vendedor:** Comercial, CRM, Estoque (consulta), Relatórios, Produtos e Clientes.
- **Financeiro:** Financeiro e Pedidos de venda.
- **Fiscal:** Fiscal, Faturamento e Pedidos de venda.
- **Logística:** Pedidos de venda, todo o menu Logística (Agendamentos, Recebimento, Estoque, Movimentações, Transferências, Inventário, Endereçamento, Almoxarifado, Picking, Packing, Expedição, Transportes, Devoluções), Relatórios e os cadastros (consulta, exceto Locais de estoque, que cria e edita).
- **Admin, Gerente, Operador e Somente leitura:** todos os módulos.

---

## 5. Fluxo real entre módulos

```
CRM (oportunidade) ─ ─ ─► Orçamento ⛔ ──► Pedido ⛔
                                         │ Enviar ✅ → Aprovar ✅ (Gerente)
                                         ├──► Reserva ✅ ──► movimento de estoque (stock_reservation)
                                         │        └──► Separação ⛔ ──► Expedição ⛔ ──► Entrega ⛔
                                         ├──► Conta a receber ✅ (Financeiro) ──► Baixa ⛔
                                         └──► NF-e ⛔ ──► Calculada ⛔ ──► Pronta ⛔ ──► [Autorização: sem certificado]
Solicitação ⛔ ──► Cotação ⛔ ──► Pedido de compra ⛔ ──► Recebimento ⛔ ──► entrada de estoque (PURCHASE_RECEIPT)
                                                                └──► Conta a pagar ⛔ · NF de entrada ⛔
Tudo ─────► Auditoria 🔎 (⚠️ B7: criações de pedido, movimento, separação e expedição não aparecem)
```

**Status reais** (`src/lib/status.ts`):

| Documento | Status |
|---|---|
| Pedido de venda | Rascunho → Aguardando aprovação → Aprovado → Reserva pendente / Reservado → Em separação → Pronto p/ expedir → Expedido parcial / Expedido → Concluído (⚠️ B11: nunca chega a "Concluído") · Cancelado |
| Orçamento | Rascunho → Enviado → Aprovado / Recusado / Expirado · Cancelado |
| Solicitação de compra | Rascunho → Solicitada → Aprovada / Recusada → Pedido parcial / Pedida → Concluída |
| Pedido de compra | Rascunho → Aguardando aprovação → Aprovado → Enviado → Recebido parcial / Recebido → Encerrado |
| Recebimento | Rascunho → Confirmado / Recusado |
| Separação | Pendente → Separando → Concluída |
| Expedição | Rascunho → Liberada → Em separação → Embalada → Pronta p/ expedir → Expedida → Em trânsito → Entregue → Concluída |
| Conta a receber / a pagar | Em aberto → Recebido (Pago) parcial → Recebido (Pago) · Vencido · Cancelado |
| NF-e | Rascunho → Calculada → **Pronta** → Autorizando → Autorizada / Rejeitada / Denegada · Contingência · Cancelada |

---

**Cobertura da auditoria** (conferida no código):

- Cadastros: criação, alteração, ativação, inativação e exclusão ("Criado", "Alterado", "Ativado", "Inativado", "Excluído" no Histórico da gaveta).
- Pedido de venda: **Aprovação, Reserva, Liberação e Cancelamento**, com o nome do autor. **Não** registra a criação nem o envio para aprovação (⚠️ B7).
- Movimentos de estoque, separações e expedições: não aparecem como ação de usuário (⚠️ B7).
- O "Histórico" do registro exige `audit_logs.read` (Administrador, Gerente, Operador e Somente leitura); os demais papéis veem "O histórico de alterações exige a permissão de auditoria."

**Movimentações — tipos e origens** (desde `48775f5`): todos os tipos têm rótulo, inclusive **Reserva** (`RESERVATION`) e **Liberação de reserva** (`RELEASE`). A coluna Origem mostra **Recebimento de compra** (`PURCHASE_RECEIPT`), **Reserva de pedido** (`stock_reservation`), **Transferência entre locais** (`stock_transfer`), **Expedição** (`SHIPMENT`), **Lançamento avulso** (`manual`) e outros; um código sem rótulo aparece como está.

---

## 6. Bugs e débitos que aparecem nas aulas

Do relatório de 7 empresas: **nenhum foi corrigido desde então**, conferido no código. Os marcados como "novo" foram encontrados neste mapeamento.

| Id | Sev. | Débito | Onde aparece na Academy |
|---|---|---|---|
| B1 | ALTO | Pedido e orçamento não são criados pela interface | 03 Comercial |
| B2 | ALTO | NF-e não é gerada, calculada nem marcada "pronta" pela interface | 07 Fiscal |
| B3 | ALTO | Numeração de documentos global entre empresas | 03, 06 (o número "pula") |
| B4 | ALTO | Datas dos documentos em UTC (à noite, caem no dia seguinte) | 03, 06, 07 |
| B5 | ~~ALTO~~ | ~~Toast "Estoque reservado." mesmo sem saldo~~ — **corrigido na `main` (`48775f5`)**: agora "Reserva parcial." ou "Nenhuma unidade reservada." com as quantidades | 03, 05 |
| B6 | ALTO | Início dos papéis personalizados com cartões de erro | 06, 07, 08 (primeira tela do personagem) |
| B7 | ALTO | Auditoria não registra criação de pedidos, movimentos, separações e expedições | 09 Auditoria |
| B8 | ALTO | Categoria de produto não pode ser criada | 02 Cadastros |
| B9 | MÉDIO | Operador padrão cria conta a pagar e NCM | 10 Configurações (segregação) |
| B10 | MÉDIO | Somente leitura abre a Administração da Empresa | 10 Configurações |
| B11 | MÉDIO | Pedido entregue continua "Expedido" | 08 Logística |
| B12 | MÉDIO | Margem bruta 100% no painel | (evitar destacar) |
| B13 | MÉDIO | Valor fora da lista gera erro 500 genérico | 02 Cadastros (API) |
| B14 | BAIXO | Mensagens técnicas em inglês ("Invalid input…") | 02 |
| B15 | BAIXO | Termos técnicos ("customers não encontrado", "(customers.create)", "127.0000") | 03, 05, 10 |
| B16 | BAIXO | Matriz de permissões com rótulos em inglês | 10 |
| B17 | BAIXO | Filtro por registro ignorado na API de auditoria | 09 |
| B18 | BAIXO | Item do pedido sem unidade | 03 |
| D1 | **novo** | "Configurações → Dados da empresa" não abre para nenhum papel | 10 |
| D2 | **novo** | Categoria/marca/unidade sem tela; o produto usa lista fixa de categorias | 02 |
| D3 | **novo** | Perfil fiscal do produto sem tela (a NF-e depende dele) | 02, 07 |
| D4 | **novo** | Gaveta do cliente: "Pedidos de venda" sempre vazia; do fornecedor: "Pedidos de compra" sempre vazia (listas fixas no código) | 02 |
| D5 | ~~novo~~ | ~~Movimentações `RESERVATION`/`RELEASE` sem rótulo; Origem técnica~~ — **corrigido (`48775f5`)**: "Reserva", "Liberação de reserva" e origens traduzidas | 03, 05 |
| D6 | **novo** | Nenhum alerta de estoque abaixo do mínimo (a comparação é manual) | 04, 05 |
| D7 | **novo** | "Agendamentos" lista os mesmos recebimentos da tela "Recebimento" | 04 |
| D8 | ~~novo~~ | ~~Local de estoque sem Descrição some da janela "Reservar estoque"~~ — **corrigido (`48775f5`)**: aparece pelo código | 02, 05 |
| D9 | **novo** | "Condição de pagamento" do cliente é texto livre: o pedido e o título usam a condição **relacional** (`payment_terms`), sem tela. Sem ela, "Gerar conta a receber" cria parcela única vencendo no dia | 02, 03, 06 |
| D10 | **novo** | Rótulos técnicos remanescentes: CFOP com Direção "SAIDA" e Abrangência "INTERNAL"; Auditoria com entidade "stock_reservations"; Devoluções cita "RETURN_IN/RETURN_OUT" | 07, 08, 09 |
| D11 | **novo** | Início dos papéis personalizados: "Painéis → Executivo" no menu, mas o cartão "Resumo" mostra "Não foi possível carregar o relatório executivo — Sem permissão para estes dados." (é o B6, reconfirmado em 02/10) | 06, 07, 08 |
| D12 | **novo** | Ocorrências e eventos de entrega (saída para entrega, ausente, recusada…) só pela API e **sem tela** de consulta; "Nenhum transportadora cadastrado" (concordância) e toasts "Transportadora criado." | 08 |

**Erros com mensagem clara** (bons para "ERRO → POR QUÊ → COMO RESOLVER"):

- "Informe o nome da empresa." · "Já existe uma empresa com este documento."
- "Informe o CPF/CNPJ." · "CNPJ inválido: confira os dígitos verificadores." · "Já existe um cliente com este documento."
- "Já existe um produto com este código." · "O estoque máximo deve ser maior ou igual ao mínimo."
- "Exclusão não permitida… Utilize a inativação." (registro em uso)
- "Selecione o local de onde reservar." · "Reserva parcial." · "Nenhuma unidade reservada."
- "Este fornecedor está vinculado a produtos cadastrados. Utilize a inativação." / "Este local está definido como localização padrão de produtos cadastrados. Utilize a inativação."
- "Só é possível receber um pedido enviado ao fornecedor e ainda não totalmente recebido (status atual: …)." (API)
- "Saldo insuficiente: disponível …, solicitado …"
- "…o produto … precisa de NCM. Para corrigir: cadastre o NCM no perfil fiscal…"
- "Sem acesso a este recurso" (tela restrita por papel)
- "Acesso restrito à Administração Central"
- Proteção do último Owner
- "Descartar alterações?" (formulário com alterações não salvas)

---

## 7. Manuais existentes × sistema atual

Os manuais (`docs/manual/`, PDFs em Configurações → Documentação) estão corretos na maior parte e já usam a legenda acima. Pontos **desatualizados** encontrados:

- "Produtos não carrega" e "Locais de estoque não cria" (MANUAL_COVERAGE): **corrigidos** depois (P1 e as capturas recentes).
- "As empresas aparecem pelo identificador (ex.: *Empresa 62d8e72c*)": hoje aparecem pelo **nome de exibição** (P11).

A Academy segue o sistema atual. Os manuais precisam de uma revisão curta, registrada como pendência.
