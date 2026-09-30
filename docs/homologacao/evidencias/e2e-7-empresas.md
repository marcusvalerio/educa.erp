# ATLAS.ERP — Teste multiempresa com 7 empresas, massa de dados e vídeo de usabilidade

**Data:** 29–30/09/2026 · **Branch:** `claude/e2e-empresa-nova-correcoes` (a partir de 6b72213; commit desta rodada: `ba4f3d9`) · `main` intocada.

**Ambiente:** réplica **local** da homologação. PostgreSQL 16 `127.0.0.1:55440/educa_poc` com as migrations 0001–0080, dublê do Neon Auth (`:3401`), caixa de e-mail local (`:58025`) e app `next start` em `http://localhost:3200`. **Nada foi feito em produção nem no Neon/Vercel de homologação.**

> **BLOCKED — execução na homologação real (Neon `old-butterfly-53570465` + Vercel Preview).** O proxy de saída recusa `*.neon.tech` e `*.vercel.app` (HTTP 000) e a porta 5432 está fechada. Todo o teste abaixo rodou na réplica local, com o mesmo esquema e o mesmo fluxo oficial de convites. Ele **não** substitui a rodada na homologação real.

---

## 1. Resumo executivo

| Item | Resultado |
|---|---|
| Empresas criadas pelo Owner na Central | **7** (mais 2 preservadas: ASTRA.ERP e Nova Orbita) |
| Usuários criados pelo fluxo oficial de convite | **56** = 7 × (Administrador + 7 papéis); todos fizeram o primeiro acesso |
| Papéis personalizados criados pelo administrador | 21 (Financeiro, Fiscal e Logística em cada empresa) |
| Registros de negócio criados | **1.430**: clientes, fornecedores, produtos, locais, movimentos, pedidos, itens, AR, AP, recebimentos, pagamentos, NF-e, separações, expedições, perfis fiscais, contas e papéis |
| Registros de auditoria gerados | 1.306 |
| Verificações individuais registradas (`resultados.jsonl`) | **449**: 396 PASS · 53 FAIL · 0 BLOCKED |
| Isolamento (tentativas A→B e B→A) | **420/420 PASS**, 0 vazamentos, banco de B intacto nos 14 pares |
| RBAC: API × permissões configuradas | **931/931 PASS** (7 empresas × 7 papéis × 19 operações) |
| RBAC: interface (telas restritas e botões ocultos) | **28/28 PASS** |
| Fluxo completo por empresa (banco + interface + auditoria) | **7/7 PASS** nos vínculos; status final do pedido **FAIL** em 7/7 |
| Auditoria (autor real, empresa correta, sem "system") | **7/7 PASS**; cobertura da trilha **FAIL** em 7/7 |
| Erros provocados | 44 cenários: 34 PASS · 10 FAIL |
| Testes automatizados do repositório | **853/853** (eram 849; +4 dos manuais); lint 0 erros; tsc OK; build OK |
| Vídeo | **Gerado de verdade**: `12-video/ATLAS-ERP-demo-1080p.mp4` (2 min 09 s, 1920×1080, H.264, 30 fps, 20 MB) |
| Outros BLOCKED | Autorização de NF-e na SEFAZ (sem provedor/certificado: as NF-e ficam em "Pronta"); e-mail real (SMTP), substituído pela caixa local |

**Em uma frase:** o núcleo multiempresa (isolamento, RBAC, autoria) resistiu a tudo o que foi tentado. As falhas estão nas bordas operacionais: telas que faltam, datas em UTC, numeração global, trilha incompleta e mensagens.

---

## 2. Empresas

