# EDUCA.ERP — Cobertura do Manual

Matriz de rastreabilidade entre o que existe no sistema, o que foi documentado e o que foi **executado na interface** durante a elaboração do [Manual do Usuário](MANUAL_DO_USUARIO.md) e do [Manual de Administração](MANUAL_DE_ADMINISTRACAO.md).

## Premissas

| Item | Valor |
|---|---|
| Código documentado | Interface redesenhada (`claude/educa-redesign`), rodando sobre o código da migração (`poc/supabase-to-neon`) em modo PostgreSQL + Neon Auth |
| Ambiente | Local de QA: PostgreSQL local, dublê do Neon Auth, caixa de e-mail local, `next dev` |
| Data da verificação | 27/09/2026 |
| Perfis usados | Administrador da empresa (*Admin A*), Somente leitura (*Leitura A*), Owner da plataforma, usuária convidada criada no fluxo (*Carla Mendes Manual*) |
| Dados | Fixtures locais e dados de demonstração criados pelas APIs oficiais (sem dados reais) |
| Produção | **Não** foi acessada nem alterada. Produção ainda usa a interface anterior. |
| Capturas | 246 imagens WebP em `docs/manual/assets/<módulo>/`, 1440×900 (desktop) e 390×844 (celular) |

## Legenda

| Coluna | Valores |
|---|---|
| **Estado** | ✅ Disponível · 🟡 Disponível com restrição · 🔎 Somente consulta · ⛔ Não disponível na interface · ⚠️ Débito conhecido |
| **Documentado** | ✅ completo (padrão por funcionalidade) · 🟡 resumido (tabela + figura) · ❌ não documentado |
| **Fluxo validado** | ✅ executado na UI com resultado conferido · 👁 tela aberta e conferida, sem executar a ação · ❌ falhou (débito) · — não se aplica |

---

## 1. Resumo

| Indicador | Valor |
|---|---|
| Rotas percorridas | 106 rotas (ERP, Administração da Empresa, Administração Central, autenticação) |
| Figuras no Manual do Usuário | 151 |
| Figuras no Manual de Administração | 68 |
| Capturas de reserva (só nesta matriz) | 27 |
| Fluxos de escrita executados com sucesso | 25 |
| Fluxos que falharam (débitos confirmados) | 4 |
| Problemas de produto registrados | 12 (ver seção 4.1) |

### Cobertura por módulo

| Módulo | Cobertura | Motivo quando parcial |
|---|---|---|
| Primeiros passos (login, senha, shell, busca, conta, tema, celular) | **Completa** | — |
| Início e Painéis | **Completa** | 3 painéis mostram o resumo indisponível (débito). |
| Comercial | **Completa** | Orçamentos e Faturamento são só consulta. |
| Cadastros | **Completa** para Clientes; **parcial** para os demais | Fornecedores, Transportadoras, Motoristas e Veículos seguem o mesmo componente de Clientes e foram abertos, não executados um a um. Produtos não carrega (débito). Locais de estoque não cria (débito). |
| CRM | **Completa** | Conversão de lead indisponível (débito). |
| Financeiro, Fiscal, Qualidade, Projetos | **Completa** (consulta) | Módulos só de consulta nesta versão. |
| Produção | **Parcial** | Sem registros no ambiente; criação de OP indisponível (débito). |
| Suprimentos, Logística e Estoque, Ativos, Controladoria | **Resumida** (seção 19 do Manual do Usuário) | Só consulta; várias listas vazias no ambiente de teste. |
| Workflow | **Parcial** | Só o sino de pendências tem interface; workflows não iniciam (débito). |
| Importação | **Não documentada como tela** | Não existe interface (apenas API). Registrada como ⛔. |
| Configurações | **Completa** | Dados da empresa sem acesso para todos (débito). |
| Administração da Empresa | **Completa** | Desativar acesso e contratar módulos foram conferidos, não executados. |
| Administração Central | **Completa** | Contratar/descontratar módulo conferido, não executado. |

---

## 2. Matriz por funcionalidade

