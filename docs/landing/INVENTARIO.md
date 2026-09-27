# Landing EDUCA — inventário funcional (fase 2)

Base da escrita da landing. Cada linha foi conferida no código (`src/lib/nav.ts`, rotas de `src/app`, rotas de API em `src/app/api`, funções `fn_*` das migrations), nos manuais (`docs/manual/`) e nas capturas reais (`docs/manual/assets/`). A landing só apresenta como disponível o que está marcado aqui como tal.

## Estados usados na landing

| Estado | Significado | Como aparece na página |
|---|---|---|
| **Na tela** | Ação executável na interface e executada durante o manual | selo "Na tela" |
| **Consulta** | Lista, filtros, visões, detalhe e exportação na interface; sem criar/editar pela tela | selo "Consulta" |
| **Na API** | Existe no núcleo (rota de API + regra no banco), sem botão na interface | selo "Na API" |
| **Em evolução** | Existe parcialmente ou falhou nos testes (débito conhecido) | selo "Em evolução", nunca vendido como pronto |

Validação: **UI** = executado na tela (manual); **E2E** = coberto pelas suítes `poc/neon-full/e2e`; **Código** = rota e função existem, sem execução registrada.

## Matriz

| Módulo | Funcionalidade | Fluxo | Conexão | Screenshot | Estado | Validação |
|---|---|---|---|---|---|---|
| **Comercial** | Pedidos de venda: lista, visões (entrega atrasada, aguardando aprovação, em andamento), detalhe com total, itens, reservado, expedido, andamento | Rascunho → Aguardando aprovação → Aprovado → Reservado → (Em separação → Pronto p/ expedir → Expedido → Concluído) | Estoque (reserva), Financeiro (título), Logística (expedições do pedido), Fiscal (documento do pedido) | comercial/04, 05, 08 | Na tela | UI |
| | Enviar para aprovação, Aprovar, Reservar estoque, Liberar reserva, Gerar conta a receber, Cancelar pedido | ações por status + permissão | idem | comercial/09–19 | Na tela (Liberar reserva: conferida, não executada) | UI |
| | Orçamentos: lista, visões, detalhe | Rascunho → Enviado → Aprovado/Recusado/Expirado | CRM (oportunidade → orçamento, API) | comercial/02, 03 | Consulta | UI |
| | Faturamento: documentos fiscais das vendas | — | Fiscal | comercial/21 | Consulta | UI |
| | Gerar documento fiscal a partir do pedido; separação e expedições do pedido | `sales-orders/:id/generate-fiscal-document`, `/pick-lists`, `/shipments` | Fiscal, Logística | — | Na API | Código |
| | Criar/editar pedido pela tela | — | — | — | Não disponível | — |
| **CRM** | Leads (visões novos/qualificados), oportunidades, atividades | — | Clientes, Comercial | crm/02–09 | Consulta | UI |
| | Pipeline: mover oportunidade entre estágios | Prospecção → Qualificação → Proposta → Negociação | — | crm/04, 05 | Na tela | UI + E2E |
| | Converter oportunidade em orçamento/pedido | `opportunities/:id/convert-to-quote|order` | Comercial | — | Na API | Código |
| | Converter lead em oportunidade | — | — | — | Em evolução (falha 500) | UI/E2E (débito 4) |
| **Cadastros** | Clientes, Fornecedores, Transportadoras, Motoristas, Veículos: criar, validar, visualizar, editar, inativar (pelo formulário), excluir, lote, exportar | — | base de todas as áreas | cadastros/02–32 | Na tela (fluxo completo executado em Clientes) | UI |
| | Produtos | — | — | cadastros/21 | Em evolução (permissões de catálogo ausentes) | UI (débito 1) |
| | Locais de estoque: lista | criação falha | Estoque | cadastros/29, 30 | Consulta (criação em evolução) | UI (débito 2) |
| **Suprimentos** | Solicitações, cotações, pedidos de compra, agendamentos de recebimento | Solicitação → Cotação → Pedido de compra → Recebimento | Logística (recebimento), Estoque, Financeiro, Fiscal | suprimentos/01–04, admin/56 | Consulta | UI |
| | Aprovar solicitação/pedido de compra; confirmar recebimento (entrada em estoque); gerar conta a pagar e documento fiscal do recebimento | `purchase-*/approve`, `purchase-receipts/:id/confirm|generate-payable|generate-fiscal-document` | Estoque, Financeiro, Fiscal | — | Na API | Código |
| | Fluxo "Compra ao recebimento" no Início/painéis | Pedidos de compra → Em aprovação / Aguardando fornecedor / Recebidos → Entrada confirmada / Em conferência | Gestão | admin/55 | Na tela (painel) | UI |
| **Estoque e Logística** | Saldo (visões sem disponibilidade, com reserva), movimentações, transferências, inventário, endereçamento, almoxarifado, picking, packing, expedição, transportes, devoluções | — | Comercial, Suprimentos, Produção | logistica/00–12 | Consulta (no ambiente de teste só Endereçamento tinha dados) | UI |
| | Entrada/saída de estoque, transferência, separação (lista, itens, concluir), embalagem, expedição, transporte, entrega/falha de entrega | `stock-movements/*`, `stock-transfers/*`, `pick-lists/*`, `shipments/*` | Comercial, Suprimentos | — | Na API (entrada de estoque: E2E) | Código + E2E |
| | Fluxo "Pedido à entrega" no Início | Pedidos → Em aprovação / Em preparação / Expedidos / Cancelados → Entregues / A caminho | Gestão | inicio/04 | Na tela (painel) | UI |
| **Produção** | Ordens de produção, estruturas (BOM): lista | — | Estoque | producao/00–02 | Consulta (listas vazias no teste) | UI |
| | Criar ordem de produção | — | — | — | Em evolução (débito 6); painel com resumo indisponível | UI |
| **Financeiro** | Contas a receber (visões vencidos, em aberto), contas a pagar, fluxo de caixa (saldo acumulado e projeção por semana), centros de custo | — | Comercial (CR do pedido), Suprimentos (CP do recebimento, API) | financeiro/00–04, 90 | Consulta | UI |
| | Baixar parcela, lançar título, conciliação | `*-installments/:id/pay|receive`, `bank-reconciliation` | — | — | Na API (pagamento de parcela: E2E) | Código + E2E |
| **Fiscal** | Documentos fiscais, NF-e, NCM, CFOP, regras tributárias | Rascunho → calculado (→ autorização via API) | Comercial, Suprimentos | fiscal/00–05 | Consulta | UI |
| | Criar documento, itens, calcular impostos | `fiscal-documents`, `/items`, `/calculate` | — | — | Na API | E2E |
| | Emitir/transmitir NF-e pela tela | — | — | — | Não disponível | — |
| | Resumo do painel fiscal | — | — | — | Em evolução | UI |
| **Qualidade** | Não conformidades, inspeções (ex.: recebimento), ações corretivas/preventivas, checklists | Inspeção → resultado (aprovada/rejeitada) → NC → ação | Produtos, Suprimentos (recebimento), Projetos (OS) | qualidade/00–04 | Consulta | UI |
| | Finalizar inspeção, abrir NC da inspeção, transitar NC e ação | `quality-inspections/:id/finalize|nonconformity`, `nonconformities/:id/transition` | — | — | Na API | E2E |
| **Projetos e Serviços** | Projetos, tarefas, apontamentos de horas, ordens de serviço | OS: aberta → agendada → … | Clientes, Qualidade, Comercial (orçamento do projeto, API) | projetos/00–04 | Consulta | UI |
| | Transições de OS | `service-orders/:id/transition` | — | — | Na API | E2E |
| **Ativos e Manutenção** | Ativos (página própria com informações, OMs e histórico), ordens de manutenção (visões atrasadas, aguardando peças), planos preventivos, categorias, locais | OM: aberta → planejada → em execução → … | Estoque (peças, API) | ativos/00–05, 90 | Consulta | UI |
| | Transições de OM, consumo de peças | `maintenance-orders/:id/transition|consume-part` | — | — | Na API | Código |
| **Início e Painéis** | Resumo, Precisa de atenção, O que mudou, Seu foco, Fluxo do ERP (3 fluxos), Investigação, período; 13 painéis por área | — | todas | inicio/01–10, controladoria/05, 06 | Na tela (resumo de Produção, Fiscal e Estoque em evolução) | UI |
| **Controladoria** | Relatórios (atalhos dos painéis), auditoria (quem, o quê, quando) | — | todas | controladoria/01–04 | Consulta | UI |
| **Workflow** | Aprovações pendentes (sino) | — | — | primeiros-passos/14 | Consulta | UI |
| | Criar workflow, versões, etapas, aprovadores | `workflows/*` | — | — | Na API | E2E |
| | Iniciar instância / aprovar etapa | — | — | — | Em evolução (débito 5) | E2E |
| **Importação** | Importação em lote | `imports/*` | — | — | Na API | E2E |
| | Exportação CSV das listas | — | — | comercial/06 | Na tela | UI |
| **Configurações** | Parâmetros (consulta), Aparência (claro/escuro/sistema) | — | — | configuracoes/01, 03, 91 | Na tela | UI |
| | Dados da empresa | — | — | configuracoes/02 | Em evolução (permissão inexistente) | UI |
| **Administração da Empresa** | Usuários (situação de acesso, convite, reenvio, cancelamento, desativação), papéis e matriz de permissões (Administrador 352, Operador 227, Somente leitura 76), novo papel, setores, cargos, unidades, módulos, foco dos painéis, auditoria | Cadastro → Convite → Criar senha → Aceitar → Papel → Acesso | todas (RBAC) | admin/01–57 | Na tela (convite e RBAC executados de ponta a ponta) | UI |
| **Administração Central** | Empresas (criar, convidar administrador, ciclo de vida), módulos contratados, membros Owner/Admin, permissões da plataforma, auditoria, políticas; sem acesso a dados operacionais | Nova empresa → Admin convidado → Ativa | Empresas clientes | central/01–20 | Na tela | UI |