| # | Empresa criada | Nome pedido | Perfil | CNPJ fictício | Usuários |
|---|---|---|---|---|---|
| 01 | **Órbita Distribuidora** (demo) | NOVA ORBITA COMERCIAL → já existia "Nova Orbita", usei um nome equivalente | Distribuidora de utilidades | válido, gerado | 8 |
| 02 | **Aster Industrial** | ASTRA INDUSTRIAL → já existia "ASTRA.ERP", usei um nome equivalente | Indústria (fixadores, metalurgia) | válido, gerado | 8 |
| 03 | Lumen Tecnologia | igual | TI e projetos (revenda de equipamentos) | válido, gerado | 8 |
| 04 | Vita Suprimentos | igual | Hospitalar fictícia (24 SKUs, fiscal) | válido, gerado | 8 |
| 05 | Orla Varejo | igual | Varejo de moda e casa | válido, gerado | 8 |
| 06 | Alpha Logística | igual | Operador logístico (materiais) | válido, gerado | 8 |
| 07 | Horizon Serviços | igual | Facilities (limpeza e conservação) | válido, gerado | 8 |

Os CNPJ/CPF foram gerados com dígitos verificadores válidos a partir de uma semente fixa (`e2e7/companies.mjs`), sem correspondência intencional com pessoas ou empresas reais. Os e-mails usam o domínio reservado `.test`.

**Massa por empresa** (conferida no banco, `01-empresas/contagens.txt`):

| Empresa | Clientes | Fornec. | Produtos | Locais | Movim. | Pedidos | Itens | AR | AP | NF-e | Separações | Expedições | Auditoria |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Órbita | 15 | 7 | 25 | 4 | 51 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 182 |
| Aster | 15 | 7 | 25 | 4 | 51 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 182 |
| Lumen | 15 | 7 | 20 | 4 | 46 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 172 |
| Vita | 15 | 7 | 24 | 4 | 50 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 180 |
| Orla | 15 | 7 | 23 | 4 | 49 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 178 |
| Alpha | 15 | 7 | 22 | 4 | 48 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 176 |
| Horizon | 15 | 7 | 21 | 4 | 47 | 12 | 24 | 7 | 5 | 3 | 5 | 4 | 174 |

**Estados cobertos em cada empresa:**
- **Pedidos:** rascunho, aguardando aprovação, aprovado, reservado, separado (pronto para expedir), expedido, entregue (3) e cancelado (2).
- **Estoque:** saldo normal, baixo (4 un. contra mínimo 10) e zerado (2 produtos), mais entrada no recebimento e saída avulsa.
- **Contas a receber:** recebida, parcialmente recebida, em aberto e vencida.
- **Contas a pagar:** paga, em aberto e vencida.
- **NF-e:** 3 prontas para transmissão.
- **Expedições:** entregue (3) e expedida (1).

**Autoria da massa:** cada operação foi feita pela API real com a sessão do usuário do papel:
- o Vendedor criou clientes e pedidos;
- o Gerente aprovou e cancelou pedidos e aprovou expedições;
- o Operador cadastrou produtos;
- a Logística reservou, separou, expediu e entregou;
- o Financeiro cuidou de AR, AP, recebimentos e pagamentos;
- o Fiscal configurou estabelecimento, CFOP, natureza, NCM e perfis e gerou as NF-e.

---

## 3. RBAC — Empresa × Papel × Permissões × Resultado

Papéis usados:
- **Papéis do sistema:** Gerente, Vendedor ("Comercial"), Operador e Somente leitura.
- **Papéis personalizados** (recurso oficial, criados pelo administrador em "Papéis e permissões"): **Financeiro** (43 permissões), **Fiscal** (44) e **Logística** (43).