### 2.1 Primeiros passos

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Login | ✅ | ✅ | `primeiros-passos/01` | ✅ | — |
| Login com erro | ✅ | ✅ | `primeiros-passos/02` | ✅ | HTTP 401 esperado |
| Recuperar senha | ✅ | ✅ | `primeiros-passos/03`, `04` | ✅ | E-mail recebido na caixa local |
| Link de senha inválido | ✅ | ✅ | `primeiros-passos/05` | ✅ | — |
| Trocar senha logado | ⛔ | ✅ (limitação) | — | — | Débito 8 |
| Estrutura da tela / navegação | ✅ | ✅ | `primeiros-passos/06`, `11` | ✅ | — |
| Busca rápida (Ctrl K) | ✅ | ✅ | `primeiros-passos/07`, `08` | ✅ | Encontra telas, não registros |
| Menu da conta, tema | ✅ | ✅ | `primeiros-passos/09`, `10` | ✅ | — |
| Uso no celular | ✅ | ✅ | `primeiros-passos/12`, `13` | ✅ | — |
| Aprovações pendentes (sino) | 🟡 | ✅ | `primeiros-passos/14` | 👁 | Sem itens: workflows não iniciam |

### 2.2 Início e Painéis

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Início (resumo, atenção, mudanças, foco, fluxo, investigação) | ✅ | ✅ | `inicio/01`–`05` | ✅ | — |
| Troca de período | ✅ | ✅ | `inicio/02` | ✅ | — |
| Gráfico ↔ Tabela | ✅ | ✅ | `inicio/10` | ✅ | — |
| Painéis por área (13) | ✅ | ✅ | `inicio/06`–`08`, `controladoria/05`, `06` | 👁 | — |
| Resumo dos painéis de Produção, Fiscal, Estoque | ⚠️ | ✅ | `inicio/09`, `producao/90` | ❌ | HTTP 500 em `/api/reports/production|fiscal|inventory` |

### 2.3 Comercial

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Página do módulo | ✅ | ✅ | `comercial/01` | 👁 | — |
| Orçamentos: lista, visões, detalhe | 🔎 | ✅ | `comercial/02`, `03` | ✅ | Criar/converter sem UI |
| Pedidos: lista, visões, colunas, busca | ✅ | ✅ | `comercial/04`–`07` | ✅ | — |
| Pedido: detalhe | ✅ | ✅ | `comercial/08` | ✅ | — |
| Enviar para aprovação | ✅ | ✅ | `comercial/09`, `10` | ✅ | PV-001022 → Aguardando aprovação |
| Aprovar | ✅ | ✅ | `comercial/11`–`13` | ✅ | PV-001012 → Aprovado |
| Reservar estoque | ✅ | ✅ | `comercial/14`, `15` | ✅ | PV-001012 → Reservado (pedido sem itens na fixture) |
| Liberar reserva | ✅ | ✅ (tabela de ações) | `comercial/15` (botão) | 👁 | — |
| Gerar conta a receber | ✅ | ✅ | `comercial/16`, `17` | ✅ | Título CR gerado |
| Cancelar pedido | ✅ | ✅ | `comercial/18`, `19` | ✅ | PV-001044 → Cancelado |
| Registro inexistente | ✅ | ✅ | `comercial/20` | ✅ | HTTP 404 esperado |
| Estado de carregamento | ✅ | ✅ | `comercial/24` | ✅ | API atrasada de propósito |
| Celular + filtros | ✅ | ✅ | `comercial/22`, `23` | ✅ | — |
| Faturamento | 🔎 | ✅ | `comercial/21` | 👁 | — |
| Criar/editar pedido | ⛔ | ✅ (aviso) | — | — | Sem UI |