## Fatos numéricos usados na landing (conferidos)

| Fato | Valor | Fonte |
|---|---|---|
| Áreas no menu do ERP | 15 seções (Início, Painéis, 11 módulos de operação e gestão, Cadastros, Configurações) | `src/lib/nav.ts` |
| Painéis por área | 13 | `src/lib/nav.ts` (Painéis) |
| Módulos no catálogo da plataforma | 19 | `central/12`, `admin/23` |
| Permissões do papel Administrador | 352 | `admin/14` |
| Ambientes | 3 (ERP, Administração da Empresa, Administração Central) | `docs/manual` |
| Fluxos do ERP no Início | 3 (Pedido à entrega, Compra ao recebimento, Produção) | `src/lib/dashboard/flows.ts` |

## Itens marcados para revisão

- **Canal comercial (contato/demonstração):** não existe no código nem na documentação. A landing usa "Entrar no EDUCA" e os manuais como chamadas; um CTA de contato depende de definição.
- **Emissão/transmissão de NF-e:** a API tem autorização de documento e configuração de provedor fiscal, sem execução registrada. A landing não afirma transmissão à SEFAZ.
- **Geração automática de documento fiscal e de conta a pagar a partir do recebimento:** rotas e funções existem; sem execução registrada. Apresentado como "Na API".

## Conferências feitas na construção da página

Cada código, valor e rota citado na página foi conferido de novo na própria captura, ampliada. Correções feitas:

- **Título a receber do pedido PV-001013:** o código é **CR-0002** (zero cortado na fonte mono), não CR-0092.
- **Endereçamento de estoque** (`logistica/06`): a lista e o detalhe aparecem sem dados visíveis no ambiente das capturas. A tela saiu da página e nenhum código de endereço é citado. O exemplo de local usado é "FIL03 rua 05", que aparece na janela Reservar estoque (`comercial/14`).
- **Cliente de exemplo:** CLI-0005 (visível em `cadastros/02`), no lugar de um código que não aparece nas capturas.
- **Rotas de detalhe:** aparecem como `/:id`. O app usa identificadores internos nessas rotas, não o código do registro.
- **Listas de Logística** (separação, expedição, transportes): no ambiente das capturas estão sem registros. A página diz isso na legenda, em vez de sugerir volume.
- **Financeiro:** "receber títulos" poderia ser lido como baixa de pagamento. O texto agora diz que o título é criado por uma ação na tela do pedido. A baixa de parcelas continua como "Na API".