| Papel | Permissões | API conforme configuração (7 empresas) | Interface | Divergência de negócio |
|---|---|---|---|---|
| Gerente | 340 (modelo) | 133/133 PASS | não vê "Novo papel" nem "Convidar usuário" | — |
| Vendedor | 40 | 133/133 PASS | Contas a pagar e NF-e com acesso restrito | — |
| Operador | 258 | 133/133 PASS | sem "Aprovar" e sem "Convidar" | **cria conta a pagar e NCM** (7/7 empresas) |
| Financeiro | 43 (personalizado) | 133/133 PASS | NF-e e Expedição com acesso restrito | — |
| Fiscal | 44 (personalizado) | 133/133 PASS | Contas a pagar e Separação com acesso restrito | — |
| Logística | 43 (personalizado) | 133/133 PASS | Contas a receber e NF-e com acesso restrito | — |
| Somente leitura | 105 | 133/133 PASS | sem "Novo cliente" e sem "Novo pedido" | **abre a Administração da Empresa** (usuários, e-mails, papéis, auditoria) |

Matrizes completas: `03-rbac/0N-<empresa>-rbac-matriz-empresa.png`; por papel na empresa demo: `03-rbac/01-orbita-<papel>-matriz.png`.

---

## 4. Isolamento (Fase 5)

O teste formou um anel: cada empresa A contra a vizinha B, nos dois sentidos (14 pares), sempre com a sessão do **Administrador** de A, o perfil mais privilegiado. Cada par teve 30 tentativas:
- **Por ID de B:** GET, PATCH e DELETE de cliente e produto; GET e cancelamento de pedido; GET de AR, AP, NF-e e expedição.
- **Associação cruzada:** pedido de A com cliente de B ou com produto de B; entrada de estoque no local de B ou com o produto de B; reserva do pedido de B; geração de AR sobre o pedido de B; cancelamento do AP e da NF-e de B; entrega da expedição de B.
- **Usuários:** atribuir papel, remover papel e vincular unidade a um usuário de B.
- **Auditoria:** histórico do cliente de B e trilha filtrada pelo pedido de B.
- **Interface e listas:** URL direta do pedido de B na interface; listas de A (clientes, produtos, pedidos, usuários).
- **Banco de B:** contagens, `updated_at` do cliente e status do pedido, antes e depois.

**Resultado: 420/420 PASS.** Toda tentativa voltou 403, 404 ou 422 (ou lista vazia), sem nenhum dado de B no corpo, e o banco de B não mudou. Evidência: `04-isolamento/*-isolamento-tentativas.png`.

**Observação do critério:** na primeira rodada, 28 casos falharam por erro meu de critério. A rota de unidades não tem GET (405), e a trilha administrativa ignora o filtro `entityId` e devolve registros da **própria** A. Corrigi o critério para conferir no banco a empresa de cada registro devolvido. A rodada original está preservada em `resultados-isolamento-rodada1-criterio.jsonl`.

---

## 5. Fluxos completos (Fase 7) e auditoria (Fase 8)

Para um pedido entregue de cada empresa, conferi no **banco**:
cliente → pedido (criado pelo Vendedor, aprovado pelo Gerente) → reserva e movimentos de estoque → conta a receber → recebimento → NF-e → separação concluída → expedição entregue com evento de entrega.

Também conferi a **tela** do pedido pelo Gerente. **7/7 PASS** (`05-comercial/0N-*-fluxo-completo-banco.png`).

Auditoria nas 7 empresas:
- 0 registros "system";
- 0 ações de usuário sem usuário;
- 0 autores de outra empresa;
- a tela Auditoria mostra autores de papéis diferentes e nenhum nome de outra empresa.

A ação do Owner aparece como `platform:OWNER:owner@…` (identificada, não "system"). Quadro por papel: `10-auditoria/0N-*-auditoria-por-papel.png`.

**FAIL (7/7):** a trilha **não registra a criação** de pedidos (12 por empresa), dos movimentos de estoque (46–51), das separações (5), das expedições (4) nem da configuração fiscal. Quem criou fica só em `created_by` de cada tabela. A tela Auditoria não responde "quem criou o pedido PV-…".

---

## 6. Erros provocados (Fase 9)

Rodado em 2 empresas, 44 cenários. Classificação: *técnica*, *compreensível* ou *com instrução*.