### 2.4 Cadastros

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Hub de cadastros | ✅ | ✅ | `cadastros/01` | 👁 | — |
| Clientes: listar, buscar, filtrar | ✅ | ✅ | `cadastros/02`, `07`, `14` | ✅ | — |
| Clientes: criar | ✅ | ✅ | `cadastros/03`, `05`, `06` | ✅ | Toast "Cliente criado." |
| Clientes: validação | ✅ | ✅ | `cadastros/04` | ✅ | — |
| Clientes: visualizar | ✅ | ✅ | `cadastros/08`, `09` | ✅ | — |
| Clientes: editar | ✅ | ✅ | `cadastros/10`, `12` | ✅ | — |
| Clientes: descartar alterações | ✅ | ✅ | `cadastros/11` | ✅ | — |
| Clientes: inativar pelo formulário | ✅ | ✅ | `cadastros/13`, `13b` | ✅ | Dados preservados |
| Clientes: inativar/ativar pelo menu e em lote | ⚠️ | ✅ | `cadastros/15`, `16`, `17` | ❌ | **Apaga dados complementares** (P1) |
| Clientes: excluir | ✅ | ✅ | `cadastros/18`, `19` | ✅ | — |
| Clientes: somente leitura | ✅ | ✅ | `cadastros/31` | ✅ | Sem "Novo cliente" |
| Clientes: celular | ✅ | ✅ | `cadastros/32` | 👁 | — |
| Busca com vírgula | ✅ | ✅ | `cadastros/20`, `comercial/07` | ✅ | Débito 3 **não reproduzido** |
| Fornecedores, Transportadoras, Motoristas, Veículos | ✅ | 🟡 | `cadastros/24`–`28` | 👁 | Mesmo componente de Clientes |
| Produtos | ⚠️ | ✅ | `cadastros/21`, `22` | ❌ | 403 `product_categories.read` (débito 1) |
| Locais de estoque: lista | ✅ | ✅ | `cadastros/29` | 👁 | — |
| Locais de estoque: criar | ⚠️ | ✅ | `cadastros/30` | ❌ | HTTP 500 (débito 2) |

### 2.5 CRM

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Página do módulo | ✅ | ✅ | `crm/01` | 👁 | — |
| Leads: lista e detalhe | 🔎 | ✅ | `crm/02`, `03` | ✅ | — |
| Converter lead | ⚠️ | ✅ | — | ❌ | HTTP 500 (débito 4) |
| Pipeline: mover oportunidade | ✅ | ✅ | `crm/04`, `05` | ✅ | "Expansão CD Sul" → Proposta |
| Oportunidades | 🔎 | ✅ | `crm/06`, `07` | ✅ | — |
| Atividades | 🔎 | ✅ | `crm/08`, `09` | ✅ | Valores sem tradução (P7) |
| Sem acesso (perfil sem CRM) | ✅ | ✅ | `crm/10` | ✅ | — |

### 2.6 Financeiro, Fiscal, Produção, Qualidade, Projetos

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Financeiro: página, contas a receber (visões, detalhe, celular) | 🔎 | ✅ | `financeiro/00`, `01`, `01b`, `90`, `91` | ✅ | — |
| Financeiro: contas a pagar | 🔎 | ✅ | `financeiro/02`, `02b` | ✅ | — |
| Financeiro: fluxo de caixa | 🔎 | ✅ | `financeiro/03` | 👁 | — |
| Financeiro: centros de custo | 🔎 | ✅ | `financeiro/04`, `04b` | ✅ | — |
| Financeiro: baixar/lançar títulos | ⛔ | ✅ (aviso) | — | — | Sem UI |
| Fiscal: documentos, NF-e, NCM, CFOP, regras | 🔎 | ✅ | `fiscal/00`–`05` | ✅ | — |
| Fiscal: emitir/transmitir NF-e | ⛔ | ✅ (aviso) | — | — | Sem UI |
| Produção: ordens, estruturas | 🔎 | ✅ | `producao/00`–`02` | 👁 | Listas vazias |
| Produção: criar OP | ⚠️ | ✅ | — | — | Débito 6 |
| Qualidade: NC, inspeções, ações, checklists | 🔎 | ✅ | `qualidade/00`–`04` | ✅ | — |
| Projetos: projetos, tarefas, apontamentos, OS | 🔎 | ✅ | `projetos/00`–`04` | ✅ | — |

