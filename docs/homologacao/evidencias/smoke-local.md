# Smoke de homologação — 2026-09-28 04:01 UTC

App: http://localhost:3200 · Resultado: **90/90**

| Área | Verificação | Resultado | Classificação | Detalhe |
|---|---|---|---|---|
| Acesso | tela de login pública (200) | passou | funciona |  |
| Acesso | login sem CTA de cadastro | passou | funciona |  |
| Ambiente | selo HOMOLOGAÇÃO visível no login | passou | funciona |  |
| Ambiente | título da aba indica homologação | passou | funciona |  |
| Rotas protegidas | / sem sessão → /login | passou | funciona |  |
| Rotas protegidas | /comercial/pedidos sem sessão → /login | passou | funciona |  |
| Rotas protegidas | /financeiro/contas-receber sem sessão → /login | passou | funciona |  |
| Rotas protegidas | /admin sem sessão → /login | passou | funciona |  |
| Rotas protegidas | /admincentral sem sessão → /login | passou | funciona |  |
| Rotas protegidas | API sem sessão → 401 | passou | funciona |  |
| Acesso | cadastro público pelo app recusado | passou | funciona |  |
| Acesso | senha errada → recusada | passou | funciona |  |
| Autenticação | Owner: login pela tela | passou | funciona |  |
| Sessão | Owner: contexto carregado (admin + plataforma OWNER) | passou | funciona |  |
| Ambiente | Owner: selo HOMOLOGAÇÃO no ERP | passou | funciona |  |
| RBAC: menu | Owner: 72 itens no menu | passou | visualizado |  |
| Autenticação | Admin: login pela tela | passou | funciona |  |
| Sessão | Admin: contexto carregado (admin_operacional_homolog) | passou | funciona |  |
| Ambiente | Admin: selo HOMOLOGAÇÃO no ERP | passou | funciona |  |
| RBAC: menu | Admin: 72 itens no menu | passou | visualizado |  |
| Autenticação | Usuário: login pela tela | passou | funciona |  |
| Sessão | Usuário: contexto carregado (vendedor_homolog) | passou | funciona |  |
| Ambiente | Usuário: selo HOMOLOGAÇÃO no ERP | passou | funciona |  |
| RBAC: menu | Usuário: 19 itens no menu | passou | visualizado |  |
| RBAC: menu | Usuário (Vendedor) vê Comercial e CRM | passou | funciona |  |
| RBAC: menu | Usuário (Vendedor) NÃO vê Financeiro, Fiscal, Suprimentos, Produção | passou | funciona |  |
| RBAC: menu | Usuário (Vendedor) NÃO vê Administração | passou | funciona |  |
| RBAC: menu | Admin (Operador) vê Financeiro e Fiscal | passou | funciona |  |
| RBAC: menu | Usuário vê menos itens que o Admin | passou | funciona |  |
| RBAC: ações | Owner: Administração Central (membros da plataforma) → 200 | passou | funciona |  |
| RBAC: ações | Admin: Administração Central (membros da plataforma) → 403 | passou | funciona |  |
| RBAC: ações | Usuário: Administração Central (membros da plataforma) → 403 | passou | funciona |  |
| RBAC: ações | Admin: criar papel (só o Owner gerencia papéis) → 403 | passou | funciona |  |
| RBAC: ações | Usuário: criar papel (só o Owner gerencia papéis) → 403 | passou | funciona |  |
| RBAC: ações | Admin: criar usuário (só o Owner) → 403 | passou | funciona |  |
| RBAC: ações | Usuário: criar usuário (só o Owner) → 403 | passou | funciona |  |
| RBAC: ações | Owner: pedidos de venda → 200 | passou | funciona |  |
| RBAC: ações | Admin: pedidos de venda → 200 | passou | funciona |  |
| RBAC: ações | Usuário: pedidos de venda → 200 | passou | funciona |  |
| RBAC: ações | Owner: leads (CRM) → 200 | passou | funciona |  |
| RBAC: ações | Admin: leads (CRM) → 200 | passou | funciona |  |
| RBAC: ações | Usuário: leads (CRM) → 200 | passou | funciona |  |
| RBAC: ações | Owner: contas a receber → 200 | passou | funciona |  |
| RBAC: ações | Admin: contas a receber → 200 | passou | funciona |  |
| RBAC: ações | Usuário: contas a receber → 403 | passou | funciona |  |
| RBAC: ações | Owner: contas a pagar → 200 | passou | funciona |  |
| RBAC: ações | Admin: contas a pagar → 200 | passou | funciona |  |
| RBAC: ações | Usuário: contas a pagar → 403 | passou | funciona |  |
| RBAC: ações | Owner: documentos fiscais → 200 | passou | funciona |  |
| RBAC: ações | Admin: documentos fiscais → 200 | passou | funciona |  |
| RBAC: ações | Usuário: documentos fiscais → 403 | passou | funciona |  |
| RBAC: ações | Owner: solicitações de compra → 200 | passou | funciona |  |
| RBAC: ações | Admin: solicitações de compra → 200 | passou | funciona |  |
| RBAC: ações | Usuário: solicitações de compra → 403 | passou | funciona |  |
| RBAC: ações | Owner: saldos de estoque (consulta) → 200 | passou | funciona |  |
| RBAC: ações | Admin: saldos de estoque (consulta) → 200 | passou | funciona |  |
| RBAC: ações | Usuário: saldos de estoque (consulta) → 200 | passou | funciona |  |
| RBAC: ações | Owner: entrada de estoque (corpo vazio) → 422 | passou | funciona |  |
| RBAC: ações | Admin: entrada de estoque (corpo vazio) → 422 | passou | funciona |  |
| RBAC: ações | Usuário: entrada de estoque (corpo vazio) → 403 | passou | funciona |  |
| RBAC: dados | papéis visíveis: Owner 5, Admin 0, Usuário 0 (só o Owner lê papéis) | passou | funciona |  |
| RBAC: dados | usuários visíveis: Owner 13, Admin 13, Usuário 1 (Usuário só vê a si) | passou | funciona |  |
| Fluxos | Usuário (Vendedor) cria pedido de venda | passou | funciona |  |
| Fluxos | Usuário (Vendedor) envia o pedido para aprovação | passou | funciona |  |
| RBAC: ações | Usuário (Vendedor) NÃO aprova o pedido (403) | passou | funciona |  |
| Fluxos | Admin aprova o pedido criado pelo Vendedor | passou | funciona |  |
| RBAC: telas sem acesso | Usuário (Vendedor) em /financeiro/contas-receber → bloqueado | passou | funciona |  |
| RBAC: telas sem acesso | Usuário (Vendedor) em /admin → bloqueado | passou | funciona |  |
| RBAC: telas sem acesso | Usuário (Vendedor) em /admincentral → bloqueado | passou | funciona |  |
| Navegação | Owner: 72/72 telas do menu abrem sem erro | passou | visualizado |  |
| Navegação | Admin: 72/72 telas do menu abrem sem erro | passou | visualizado |  |
| Navegação | Usuário: 19/19 telas do menu abrem sem erro | passou | visualizado |  |
| Autenticação | Owner: logout com o mouse (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Owner: após logout (mouse) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Owner: após logout (mouse) rota protegida → /login | passou | funciona |  |
| Autenticação | Owner: logout com o teclado (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Owner: após logout (teclado) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Owner: após logout (teclado) rota protegida → /login | passou | funciona |  |
| Autenticação | Admin: logout com o mouse (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Admin: após logout (mouse) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Admin: após logout (mouse) rota protegida → /login | passou | funciona |  |
| Autenticação | Admin: logout com o teclado (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Admin: após logout (teclado) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Admin: após logout (teclado) rota protegida → /login | passou | funciona |  |
| Autenticação | Usuário: logout com o mouse (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Usuário: após logout (mouse) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Usuário: após logout (mouse) rota protegida → /login | passou | funciona |  |
| Autenticação | Usuário: logout com o teclado (Conta → Sair) volta ao /login | passou | funciona |  |
| Sessão | Usuário: após logout (teclado) a API recusa (401) | passou | funciona |  |
| Rotas protegidas | Usuário: após logout (teclado) rota protegida → /login | passou | funciona |  |

## Menus por papel

- **Owner** (72): Início, Executivo, Comercial, Compras, Estoque, Logística, Produção, Financeiro, Fiscal, Controladoria, Qualidade, Manutenção, Operações, TI e acessos, Orçamentos, Pedidos de venda, Faturamento, Leads, Pipeline, Oportunidades, Atividades, Solicitações de compra, Cotações, Pedidos de compra, Agendamentos, Recebimento, Estoque, Movimentações, Transferências, Inventário, Endereçamento, Almoxarifado, Picking, Packing, Expedição, Transportes, Devoluções, Ordens de produção, Estruturas (BOM), Contas a pagar, Contas a receber, Fluxo de caixa, Centros de custo, Notas fiscais, NF-e, NCM, CFOP, Regras tributárias, Projetos, Tarefas, Apontamentos, Ordens de serviço, Não conformidades, Inspeções, Ações, Checklists, Ativos, Ordens de manutenção, Planos de manutenção, Categorias, Locais, Relatórios, Auditoria, Produtos, Clientes, Fornecedores, Transportadoras, Motoristas, Veículos, Locais de estoque, Parâmetros, Aparência
- **Admin** (72): Início, Executivo, Comercial, Compras, Estoque, Logística, Produção, Financeiro, Fiscal, Controladoria, Qualidade, Manutenção, Operações, TI e acessos, Orçamentos, Pedidos de venda, Faturamento, Leads, Pipeline, Oportunidades, Atividades, Solicitações de compra, Cotações, Pedidos de compra, Agendamentos, Recebimento, Estoque, Movimentações, Transferências, Inventário, Endereçamento, Almoxarifado, Picking, Packing, Expedição, Transportes, Devoluções, Ordens de produção, Estruturas (BOM), Contas a pagar, Contas a receber, Fluxo de caixa, Centros de custo, Notas fiscais, NF-e, NCM, CFOP, Regras tributárias, Projetos, Tarefas, Apontamentos, Ordens de serviço, Não conformidades, Inspeções, Ações, Checklists, Ativos, Ordens de manutenção, Planos de manutenção, Categorias, Locais, Relatórios, Auditoria, Produtos, Clientes, Fornecedores, Transportadoras, Motoristas, Veículos, Locais de estoque, Parâmetros, Aparência
- **Usuário** (19): Início, Comercial, Operações, Orçamentos, Pedidos de venda, Leads, Pipeline, Oportunidades, Atividades, Estoque, Movimentações, Transferências, Inventário, Almoxarifado, Devoluções, Relatórios, Produtos, Clientes, Aparência