| Cenário | HTTP | Mensagem | Classificação |
|---|---|---|---|
| CNPJ inválido | 422 | "CNPJ inválido: confira os dígitos verificadores." | compreensível ✅ |
| CNPJ ou código duplicado | 409 | "Já existe um registro com este documento/código." | compreensível ✅ |
| Pedido sem itens / quantidade 0 | 422 | "O pedido precisa de ao menos um item…" / "A quantidade deve ser maior que zero." | ✅ |
| Saída maior que o saldo | 409 | "Saldo insuficiente: disponível 127.0000…, solicitado 99999." | compreensível (4 casas decimais) |
| NF-e com produto sem NCM | 422 | "…o produto OD-025 … precisa de NCM. Para corrigir: cadastre o NCM no perfil fiscal…" | com instrução ✅ |
| Excluir cliente ou produto em uso | 409 | "Não é possível excluir: existem registros vinculados… Utilize a inativação." | com instrução ✅ |
| Sem permissão | 403 | "Você não tem permissão para esta operação (customers.create)." | compreensível (mostra o código técnico) |
| Registro de outra empresa | 404 | "customers não encontrado." | compreensível (nome da tabela em inglês) |
| Cliente, produto ou pedido sem campo obrigatório (API) | 422 | "Invalid input: expected string, received undefined" | **técnica** ❌ |
| Segmento do cliente fora da lista | **500** | "Não foi possível concluir a operação. Tente novamente." | **500 genérico** ❌ |
| Criar categoria de produto | 422 | "Preencha os campos obrigatórios antes de salvar." (sempre) | **bug** ❌ |
| Reservar pedido sem estoque (tela) | 200 | toast **"Estoque reservado."**, com 0 de 5 reservados | **enganosa** ❌ |

Quadro completo: `11-usabilidade/90-erros-provocados.png`.

---

## 7. Usabilidade (Fase 10)

Foram 29 telas × 7 papéis na empresa demo, mais o celular (390×844):
- todas carregaram em menos de 1 s (máximo 998 ms);
- nenhuma teve rolagem horizontal no celular;
- nenhum erro de console, exceto o item ALTO abaixo.

A seguir, os achados com a classificação.

| Sev. | Achado | Evidência |
|---|---|---|
| ALTO | O Vendedor **não consegue criar pedido nem orçamento pela interface**: as telas são só de listagem, e criar só é possível pela API. | `11-usabilidade/01-orbita-vendedor-pedidos.png` |
| ALTO | **Sem ação de gerar, calcular e marcar a NF-e como pronta** na interface (só pela API). | `11-usabilidade/01-orbita-fiscal-notas.png` |
| ALTO | A primeira tela (Início) dos papéis **Financeiro, Fiscal e Logística** mostra dois cartões de erro ("Não foi possível carregar o relatório executivo", "Comparação indisponível"). A tela chama `/api/reports/executive` (403) e oferece um "Tentar novamente" que nunca funciona. | `11-usabilidade/01-orbita-financeiro-painel.png` |
| ALTO | Reserva sem estoque: o toast diz "Estoque reservado." (`src/app/app/(erp)/comercial/pedidos-venda/[id]/page.tsx:96`). | `06-estoque/90-erro-reserva-sem-estoque-tela.png` |
| MÉDIO | Painel: **Margem bruta 100%** com receita de R$ 1.591,38, porque o custo das mercadorias vendidas não entra no indicador. | `12-video/probe02.png` |
| MÉDIO | Painel: Receita líquida R$ 0,00 (−100%) às 21h50 de 29/09, efeito do fuso (bug B4). | `11-usabilidade/01-orbita-gerente-painel.png` |
| BAIXO | A matriz de permissões usa nomes técnicos em inglês ("Audit", "Rbac", "Org", "Company modules"). | `03-rbac/01-orbita-papel-financeiro-b-permissoes.png` |
| BAIXO | O item do pedido fica sem unidade ("Un. —") quando a API a omite (não herda a do produto). | `06-estoque/90-erro-reserva-sem-estoque-tela.png` |