### 2.7 Workflow, Importação, Configurações, Complementares

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Workflow: aprovações pendentes | 🟡 | ✅ | `primeiros-passos/14` | 👁 | — |
| Workflow: criar/aprovar pela UI | ⛔ | ✅ (aviso) | — | — | Só API; débito 5 |
| Importação | ⛔ | ✅ (aviso) | — | — | Só API (`/api/imports`) |
| Exportação CSV | ✅ | ✅ | `comercial/06` (ícone) | 👁 | — |
| Parâmetros | 🔎 | ✅ | `configuracoes/01` | 👁 | — |
| Aparência | ✅ | ✅ | `configuracoes/03`, `91` | ✅ | — |
| Dados da empresa | ⚠️ | ✅ | `configuracoes/02` | ❌ | `companies.read` inexistente |
| Suprimentos (4 listas) | 🔎 | 🟡 | `suprimentos/*` | ✅ | — |
| Logística (12 listas) | 🔎 | 🟡 | `logistica/*` | 👁 | Só Endereçamento com dados |
| Ativos (5 listas + página do ativo) | 🔎 | 🟡 | `ativos/*` | ✅ | — |
| Controladoria: relatórios, auditoria | 🔎 | 🟡 | `controladoria/*` | ✅ | — |

### 2.8 Administração da Empresa

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Visão geral | ✅ | ✅ | `admin/01` | 👁 | — |
| Usuários: lista e visões | ✅ | ✅ | `admin/02`, `08`, `11` | ✅ | — |
| Usuário: painel (próprio e de terceiro) | ✅ | ✅ | `admin/03`, `04` | ✅ | — |
| Cadastro de usuários: criar | ✅ | ✅ | `admin/05`–`07` | ✅ | "Carla Mendes Manual" |
| Enviar convite | ✅ | ✅ | `admin/09`, `10` | ✅ | Token ocultado na figura |
| Reenviar convite | ✅ | ✅ | — | ✅ | Executado no fluxo de aceite |
| Cancelar convite | ✅ | ✅ | `admin/12` | 👁 | Confirmação aberta, não confirmada |
| Aceitar convite (senha + aceite + login) | ✅ | ✅ | `admin/40`–`46` | ✅ | Ponta a ponta |
| Desativar / reativar acesso | ✅ | ✅ | `admin/04` (botão) | 👁 | Não executado |
| Papéis: consultar matriz | ✅ | ✅ | `admin/13`, `14` | ✅ | — |
| Papéis: criar | ✅ | ✅ | `admin/15`, `50`, `51` | ✅ | "Comprador" |
| Papéis: salvar permissões | ✅ | ✅ | `admin/52`, `53` | ✅ | 23 permissões de Compras |
| Atribuir papel ao usuário | ✅ | ✅ | `admin/54` | ✅ | — |
| RBAC ponta a ponta | ✅ | ✅ | `admin/55`–`57` | ✅ | Módulo liberado e bloqueado conferidos |
| Setores: criar / duplicado | ✅ | ✅ | `admin/16`–`18b` | ✅ | "EXPEDICAO" criado; "COMPRAS" duplicado |
| Cargos, Unidades | ✅ | ✅ | `admin/19`–`22` | 👁 | Janelas abertas |
| Módulos: desabilitar | ✅ | ✅ | `admin/23`, `24` | 👁 | Confirmação aberta, não confirmada |
| Foco dos painéis | ✅ | ✅ | `admin/25`, `26` | 👁 | — |
| Auditoria | ✅ | ✅ | `admin/27`, `28` | ✅ | — |
| Somente leitura na administração | 🟡 | ✅ | `admin/29`, `30` | ✅ | P10 |
| Celular | ✅ | ✅ | `admin/31` | 👁 | — |

### 2.9 Administração Central

| Funcionalidade | Estado | Documentado | Screenshot | Fluxo validado | Observação |
|---|---|---|---|---|---|
| Acesso restrito (não membro) | ✅ | ✅ | `central/19` | ✅ | — |
| Visão geral | ✅ | ✅ | `central/01` | 👁 | — |
| Empresas: lista | ✅ | ✅ | `central/02` | ✅ | Identificação por código |
| Nova empresa: validação, documento duplicado, criação | ✅ | ✅ | `central/03`–`06b` | ✅ | — |
| Convidar administrador da empresa | ✅ | ✅ | `central/07`, `08` | ✅ | — |
| Ciclo de vida (suspender/ativar) | ✅ | ✅ | `central/10`, `11` | ✅ | — |
| Contratar/descontratar módulo | ✅ | ✅ | `central/09` | 👁 | Não executado |
| Módulos da plataforma | ✅ | ✅ | `central/12` | 👁 | — |
| Membros: convidar, editar | ✅ | ✅ | `central/13`–`15` | 👁 | Proteção do último Owner conferida |
| Permissões, Auditoria, Políticas | ✅ | ✅ | `central/16`–`18` | 👁 | — |

---

## 3. Capturas de reserva

Capturadas e conferidas, mas não incluídas no texto dos manuais para não repetir telas equivalentes:

- Ativos: [plano](assets/ativos/03b-planos-manutencao-detalhe.webp), [categoria](assets/ativos/04b-categorias-detalhe.webp), [local](assets/ativos/05b-locais-detalhe.webp)
- Cadastros: [busca com vírgula](assets/cadastros/20-clientes-busca-virgula.webp)
- Configurações: [Dados da empresa, Somente leitura](assets/configuracoes/90-empresa-leitura.webp)
- Controladoria: [relatórios, página inteira](assets/controladoria/02-relatorios-completo.webp)
- Fiscal: [NCM](assets/fiscal/03b-ncm-detalhe.webp), [CFOP](assets/fiscal/04b-cfop-detalhe.webp), [regra tributária](assets/fiscal/05b-impostos-detalhe.webp)
- Logística: [recebimento](assets/logistica/01-recebimento.webp), [movimentações](assets/logistica/03-movimentacoes.webp), [transferências](assets/logistica/04-transferencias.webp), [inventário](assets/logistica/05-inventario.webp), [endereço](assets/logistica/06b-enderecamento-detalhe.webp), [almoxarifado](assets/logistica/07-almoxarifado.webp), [picking](assets/logistica/08-picking.webp), [packing](assets/logistica/09-packing.webp), [transportes](assets/logistica/11-transportes.webp), [devoluções](assets/logistica/12-devolucoes.webp)
- Projetos: [tarefa](assets/projetos/02b-tarefas-detalhe.webp), [apontamento](assets/projetos/03b-apontamentos-detalhe.webp), [OS](assets/projetos/04b-ordens-servico-detalhe.webp)
- Qualidade: [inspeção](assets/qualidade/02b-inspecoes-detalhe.webp), [ação](assets/qualidade/03b-acoes-detalhe.webp), [checklist](assets/qualidade/04b-checklists-detalhe.webp)
- Suprimentos: [solicitação](assets/suprimentos/01b-solicitacao-compra-detalhe.webp), [cotação](assets/suprimentos/02b-cotacoes-detalhe.webp)

---

## 4. Problemas encontrados

Nenhum foi corrigido durante a documentação.

### 4.1 Produto

| # | Gravidade | Problema | Evidência | Existe na `main`? |
|---|---|---|---|---|
| P1 | **Crítica** | Inativar/Ativar pelo menu da linha e **Inativar selecionados** enviam `PATCH {"status": …}`. O handler genérico usa `schema.partial()` e, com Zod 4, os `.optional().default("")`/`default(0)`/`default("Ativo")` são aplicados mesmo no PATCH parcial: o servidor **apaga** nome fantasia, e-mail, telefones, endereço, zera o limite de crédito e volta o status comercial para "Ativo". Afeta os 8 cadastros (`src/lib/api/handlers.ts` + `src/lib/validations/cadastros.ts`) e potencialmente outros handlers com `partial()`. | Reproduzido com cliente de teste; `cadastros/15` | Sim (mesmo código e Zod ^4.5.4) |
| P2 | Média | Banner "Revise os campos destacados — Há N campos com problema" aparece ao digitar, sem erro: `onChange` grava `errors[key] = ""` e o `EntityDrawer` conta `Object.keys(errors)`. | `cadastros/05`, `admin/06` | Sim (desde `ff4ad2d`) |
| P3 | Média (acessibilidade) | Rótulos do formulário de cadastro não estão associados aos campos: `FormField` clona `id` para `FieldControl`, que não o repassa ao `<input>`. Leitores de tela não anunciam o rótulo. | Detectado na automação | Sim |
| P4 | Alta | Produtos não carrega para o administrador: 403 em `product-categories`, `product-brands`, `units`. | `cadastros/21` | Débito 1 |
| P5 | Alta | Criar local de estoque retorna HTTP 500. | `cadastros/30` | Débito 2 |
| P6 | Baixa | Pedido de venda sem itens aceita "Reservar estoque" com sucesso sem reservar nada. | `comercial/15` | A confirmar com dados reais |
| P7 | Baixa | Detalhes mostram códigos internos sem tradução: *CALL*, *opportunity*, *CORRECTIVE*, *OPEN*, entidades e ações da auditoria. | `crm/09`, `ativos/02b`, `ativos/90`, `admin/27` | Sim |
| P8 | Baixa | Matriz de permissões mostra recursos em inglês técnico (*Audit, Branches, Company modules*…). | `admin/14` | Sim |
| P9 | Média (UX) | Campo **Perfil** do Cadastro de usuários não concede papel; a pessoa entra sem acesso a módulos. | `admin/44`, `admin/46` | Sim |
| P10 | Média (conceito) | Papel *Somente leitura* entra na Administração da Empresa (tem `users.read`). | `admin/29`, `admin/30` | Sim (UI.md §8) |
| P11 | Baixa (UX) | Com papel sem `suppliers.read`, a coluna Fornecedor de Pedidos de compra mostra o início do ID. | `admin/56` | Sim |
| P12 | Baixa | "Gerar conta a receber" continua visível depois de gerado o título. | `comercial/17` | Sim |