---

## 8. Bugs por severidade

Nenhum bug CRÍTICO: nenhum vazamento entre empresas e nenhuma escalada de permissão.

### ALTO

**B1 — Pedido e orçamento não podem ser criados pela interface**
- **Reprodução:** entrar como Vendedor → Comercial → Pedidos de venda ou Orçamentos.
- **Esperado:** "Novo pedido" com itens.
- **Atual:** lista sem criação.
- **Impacto:** a venda, coração do ERP, depende de integração ou API.
- **Onde:** `src/app/app/(erp)/comercial/pedidos-venda/page.tsx` e `orcamentos/page.tsx` (ResourceListPage).

**B2 — NF-e não pode ser gerada pela interface**
- **Esperado:** "Gerar NF-e" no pedido ou no Fiscal.
- **Atual:** só `POST /api/sales-orders/:id/generate-fiscal-document`, `/calculate` e `/ready`.
- **Impacto:** o Fiscal não opera sem API.

**B3 — Numeração de documentos global entre empresas**
- **Reprodução:** criar pedidos em duas empresas.
- **Atual:** Órbita PV-0037…0048, Aster PV-0049…0060…; CR idem.
- **Esperado:** sequência por empresa (PV-0001).
- **Impacto:** uma empresa infere o volume das outras; a numeração parece aleatória ao cliente.
- **Onde:** `supabase/migrations/0021_sales_orders.sql:81` (`fn_generate_code('PV', 'public.sales_orders_code_seq')`) e similares.

**B4 — Datas dos documentos em UTC**
- **Onde:** `order_date`, `issue_date`, `received_at` e `paid_at` com `default CURRENT_DATE`, banco em UTC.
- **Reprodução:** criar um pedido às 21h50 (Brasília) de 29/09.
- **Atual:** datado 30/09.
- **Impacto:** documentos da noite caem no dia seguinte, a venda do último dia do mês vai para o mês seguinte, e o painel "Este mês" fica errado à noite.

**B5 — Toast "Estoque reservado." quando nada foi reservado**
- **Onde:** `pedidos-venda/[id]/page.tsx:96`.
- **Esperado:** "Pedido aguardando estoque (0 de 5)".

**B6 — Início dos papéis personalizados com cartões de erro**
- **Detalhe:** 403 em `/api/reports/executive`.
- **Esperado:** esconder o que o papel não pode ver.
- **Onde:** `src/components/dashboard/*` (Início).

**B7 — Trilha de auditoria sem a criação de registros**
- **Detalhe:** pedidos, movimentos de estoque, separações, expedições e configuração fiscal (seção 5).
- **Impacto:** a rastreabilidade de "quem criou" fica fora da tela Auditoria.

**B8 — Categorias de produto não podem ser criadas**
- **Reprodução:** `POST /api/product-categories {nome}` (tela Cadastros → Categorias).
- **Atual:** sempre 422 "Preencha os campos obrigatórios", porque o `code` (NOT NULL) nunca é preenchido.
- **Esperado:** categoria criada.
- **Impacto:** o cadastro relacional de categorias está inutilizável em todas as empresas (os produtos usam a lista fixa).

### MÉDIO

**B9 — Operador padrão cria conta a pagar e NCM**
- **Origem:** modelo `fn_role_template_permission_codes` (create/update amplo).
- **Impacto:** quebra a segregação de funções.

**B10 — Somente leitura abre a Administração da Empresa**
- **Detalhe:** o papel vê usuários com e-mail, papéis, permissões e auditoria (`users.read`, `roles.read` e `audit_logs.read` no modelo).

**B11 — Pedido entregue continua "Expedido" (`shipped`)**
- **Detalhe:** nenhuma função grava `completed`.
- **Impacto:** a carteira "em aberto" fica inflada.