Débitos pré-existentes confirmados na UI: 1 (Produtos), 2 (locais de estoque), 4 (conversão de lead), 5 (workflow, indireto), 6 (OP), 8 (troca de senha), relatórios de produção/fiscal/estoque (500), `companies.read`. **Não reproduzido:** débito 3 (vírgula na busca).

### 4.2 Documentação

| # | Problema |
|---|---|
| D1 | Nenhum manual de usuário existia; a documentação era técnica (`docs/*.md`). |
| D2 | `docs/UI.md` não menciona o problema P1 nem o banner P2. |
| D3 | O efeito do campo **Perfil** (P9) não está explicado em nenhum documento anterior. |

### 4.3 Ambiente

| # | Problema |
|---|---|
| A1 | O link de convite aponta para `localhost`; o código foi ocultado na figura `admin/10`. |
| A2 | No dublê do Neon Auth, o e-mail de convite chega com o assunto "Redefinir senha" e leva a `/redefinir-senha`. Em produção depende do provedor de e-mail. |
| A3 | `next dev` é lento: após ações, o status leva de 2 a 4 s para atualizar; as capturas usam espera maior. |
| A4 | Sem acesso ao Neon/produção nesta etapa (não era necessário). |

### 4.4 Dados de QA

| # | Problema |
|---|---|
| Q1 | Os 48 pedidos de venda da fixture local não têm itens (total > 0, "Pedido sem itens"). |
| Q2 | Estoque, movimentações, expedições, produção e várias listas de logística estão vazias no ambiente local. |
| Q3 | Nas capturas, a empresa tem 0 unidades cadastradas; as figuras de acesso mostram "Nenhuma unidade cadastrada". |
| Q4 | Registros criados durante a documentação ficaram no banco local: usuária *Carla Mendes Manual*, papel *Comprador*, setor *EXPEDICAO*, 3 empresas de teste, pedidos PV-001001/1011/1012/1022/1033/1044 com status alterados, títulos gerados. Nada disso existe fora do ambiente local. |

---

## 5. Como a verificação foi feita

1. **Inventário:** registro de navegação (`src/lib/nav.ts`), rotas do App Router, componentes e permissões de cada tela.
2. **Percurso:** cada rota aberta com o perfil adequado; estados vazio, carregando, erro, sem permissão e registro inexistente provocados de propósito.
3. **Fluxos:** executados pela interface com Playwright, conferindo o resultado também pela API (ex.: dados do cliente após inativar; status do pedido após cada ação).
4. **Capturas:** tiradas pela automação no fim de cada passo; revisadas visualmente; convertidas para WebP.
5. **Segunda passagem:** nomes de botões, campos, mensagens e caminhos conferidos contra o código-fonte e as imagens; afirmações sem evidência foram retiradas ou marcadas como "não executado".