**B12 — Margem bruta 100%**
- **Detalhe:** o custo das mercadorias vendidas não é considerado.

**B13 — Valor fora da lista em campo com CHECK gera 500 genérico**
- **Exemplo:** segmento do cliente.
- **Onde:** o código 23514 não é traduzido em `src/lib/database/errors.ts`.

### BAIXO

- **B14** — Mensagem em inglês do zod para campo ausente ("Invalid input: expected string, received undefined").
- **B15** — Mensagens com termos técnicos: "customers não encontrado.", "(customers.create)", "127.0000".
- **B16** — Matriz de permissões com rótulos técnicos em inglês.
- **B17** — `/api/admin/audit` ignora o filtro `entityId`.
- **B18** — O item do pedido não herda a unidade do produto.

---

## 9. Empresa demo (Fase 11)

**Órbita Distribuidora** fica disponível na réplica local de homologação:
- **Painel:** receita, saldo em caixa, pendências e fluxo do ERP.
- **Cadastros:** 15 clientes, 7 fornecedores e 25 produtos.
- **Estoque:** 4 locais e 51 movimentos.
- **Comercial:** 17 pedidos — os 12 da massa, em todos os estados; o **PV-0185**, que fez o fluxo inteiro em câmera no vídeo; e 4 de teste, já cancelados.
- **Financeiro:** AR e AP em todos os estados.
- **Fiscal:** 3 NF-e prontas.
- **Logística:** separações, expedições e entregas.
- **Auditoria:** com 9 autores (8 usuários + Owner).

Os artefatos criados pelos testes de permissão e de erro foram **cancelados ou inativados, nunca excluídos**: 4 pedidos, 3 títulos e 3 NCMs.

---

## 10. Vídeo (Fase 12)

`12-video/ATLAS-ERP-demo-1080p.mp4`: 2 min 09 s, 1920×1080, H.264, 30 fps.

**Como foi feito:**
- captura real da tela (Chrome DevTools screencast, JPEG q92) de interações reais;
- cursor discreto e legenda inferior;
- zoom suave feito no próprio navegador;
- cartelas de abertura e encerramento em HTML com a identidade ATLAS.ERP;
- transições cruzadas de 0,5 s, montadas com ffmpeg.

Folha de contatos: `12-video/contato.png`.

| # | Cena | Quem | O que aparece | Duração |
|---|---|---|---|---|
| 1 | Abertura | — | ATLAS.ERP / Uma empresa. / Várias áreas. / Uma única operação. | 6,6 s |
| 2 | Dashboard | Gerente | Resumo (zoom), "Precisa de atenção" | 13,0 s |
| 3 | Comercial | Vendedor | carteira de pedidos → PV-0185 → itens (zoom) → **Enviar para aprovação** | 15,9 s |
| 4 | Aprovação | Gerente | **Aprovar** → confirmação → status | 11,1 s |
| 5 | Estoque | Operador | **Reservar estoque** → local Picking → Reservado 100% → saldos | 20,0 s |
| 6 | Financeiro | Financeiro | **Gerar conta a receber** → lista de AR (recebido, aberto, vencido) | 14,6 s |
| 7 | Fiscal | Fiscal | NF-e prontas (zoom) → painel fiscal configurado | 10,6 s |
| 8 | Logística | Logística | separação concluída → expedições entregues | 9,3 s |
| 9 | Auditoria | Administrador | "Quem fez o quê, em qual empresa e quando" (zoom na trilha) | 7,3 s |
| 10 | Multiempresa | Owner, depois Gerente da Vita | Central com as empresas → painel de outra empresa | 9,7 s |
| 11 | Convergência | Gerente | pedido entregue: reserva, expedição, financeiro e fiscal juntos | 10,2 s |
| 12 | Encerramento | — | Uma base. / Todas as áreas. / Uma operação conectada. + "homologação · dados fictícios" | 7,0 s |

**Transparência:**
- o pedido PV-0185 foi **criado pela API antes da gravação**, porque a interface não tem "Novo pedido" (B1);
- as NF-e da cena 7 foram geradas pela API (B2);
- o resto é interação real na interface;
- o selo "HOMOLOGAÇÃO · DADOS FICTÍCIOS" aparece nas telas de propósito.

**Não há narração nem trilha sonora.** Para publicar no LinkedIn, sugiro:
- **Trilha:** instrumental.
- **Recorte:** 60 s, com as cenas 1, 2, 4, 5, 6, 9, 11 e 12.
- **Legendas:** as legendas já estão queimadas no vídeo.

---

## 11. Manuais no app (Fase 15)

**Onde estão:** **Configurações → Documentação** (`/app/configuracoes/documentacao`, no menu de todos os perfis) e **Administração Central → Políticas** (Owner).

**Quem vê o quê:**

| Perfil | Manual do Usuário | Manual de Administração |
|---|---|---|
| Qualquer usuário | ✅ | — |
| Gerente | ✅ | — (sem governança) |
| Administrador da empresa (`roles.manage` ou `users.create`) | ✅ | ✅ |
| Owner (Central) | ✅ | ✅ |

**Fonte:** a mesma já publicada. `docs/manual/pdf` (versionado) → `/landing/manuais/*.pdf` (copiado no build). O app aponta para esses arquivos, **sem cópia e sem nova versão**.

**Landing:** continua sem oferecer os manuais; há um teste que garante isso.

**Validação:** 9/9 PASS, com Administrador, Gerente, Somente leitura e Owner; o PDF abre com HTTP 200 `application/pdf`. Evidência: `11-usabilidade/95-manuais-*.png`.

**Observação honesta:** os PDFs são arquivos estáticos públicos (já eram). Esconder o Manual de Administração é uma organização da tela, **não um controle de acesso**.

**Código:** commit `ba4f3d9`, com `src/lib/manuals.ts`, `src/components/settings/ManualsPanel.tsx`, a página nova, o item de menu e `tests/manuals.test.ts`.

---

## 12. Evidências

Pasta `e2e-7-empresas/`:
- **01–12:** capturas por área;
- `resultados.jsonl` (449 verificações, último resultado por teste);
- `state.json` (IDs, sem senhas);
- **rodadas com erro de critério, preservadas:** `resultados-*-rodada1*.jsonl`.

Capturas com campos de senha e links de convite foram **mascaradas**. Credenciais criadas: só no arquivo local `e2e7/CREDENCIAIS-LOCAIS.md` (modo 600, fora do Git).

---

## 13. Conclusão

**O que funciona como ERP multiempresa de verdade:**
- 7 empresas criadas pelo fluxo oficial e 56 pessoas convidadas e ativas;
- papéis de sistema e personalizados aplicados pela API sem nenhuma divergência (931/931);
- **isolamento total** sob 420 tentativas de acesso cruzado, inclusive com o administrador;
- um pedido que atravessa estoque, financeiro, fiscal e logística com o autor correto em cada etapa;
- auditoria sem "system".

**O que impede chamá-lo de pronto para operação real:**
- **B1/B2:** o Comercial e o Fiscal não operam só pela interface;
- **B3/B4:** numeração global e datas em UTC afetam a relação com o cliente e os períodos fiscais;
- **B6/B5:** a primeira tela com erro para três papéis e um aviso de reserva enganoso minam a confiança do usuário;
- **B7:** falta rastreabilidade de criação na tela de auditoria.

**Veredito:** o sistema **se comporta como um ERP multiempresa** no que é estrutural (dados, isolamento, permissões e integração entre módulos). **Não está pronto para uso diário** sem, no mínimo, B1–B8 corrigidos e esta mesma rodada repetida na homologação real (hoje BLOCKED por rede).
